-- VECTR R9 — INDEX COVERAGE FOLLOW-UP
-- Correct the one composite index that does not cover the FK's leading
-- column and remove the duplicate index introduced by the first hardening pass.

CREATE INDEX IF NOT EXISTS session_questions_exam_section_fk_idx
  ON public.session_questions(exam_section_id);

DROP INDEX IF EXISTS public.exam_assignment_sections_exam_section_id_idx;
