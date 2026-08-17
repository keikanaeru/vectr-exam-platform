-- ================================================================
-- EXAM PLATFORM R7.1 — SUBSCRIPTION DATABASE REPAIR / COMPATIBILITY
-- ================================================================
-- Aman dijalankan berulang kali.
-- Tujuan:
-- 1) memastikan tabel subscription tersedia,
-- 2) memperbaiki instalasi R7 yang berhenti di tengah,
-- 3) backfill semua organisasi lama,
-- 4) memastikan service_role dapat membaca lewat Supabase Data API,
-- 5) refresh PostgREST schema cache,
-- 6) menampilkan satu payload hasil akhir untuk verifikasi.
-- ================================================================

create extension if not exists pgcrypto;

grant usage on schema public to service_role;

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_code text not null default 'MONTHLY_FULL',
  access_started_at timestamptz not null default now(),
  access_until timestamptz not null,
  retention_until timestamptz not null,
  suspended_at timestamptz null,
  suspension_reason text null,
  last_renewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Repair-safe column additions in case an earlier migration stopped midway.
alter table public.organization_subscriptions add column if not exists plan_code text;
alter table public.organization_subscriptions add column if not exists access_started_at timestamptz;
alter table public.organization_subscriptions add column if not exists access_until timestamptz;
alter table public.organization_subscriptions add column if not exists retention_until timestamptz;
alter table public.organization_subscriptions add column if not exists suspended_at timestamptz;
alter table public.organization_subscriptions add column if not exists suspension_reason text;
alter table public.organization_subscriptions add column if not exists last_renewed_at timestamptz;
alter table public.organization_subscriptions add column if not exists created_at timestamptz;
alter table public.organization_subscriptions add column if not exists updated_at timestamptz;

update public.organization_subscriptions
set
  plan_code = coalesce(plan_code, 'MONTHLY_FULL'),
  access_started_at = coalesce(access_started_at, now()),
  access_until = coalesce(access_until, now() + interval '30 days'),
  retention_until = coalesce(retention_until, coalesce(access_until, now() + interval '30 days') + interval '90 days'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.organization_subscriptions alter column plan_code set default 'MONTHLY_FULL';
alter table public.organization_subscriptions alter column access_started_at set default now();
alter table public.organization_subscriptions alter column created_at set default now();
alter table public.organization_subscriptions alter column updated_at set default now();
alter table public.organization_subscriptions alter column plan_code set not null;
alter table public.organization_subscriptions alter column access_started_at set not null;
alter table public.organization_subscriptions alter column access_until set not null;
alter table public.organization_subscriptions alter column retention_until set not null;
alter table public.organization_subscriptions alter column created_at set not null;
alter table public.organization_subscriptions alter column updated_at set not null;

create unique index if not exists organization_subscriptions_organization_uidx
  on public.organization_subscriptions(organization_id);
create index if not exists organization_subscriptions_access_until_idx
  on public.organization_subscriptions(access_until);
create index if not exists organization_subscriptions_retention_until_idx
  on public.organization_subscriptions(retention_until);

create table if not exists public.organization_subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid null,
  previous_access_until timestamptz null,
  new_access_until timestamptz null,
  note text null,
  created_at timestamptz not null default now()
);

alter table public.organization_subscription_events add column if not exists event_type text;
alter table public.organization_subscription_events add column if not exists actor_user_id uuid;
alter table public.organization_subscription_events add column if not exists previous_access_until timestamptz;
alter table public.organization_subscription_events add column if not exists new_access_until timestamptz;
alter table public.organization_subscription_events add column if not exists note text;
alter table public.organization_subscription_events add column if not exists created_at timestamptz;
update public.organization_subscription_events set created_at = coalesce(created_at, now());
alter table public.organization_subscription_events alter column created_at set default now();
alter table public.organization_subscription_events alter column created_at set not null;

