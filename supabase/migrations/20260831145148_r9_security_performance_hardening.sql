-- VECTR R9 — SECURITY AND PERFORMANCE HARDENING
-- Scope is additive and intentionally avoids changing authorization semantics.
-- All statements are idempotent; query-critical existing indexes are left
-- untouched unless explicitly covered by this migration.

BEGIN;

-- Pin trigger/RPC resolution to trusted schemas. These functions reference
-- public tables explicitly, so this removes search_path hijacking risk without
-- changing their behavior or execution privileges.
ALTER FUNCTION public.set_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.start_or_resume_exam_session(uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.submit_and_score_exam_session(uuid)
  SET search_path = pg_catalog, public;

COMMIT;

-- Foreign-key indexes are created separately so a failed index build never
-- rolls back the function hardening above.
CREATE INDEX IF NOT EXISTS candidate_members_candidate_id_idx
  ON public.candidate_members(candidate_id);

CREATE INDEX IF NOT EXISTS exam_section_progress_exam_section_id_idx
  ON public.exam_section_progress(exam_section_id);

CREATE INDEX IF NOT EXISTS exams_created_by_idx
  ON public.exams(created_by);

CREATE INDEX IF NOT EXISTS modules_created_by_idx
  ON public.modules(created_by);

CREATE INDEX IF NOT EXISTS organization_google_integrations_connected_by_idx
  ON public.organization_google_integrations(connected_by);

CREATE INDEX IF NOT EXISTS proctor_client_locks_candidate_id_idx
  ON public.proctor_client_locks(candidate_id);

CREATE INDEX IF NOT EXISTS proctor_events_assignment_id_idx
  ON public.proctor_events(assignment_id);

CREATE INDEX IF NOT EXISTS proctor_events_organization_id_idx
  ON public.proctor_events(organization_id);

CREATE INDEX IF NOT EXISTS proctor_violation_resets_organization_id_idx
  ON public.proctor_violation_resets(organization_id);

CREATE INDEX IF NOT EXISTS score_adjustments_created_by_idx
  ON public.score_adjustments(created_by);

CREATE INDEX IF NOT EXISTS session_questions_exam_section_fk_idx
  ON public.session_questions(exam_section_id);

CREATE INDEX IF NOT EXISTS session_questions_source_question_id_idx
  ON public.session_questions(source_question_id);

CREATE INDEX IF NOT EXISTS exam_section_progress_session_id_idx
  ON public.exam_section_progress(session_id);

-- These are manually-created copies of the indexes already owned by a UNIQUE
-- constraint. Removing only the redundant copies preserves every constraint
-- and keeps INSERT/UPDATE conflict semantics unchanged.
DROP INDEX IF EXISTS public.answers_session_question_unique;
DROP INDEX IF EXISTS public.exam_sessions_assignment_attempt_unique;
DROP INDEX IF EXISTS public.organization_subscriptions_organization_uidx;
DROP INDEX IF EXISTS public.exam_platform_questions_module_code_uidx_r5;
DROP INDEX IF EXISTS public.results_session_unique;
DROP INDEX IF EXISTS public.session_questions_session_order_unique;
