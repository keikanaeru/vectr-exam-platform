BEGIN;

REVOKE EXECUTE
  ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE
  ON FUNCTION public.exam_platform_fill_session_question_id()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE
  ON FUNCTION public.get_my_admin_organizations()
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.get_my_admin_organizations()
  TO authenticated;

COMMIT;
