-- VECTR R9 — EXPLICIT DENY POLICIES FOR INTERNAL TABLES
-- These tables are intentionally service-role-only. RLS already denied
-- anon/authenticated access by having no policies; explicit deny policies make
-- that contract visible to advisors and future maintainers. service_role is
-- unaffected because it bypasses RLS.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'candidate_login_rate_limits',
    'exam_assignment_sections',
    'exam_section_progress',
    'exam_sections',
    'organization_branding',
    'organization_google_integrations',
    'organization_google_tokens',
    'organization_subscription_events',
    'organization_subscriptions',
    'proctor_client_locks',
    'proctor_events',
    'proctor_violation_resets'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = table_name || '_deny_client_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        table_name || '_deny_client_access',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
