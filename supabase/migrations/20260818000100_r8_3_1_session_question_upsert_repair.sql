-- ============================================================
-- VECTR EXAM PLATFORM R8.3.1
-- SESSION QUESTION UPSERT CONTRACT REPAIR
--
-- Fixes PostgreSQL 42P10:
-- "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification"
--
-- R8.2 provisions session_questions with:
--   ON CONFLICT (session_id, question_id) DO NOTHING
--
-- PostgreSQL/PostgREST needs a NON-PARTIAL unique index that
-- exactly covers (session_id, question_id).
--
-- This migration is additive and does not delete exam data.
-- It aborts before changing anything if duplicate non-null
-- (session_id, question_id) groups already exist.
-- ============================================================

BEGIN;

-- Prevent concurrent provisioning writes while validating/creating the index.
LOCK TABLE public.session_questions IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_duplicate_groups bigint := 0;
BEGIN
  SELECT count(*)
  INTO v_duplicate_groups
  FROM (
    SELECT session_id, question_id
    FROM public.session_questions
    WHERE question_id IS NOT NULL
    GROUP BY session_id, question_id
    HAVING count(*) > 1
  ) duplicate_groups;

  IF v_duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'R8.3.1 aborted: found % duplicate session_questions groups for (session_id, question_id). No data was deleted. Review duplicates before retrying.',
      v_duplicate_groups;
  END IF;
END
$$;

-- Do NOT depend on the historical R6 index name. Some databases may still
-- have the older partial R6 index. A new non-partial index is additive and
-- is directly inferable by ON CONFLICT(session_id,question_id).
CREATE UNIQUE INDEX IF NOT EXISTS exam_platform_session_question_upsert_uidx_r831
  ON public.session_questions(session_id, question_id);

CREATE OR REPLACE FUNCTION public.exam_platform_r831_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_duplicate_groups bigint := 0;
  v_matching_unique boolean := false;
BEGIN
  SELECT count(*)
  INTO v_duplicate_groups
  FROM (
    SELECT session_id, question_id
    FROM public.session_questions
    WHERE question_id IS NOT NULL
    GROUP BY session_id, question_id
    HAVING count(*) > 1
  ) duplicate_groups;

  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = to_regclass('public.session_questions')
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND regexp_replace(
            pg_get_indexdef(i.indexrelid),
            '\s+',
            ' ',
            'g'
          ) ~ '\(session_id, question_id\)'
  )
  INTO v_matching_unique;

  RETURN jsonb_build_object(
    'version', 'R8.3.1-SESSION-QUESTION-UPSERT',
    'ok', v_matching_unique AND v_duplicate_groups = 0,
    'matching_nonpartial_unique_index', v_matching_unique,
    'duplicate_groups', v_duplicate_groups,
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exam_platform_r831_healthcheck() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_platform_r831_healthcheck() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT public.exam_platform_r831_healthcheck() AS vectr_r831_health;
