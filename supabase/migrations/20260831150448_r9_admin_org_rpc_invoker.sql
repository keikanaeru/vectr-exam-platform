-- R9 — admin organization lookup runs as the caller. The underlying RLS
-- policies and private authorization helpers remain the source of truth.
ALTER FUNCTION public.get_my_admin_organizations()
  SECURITY INVOKER;
