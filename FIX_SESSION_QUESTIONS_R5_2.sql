-- Exam Platform R5.2 hotfix
-- Fixes the remaining DB contract: public.session_questions.question_id
-- Safe to run repeatedly.

BEGIN;

DO $$
DECLARE
  v_question_id_type text;
BEGIN
  IF to_regclass('public.session_questions') IS NULL THEN
    RAISE EXCEPTION 'public.session_questions does not exist';
  END IF;

  IF to_regclass('public.questions') IS NULL THEN
    RAISE EXCEPTION 'public.questions does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'session_questions'
      AND column_name = 'question_id'
  ) THEN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO v_question_id_type
    FROM pg_attribute a
    WHERE a.attrelid = 'public.questions'::regclass
      AND a.attname = 'id'
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF v_question_id_type IS NULL THEN
      RAISE EXCEPTION 'Cannot determine public.questions.id type';
    END IF;

    EXECUTE format(
      'ALTER TABLE public.session_questions ADD COLUMN question_id %s',
      v_question_id_type
    );
  END IF;
END $$;

-- Backfill historical session questions by the snapshotted question code + exam module.
UPDATE public.session_questions sq
SET question_id = q.id
FROM public.exam_sessions es
JOIN public.exam_assignments ea ON ea.id = es.assignment_id
JOIN public.exams e ON e.id = ea.exam_id
JOIN public.questions q ON q.module_id = e.module_id
WHERE sq.session_id = es.id
  AND sq.question_id IS NULL
  AND NULLIF(sq.question_snapshot ->> 'code', '') IS NOT NULL
  AND q.code = sq.question_snapshot ->> 'code';

CREATE INDEX IF NOT EXISTS exam_platform_session_questions_question_id_idx
  ON public.session_questions(question_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.session_questions'::regclass
      AND conname = 'exam_platform_session_questions_question_id_fkey'
  ) THEN
    ALTER TABLE public.session_questions
      ADD CONSTRAINT exam_platform_session_questions_question_id_fkey
      FOREIGN KEY (question_id)
      REFERENCES public.questions(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Keep future rows compatible even when the legacy start_exam RPC does not explicitly write question_id.
CREATE OR REPLACE FUNCTION public.exam_platform_fill_session_question_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.question_id IS NULL
     AND NEW.session_id IS NOT NULL
     AND NEW.question_snapshot IS NOT NULL THEN
    SELECT q.id
      INTO NEW.question_id
    FROM public.exam_sessions es
    JOIN public.exam_assignments ea ON ea.id = es.assignment_id
    JOIN public.exams e ON e.id = ea.exam_id
    JOIN public.questions q ON q.module_id = e.module_id
    WHERE es.id = NEW.session_id
      AND q.code = NEW.question_snapshot ->> 'code'
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exam_platform_fill_session_question_id_trg
  ON public.session_questions;

CREATE TRIGGER exam_platform_fill_session_question_id_trg
BEFORE INSERT OR UPDATE OF session_id, question_snapshot
ON public.session_questions
FOR EACH ROW
EXECUTE FUNCTION public.exam_platform_fill_session_question_id();

REVOKE ALL ON FUNCTION public.exam_platform_fill_session_question_id() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Re-run the R5.1 health check. Expected: "ok": true, "missing": []
SELECT public.exam_platform_healthcheck() AS exam_platform_health;
