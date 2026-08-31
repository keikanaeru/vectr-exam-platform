-- ============================================================
-- VECTR R9 — PER-CANDIDATE REMEDIAL MODULE ASSIGNMENTS
-- Additive migration. Existing exams remain global-section exams.
-- Apply only through the normal migration pipeline; never against production
-- from a development agent session.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_assignment_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.exam_assignments(id) ON DELETE CASCADE,
  exam_section_id uuid NOT NULL REFERENCES public.exam_sections(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_assignment_sections_order_positive CHECK (order_index > 0),
  CONSTRAINT exam_assignment_sections_assignment_section_unique UNIQUE (assignment_id, exam_section_id),
  CONSTRAINT exam_assignment_sections_assignment_order_unique UNIQUE (assignment_id, order_index)
);

CREATE INDEX IF NOT EXISTS exam_assignment_sections_assignment_idx
  ON public.exam_assignment_sections(assignment_id, order_index);
CREATE INDEX IF NOT EXISTS exam_assignment_sections_section_idx
  ON public.exam_assignment_sections(exam_section_id);

ALTER TABLE public.exam_assignment_sections ENABLE ROW LEVEL SECURITY;

-- The application uses the server-side service-role client for tenant-scoped
-- reads/writes. RLS remains enabled as a defence-in-depth default for any
-- future client exposure; no anon/authenticated policy is granted here.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_assignment_sections TO service_role;

-- Replace all overrides for one exam atomically. The action validates the
-- tenant and draft status; this function enforces the exam/assignment/section
-- relationship again so a malformed request can never cross exam boundaries.
CREATE OR REPLACE FUNCTION public.replace_exam_assignment_sections(
  p_exam_id uuid,
  p_rows jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Konfigurasi modul remedial tidak valid.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS row_data
    LEFT JOIN public.exam_assignments a
      ON a.id = (row_data ->> 'assignment_id')::uuid
     AND a.exam_id = p_exam_id
    LEFT JOIN public.exam_sections s
      ON s.id = (row_data ->> 'exam_section_id')::uuid
     AND s.exam_id = p_exam_id
    WHERE a.id IS NULL OR s.id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Assignment atau sesi modul remedial tidak termasuk ujian ini.';
  END IF;

  DELETE FROM public.exam_assignment_sections eas
  USING public.exam_assignments a
  WHERE eas.assignment_id = a.id
    AND a.exam_id = p_exam_id;

  INSERT INTO public.exam_assignment_sections (assignment_id, exam_section_id, order_index)
  SELECT
    (row_data ->> 'assignment_id')::uuid,
    (row_data ->> 'exam_section_id')::uuid,
    greatest(1, (row_data ->> 'order_index')::integer)
  FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS row_data;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_exam_assignment_sections(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_exam_assignment_sections(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.exam_platform_r9_remedial_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  missing_items text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.exam_assignment_sections') IS NULL THEN
    missing_items := array_append(missing_items, 'table:exam_assignment_sections');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exam_assignment_sections'
      AND column_name = 'assignment_id'
  ) THEN
    missing_items := array_append(missing_items, 'column:exam_assignment_sections.assignment_id');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exam_assignment_sections'
      AND column_name = 'exam_section_id'
  ) THEN
    missing_items := array_append(missing_items, 'column:exam_assignment_sections.exam_section_id');
  END IF;
  IF to_regclass('public.exam_assignment_sections_assignment_idx') IS NULL THEN
    missing_items := array_append(missing_items, 'index:exam_assignment_sections.assignment');
  END IF;

  RETURN jsonb_build_object(
    'version', 'R9-REMEDIAL-ASSIGNMENT-SECTIONS',
    'ok', cardinality(missing_items) = 0,
    'missing', to_jsonb(missing_items),
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exam_platform_r9_remedial_healthcheck() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_platform_r9_remedial_healthcheck() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT public.exam_platform_r9_remedial_healthcheck() AS exam_platform_r9_remedial_health;
