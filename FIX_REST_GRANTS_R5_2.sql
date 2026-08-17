-- Exam Platform R5.2 REST / Data API compatibility fix
-- Safe to run repeatedly.
-- Purpose: ensure all tables used by server-side service-role code are reachable through Supabase Data API.

BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'organizations',
    'admin_profiles',
    'organization_members',
    'batches',
    'candidates',
    'modules',
    'questions',
    'exams',
    'exam_assignments',
    'exam_sessions',
    'session_questions',
    'answers',
    'results',
    'proctor_events',
    'proctor_client_locks',
    'proctor_violation_resets',
    'candidate_login_rate_limits',
    'exam_email_campaigns',
    'exam_email_deliveries',
    'organization_branding',
    'exam_sections',
    'exam_section_progress'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
        v_table
      );
    END IF;
  END LOOP;
END $$;

-- Keep server-side inserts compatible with any identity/serial sequences already present.
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Healthcheck and core RPCs used by the app/pre-flight.
GRANT EXECUTE ON FUNCTION public.exam_platform_healthcheck() TO service_role;
GRANT EXECUTE ON FUNCTION public.exam_platform_r6_healthcheck() TO service_role;

-- Reload PostgREST metadata after grants/schema changes.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Diagnostic: every row should return can_select = true.
WITH source_tables(table_name) AS (
  VALUES
    ('organizations'),
    ('admin_profiles'),
    ('organization_members'),
    ('batches'),
    ('candidates'),
    ('modules'),
    ('questions'),
    ('exams'),
    ('exam_assignments'),
    ('exam_sessions'),
    ('session_questions'),
    ('answers'),
    ('results'),
    ('proctor_events'),
    ('proctor_client_locks'),
    ('proctor_violation_resets'),
    ('candidate_login_rate_limits'),
    ('exam_email_campaigns'),
    ('exam_email_deliveries'),
    ('organization_branding'),
    ('exam_sections'),
    ('exam_section_progress')
)
SELECT
  table_name,
  has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') AS can_select,
  has_table_privilege('service_role', format('public.%I', table_name), 'INSERT') AS can_insert,
  has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE') AS can_update,
  has_table_privilege('service_role', format('public.%I', table_name), 'DELETE') AS can_delete
FROM source_tables
ORDER BY table_name;

SELECT public.exam_platform_healthcheck() AS exam_platform_health;