create index if not exists organization_subscription_events_org_created_idx
  on public.organization_subscription_events(organization_id, created_at desc);

-- Recreate lightweight checks only when they do not already exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_subscriptions'::regclass
      and conname = 'organization_subscriptions_plan_check'
  ) then
    alter table public.organization_subscriptions
      add constraint organization_subscriptions_plan_check
      check (plan_code in ('MONTHLY_FULL')) not valid;
    alter table public.organization_subscriptions
      validate constraint organization_subscriptions_plan_check;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization_subscriptions'::regclass
      and conname = 'organization_subscriptions_window_check'
  ) then
    alter table public.organization_subscriptions
      add constraint organization_subscriptions_window_check
      check (retention_until > access_until) not valid;
    alter table public.organization_subscriptions
      validate constraint organization_subscriptions_window_check;
  end if;
end;
$$;

alter table public.organization_subscriptions enable row level security;
alter table public.organization_subscription_events enable row level security;

grant select, insert, update, delete on public.organization_subscriptions to service_role;
grant select, insert, update, delete on public.organization_subscription_events to service_role;

-- Every existing organization gets a 30-day FULL window from repair time if missing.
insert into public.organization_subscriptions (
  organization_id,
  plan_code,
  access_started_at,
  access_until,
  retention_until,
  last_renewed_at
)
select
  o.id,
  'MONTHLY_FULL',
  now(),
  now() + interval '30 days',
  now() + interval '120 days',
  now()
from public.organizations o
where not exists (
  select 1 from public.organization_subscriptions s where s.organization_id = o.id
);

create or replace function public.exam_platform_create_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_subscriptions (
    organization_id, plan_code, access_started_at, access_until, retention_until, last_renewed_at
  ) values (
    new.id, 'MONTHLY_FULL', now(), now() + interval '30 days', now() + interval '120 days', now()
  )
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists exam_platform_default_subscription_after_org_insert on public.organizations;
create trigger exam_platform_default_subscription_after_org_insert
after insert on public.organizations
for each row execute function public.exam_platform_create_default_subscription();

revoke all on function public.exam_platform_create_default_subscription() from public;
grant execute on function public.exam_platform_create_default_subscription() to service_role;

create or replace function public.exam_platform_subscription_state(
  p_organization_id uuid,
  p_at timestamptz default now()
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when s.suspended_at is not null then 'SUSPENDED'
      when p_at < s.access_until then 'FULL'
      when p_at < s.retention_until then 'EXPORT_ONLY'
      else 'PURGE_DUE'
    end
    from public.organization_subscriptions s
    where s.organization_id = p_organization_id
  ), 'MISSING');
$$;

revoke all on function public.exam_platform_subscription_state(uuid, timestamptz) from public;
grant execute on function public.exam_platform_subscription_state(uuid, timestamptz) to service_role;

create or replace function public.exam_platform_renew_subscription_30d(
  p_organization_id uuid,
  p_actor_user_id uuid default null
)
returns public.organization_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.organization_subscriptions;
  previous_end timestamptz;
  new_end timestamptz;
begin
  select * into current_row
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    insert into public.organization_subscriptions (
      organization_id, plan_code, access_started_at, access_until, retention_until, last_renewed_at
    ) values (
      p_organization_id, 'MONTHLY_FULL', now(), now() + interval '30 days', now() + interval '120 days', now()
    )
    returning * into current_row;
  end if;

  previous_end := current_row.access_until;
  new_end := greatest(current_row.access_until, now()) + interval '30 days';

  update public.organization_subscriptions
  set
    access_started_at = case when current_row.access_until <= now() then now() else access_started_at end,
    access_until = new_end,
    retention_until = new_end + interval '90 days',
    suspended_at = null,
    suspension_reason = null,
    last_renewed_at = now(),
    updated_at = now()
  where organization_id = p_organization_id
  returning * into current_row;

  insert into public.organization_subscription_events (
    organization_id, event_type, actor_user_id, previous_access_until, new_access_until, note
  ) values (
    p_organization_id, 'RENEWED', p_actor_user_id, previous_end, new_end, 'Perpanjangan 30 hari'
  );

  return current_row;
