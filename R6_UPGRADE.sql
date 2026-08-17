-- ============================================================
-- EXAM PLATFORM R6 — ACCESSIBILITY, BRANDING & MULTI-SECTION
-- Safe to run repeatedly after FINAL_SETUP R5.x.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_branding (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name text,
  logo_path text,
  show_powered_by boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE RESTRICT,
  order_index integer NOT NULL,
  duration_minutes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_sections_order_positive CHECK (order_index > 0),
  CONSTRAINT exam_sections_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT exam_sections_exam_order_unique UNIQUE (exam_id, order_index),
  CONSTRAINT exam_sections_exam_module_unique UNIQUE (exam_id, module_id)
);

CREATE INDEX IF NOT EXISTS exam_sections_exam_id_idx ON public.exam_sections(exam_id, order_index);
CREATE INDEX IF NOT EXISTS exam_sections_module_id_idx ON public.exam_sections(module_id);

ALTER TABLE public.session_questions
  ADD COLUMN IF NOT EXISTS exam_section_id uuid REFERENCES public.exam_sections(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS session_questions_exam_section_id_idx
  ON public.session_questions(session_id, exam_section_id, order_index);

-- A question may exist only once in a candidate session. This also makes
-- multi-section provisioning safe when Start is clicked twice concurrently.
-- Existing data is never deleted automatically; if legacy duplicates exist,
-- the R6 healthcheck will keep the release red until they are reviewed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.session_questions
    WHERE question_id IS NOT NULL
    GROUP BY session_id, question_id
    HAVING count(*) > 1
  ) THEN
    -- Non-partial unique index: PostgreSQL still allows multiple NULL question_id values,
    -- while Data API ON CONFLICT(session_id,question_id) can infer this index correctly.
    IF EXISTS (
      SELECT 1 FROM pg_index
      WHERE indexrelid = to_regclass('public.exam_platform_session_question_unique_r6')
        AND indpred IS NOT NULL
    ) THEN
      DROP INDEX public.exam_platform_session_question_unique_r6;
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS exam_platform_session_question_unique_r6
      ON public.session_questions(session_id, question_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.exam_section_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  exam_section_id uuid NOT NULL REFERENCES public.exam_sections(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING',
  started_at timestamptz,
  deadline_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_section_progress_unique UNIQUE (session_id, exam_section_id),
  CONSTRAINT exam_section_progress_status_check CHECK (status IN ('PENDING','ACTIVE','COMPLETED','TIMED_OUT'))
);

CREATE INDEX IF NOT EXISTS exam_section_progress_session_idx
  ON public.exam_section_progress(session_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS exam_section_progress_one_active_r6
  ON public.exam_section_progress(session_id)
  WHERE status = 'ACTIVE';

-- Existing exams automatically become one-section exams.
INSERT INTO public.exam_sections (exam_id, module_id, order_index, duration_minutes)
SELECT e.id, e.module_id, 1, GREATEST(COALESCE(e.duration_minutes, 1), 1)
FROM public.exams e
WHERE NOT EXISTS (
  SELECT 1 FROM public.exam_sections es WHERE es.exam_id = e.id
)
ON CONFLICT DO NOTHING;

-- Tag existing session questions to the matching/first section.
UPDATE public.session_questions sq
SET exam_section_id = es.id
FROM public.exam_sessions ses
JOIN public.exam_assignments ea ON ea.id = ses.assignment_id
JOIN public.exam_sections es ON es.exam_id = ea.exam_id AND es.order_index = 1
WHERE sq.session_id = ses.id
  AND sq.exam_section_id IS NULL;

-- Backfill progress for historical sessions.
INSERT INTO public.exam_section_progress (
  session_id, exam_section_id, status, started_at, deadline_at, completed_at
)
SELECT
  ses.id,
  es.id,
  CASE
    WHEN ses.status = 'SUBMITTED' THEN 'COMPLETED'
    WHEN es.order_index = 1 AND ses.status = 'ACTIVE' THEN 'ACTIVE'
    ELSE 'PENDING'
  END,
  CASE WHEN es.order_index = 1 THEN ses.started_at ELSE NULL END,
  CASE
    WHEN es.order_index = 1 AND ses.started_at IS NOT NULL THEN
      LEAST(
        ses.deadline_at,
        ses.started_at + make_interval(mins => es.duration_minutes)
      )
    ELSE NULL
  END,
  CASE WHEN ses.status = 'SUBMITTED' THEN COALESCE(ses.submitted_at, ses.updated_at) ELSE NULL END
FROM public.exam_sessions ses
JOIN public.exam_assignments ea ON ea.id = ses.assignment_id
JOIN public.exam_sections es ON es.exam_id = ea.exam_id
ON CONFLICT (session_id, exam_section_id) DO NOTHING;

-- Public logo bucket. Upload itself remains server-side service-role only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exam-branding',
  'exam-branding',
  true,
  524288,
  ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.organization_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_section_progress ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_branding TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_sections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_section_progress TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

CREATE OR REPLACE FUNCTION public.exam_platform_r6_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  missing_items text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.organization_branding') IS NULL THEN missing_items := array_append(missing_items, 'table:organization_branding'); END IF;
  IF to_regclass('public.exam_sections') IS NULL THEN missing_items := array_append(missing_items, 'table:exam_sections'); END IF;
  IF to_regclass('public.exam_section_progress') IS NULL THEN missing_items := array_append(missing_items, 'table:exam_section_progress'); END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='session_questions' AND column_name='exam_section_id') THEN
    missing_items := array_append(missing_items, 'column:session_questions.exam_section_id');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_branding' AND column_name='organization_id') THEN missing_items := array_append(missing_items, 'column:organization_branding.organization_id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_branding' AND column_name='display_name') THEN missing_items := array_append(missing_items, 'column:organization_branding.display_name'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_branding' AND column_name='logo_path') THEN missing_items := array_append(missing_items, 'column:organization_branding.logo_path'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_branding' AND column_name='show_powered_by') THEN missing_items := array_append(missing_items, 'column:organization_branding.show_powered_by'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_branding' AND column_name='updated_at') THEN missing_items := array_append(missing_items, 'column:organization_branding.updated_at'); END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_sections' AND column_name='id') THEN missing_items := array_append(missing_items, 'column:exam_sections.id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_sections' AND column_name='exam_id') THEN missing_items := array_append(missing_items, 'column:exam_sections.exam_id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_sections' AND column_name='module_id') THEN missing_items := array_append(missing_items, 'column:exam_sections.module_id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_sections' AND column_name='order_index') THEN missing_items := array_append(missing_items, 'column:exam_sections.order_index'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_sections' AND column_name='duration_minutes') THEN missing_items := array_append(missing_items, 'column:exam_sections.duration_minutes'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_sections' AND column_name='created_at') THEN missing_items := array_append(missing_items, 'column:exam_sections.created_at'); END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_section_progress' AND column_name='id') THEN missing_items := array_append(missing_items, 'column:exam_section_progress.id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_section_progress' AND column_name='session_id') THEN missing_items := array_append(missing_items, 'column:exam_section_progress.session_id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_section_progress' AND column_name='exam_section_id') THEN missing_items := array_append(missing_items, 'column:exam_section_progress.exam_section_id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_section_progress' AND column_name='status') THEN missing_items := array_append(missing_items, 'column:exam_section_progress.status'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_section_progress' AND column_name='started_at') THEN missing_items := array_append(missing_items, 'column:exam_section_progress.started_at'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_section_progress' AND column_name='deadline_at') THEN missing_items := array_append(missing_items, 'column:exam_section_progress.deadline_at'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_section_progress' AND column_name='completed_at') THEN missing_items := array_append(missing_items, 'column:exam_section_progress.completed_at'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_section_progress' AND column_name='updated_at') THEN missing_items := array_append(missing_items, 'column:exam_section_progress.updated_at'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = to_regclass('public.exam_platform_session_question_unique_r6')
      AND indisunique
      AND indpred IS NULL
  ) THEN
    missing_items := array_append(missing_items, 'index:session_questions(session_id,question_id)');
  END IF;
  IF to_regclass('public.exam_section_progress_one_active_r6') IS NULL THEN
    missing_items := array_append(missing_items, 'index:exam_section_progress.one_active');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.exam_sections')
      AND contype = 'u'
      AND conname = 'exam_sections_exam_order_unique'
  ) THEN
    missing_items := array_append(missing_items, 'constraint:exam_sections(exam_id,order_index)');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.exam_sections')
      AND contype = 'u'
      AND conname = 'exam_sections_exam_module_unique'
  ) THEN
    missing_items := array_append(missing_items, 'constraint:exam_sections(exam_id,module_id)');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'exam-branding' AND public = true
  ) THEN
    missing_items := array_append(missing_items, 'storage_bucket:exam-branding');
  END IF;

  RETURN jsonb_build_object(
    'version', 'R6',
    'ok', cardinality(missing_items) = 0,
    'missing', to_jsonb(missing_items),
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exam_platform_r6_healthcheck() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_platform_r6_healthcheck() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT public.exam_platform_r6_healthcheck() AS exam_platform_r6_health;

SELECT
  to_regclass('public.organization_branding') IS NOT NULL AS branding_ready,
  to_regclass('public.exam_sections') IS NOT NULL AS sections_ready,
  to_regclass('public.exam_section_progress') IS NOT NULL AS progress_ready,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='session_questions' AND column_name='exam_section_id'
  ) AS session_question_section_ready;
