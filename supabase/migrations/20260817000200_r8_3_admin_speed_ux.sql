-- ============================================================
-- VECTR Exam Platform R8.3 - Admin Speed & UX
-- Fast service-role auth directory lookups for Platform Owner.
-- ============================================================

create or replace function public.exam_platform_admin_auth_directory()
returns table (
  id uuid,
  email text,
  confirmed boolean,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    coalesce(u.email, '')::text as email,
    (u.email_confirmed_at is not null) as confirmed,
    u.last_sign_in_at
  from auth.users as u
  order by u.created_at asc;
$$;

revoke all on function public.exam_platform_admin_auth_directory() from public;
revoke all on function public.exam_platform_admin_auth_directory() from anon;
revoke all on function public.exam_platform_admin_auth_directory() from authenticated;
grant execute on function public.exam_platform_admin_auth_directory() to service_role;

create or replace function public.exam_platform_find_auth_user_by_email(p_email text)
returns table (
  id uuid,
  email text,
  email_confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    coalesce(u.email, '')::text as email,
    u.email_confirmed_at
  from auth.users as u
  where lower(coalesce(u.email, '')) = lower(trim(coalesce(p_email, '')))
  limit 1;
$$;

revoke all on function public.exam_platform_find_auth_user_by_email(text) from public;
revoke all on function public.exam_platform_find_auth_user_by_email(text) from anon;
revoke all on function public.exam_platform_find_auth_user_by_email(text) from authenticated;
grant execute on function public.exam_platform_find_auth_user_by_email(text) to service_role;

-- Smoke-test marker used by npm run verify.
create or replace function public.exam_platform_r83_healthcheck()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 'R8.3-ADMIN-SPEED',
    'ok',
      to_regprocedure('public.exam_platform_admin_auth_directory()') is not null
      and to_regprocedure('public.exam_platform_find_auth_user_by_email(text)') is not null,
    'missing',
      array_remove(array[
        case when to_regprocedure('public.exam_platform_admin_auth_directory()') is null then 'rpc:exam_platform_admin_auth_directory' end,
        case when to_regprocedure('public.exam_platform_find_auth_user_by_email(text)') is null then 'rpc:exam_platform_find_auth_user_by_email' end
      ], null)
  );
$$;

revoke all on function public.exam_platform_r83_healthcheck() from public;
revoke all on function public.exam_platform_r83_healthcheck() from anon;
revoke all on function public.exam_platform_r83_healthcheck() from authenticated;
grant execute on function public.exam_platform_r83_healthcheck() to service_role;