end;
$$;

revoke all on function public.exam_platform_renew_subscription_30d(uuid, uuid) from public;
grant execute on function public.exam_platform_renew_subscription_30d(uuid, uuid) to service_role;

create or replace function public.exam_platform_r7_healthcheck()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  missing text[] := array[]::text[];
  item record;
begin
  for item in
    select * from (values
      ('organization_subscriptions','organization_id'),
      ('organization_subscriptions','plan_code'),
      ('organization_subscriptions','access_started_at'),
      ('organization_subscriptions','access_until'),
      ('organization_subscriptions','retention_until'),
      ('organization_subscriptions','suspended_at'),
      ('organization_subscriptions','suspension_reason'),
      ('organization_subscriptions','last_renewed_at'),
      ('organization_subscription_events','organization_id'),
      ('organization_subscription_events','event_type'),
      ('organization_subscription_events','created_at')
    ) as required(table_name, column_name)
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = item.table_name
        and c.column_name = item.column_name
    ) then
      missing := array_append(missing, 'column:' || item.table_name || '.' || item.column_name);
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'organizations'
      and t.tgname = 'exam_platform_default_subscription_after_org_insert'
      and not t.tgisinternal
  ) then
    missing := array_append(missing, 'trigger:exam_platform_default_subscription_after_org_insert');
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'organization_subscriptions'
      and c.relrowsecurity = true
  ) then
    missing := array_append(missing, 'rls:organization_subscriptions');
  end if;

  if exists (
    select 1 from public.organization_subscriptions s
    where s.retention_until <= s.access_until
  ) then
    missing := array_append(missing, 'data:invalid_subscription_window');
  end if;

  if to_regprocedure('public.exam_platform_subscription_state(uuid,timestamptz)') is null then
    missing := array_append(missing, 'function:exam_platform_subscription_state');
  end if;
  if to_regprocedure('public.exam_platform_renew_subscription_30d(uuid,uuid)') is null then
    missing := array_append(missing, 'function:exam_platform_renew_subscription_30d');
  end if;

  if exists (
    select 1 from public.organizations o
    where not exists (
      select 1 from public.organization_subscriptions s where s.organization_id = o.id
    )
  ) then
    missing := array_append(missing, 'data:organization_without_subscription');
  end if;

  if not has_table_privilege('service_role', 'public.organization_subscriptions', 'SELECT') then
    missing := array_append(missing, 'grant:service_role.organization_subscriptions.select');
  end if;
  if not has_table_privilege('service_role', 'public.organization_subscription_events', 'SELECT') then
    missing := array_append(missing, 'grant:service_role.organization_subscription_events.select');
  end if;

  return jsonb_build_object(
    'version', 'R7.1-SUBSCRIPTION',
    'ok', cardinality(missing) = 0,
    'missing', to_jsonb(missing),
    'organization_count', (select count(*) from public.organizations),
    'subscription_count', (select count(*) from public.organization_subscriptions),
    'retention_days', 90,
    'billing_interval_days', 30
  );
end;
$$;

revoke all on function public.exam_platform_r7_healthcheck() from public;
grant execute on function public.exam_platform_r7_healthcheck() to service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

select jsonb_build_object(
  'table_exists', to_regclass('public.organization_subscriptions') is not null,
  'events_table_exists', to_regclass('public.organization_subscription_events') is not null,
  'service_role_select_subscription', has_table_privilege('service_role', 'public.organization_subscriptions', 'SELECT'),
  'service_role_select_events', has_table_privilege('service_role', 'public.organization_subscription_events', 'SELECT'),
  'health', public.exam_platform_r7_healthcheck()
) as r7_1_subscription_repair;
