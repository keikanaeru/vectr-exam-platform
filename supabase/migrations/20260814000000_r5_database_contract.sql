-- ============================================================
-- EXAM PLATFORM FINAL - DATABASE PATCH
-- ============================================================
-- Jalankan file ini SEKALI di Supabase SQL Editor.
-- Aman dijalankan ulang karena menggunakan IF NOT EXISTS.

create table if not exists public.proctor_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  assignment_id uuid not null references public.exam_assignments(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  event_type text not null,
  severity text not null default 'WARNING',
  policy_action text,
  counted boolean,
  idempotency_key text,
  detail jsonb not null default '{}'::jsonb,
  client_event_at timestamptz,
  created_at timestamptz not null default now(),
  constraint proctor_events_event_type_check check (
    event_type in (
      'TAB_HIDDEN','WINDOW_BLUR','FULLSCREEN_EXIT','PRINT_SCREEN',
      'BLOCKED_SHORTCUT','COPY_PASTE','CONTEXT_MENU','DUPLICATE_TAB',
      'MULTIPLE_DEVICE',
      'OFFLINE','PAGE_LEAVE'
    )
  ),
  constraint proctor_events_severity_check check (severity in ('INFO','WARNING','CRITICAL')),
  constraint proctor_events_policy_action_check check (policy_action is null or policy_action in ('LOG','COUNT','SUBMIT'))
);

alter table public.proctor_events drop constraint if exists proctor_events_event_type_check;
alter table public.proctor_events add constraint proctor_events_event_type_check check (
  event_type in (
    'TAB_HIDDEN','WINDOW_BLUR','FULLSCREEN_EXIT','PRINT_SCREEN',
    'BLOCKED_SHORTCUT','COPY_PASTE','CONTEXT_MENU','DUPLICATE_TAB',
    'MULTIPLE_DEVICE','OFFLINE','PAGE_LEAVE'
  )
);

alter table public.proctor_events add column if not exists policy_action text;
alter table public.proctor_events add column if not exists counted boolean;
alter table public.proctor_events add column if not exists client_event_at timestamptz;
alter table public.proctor_events drop constraint if exists proctor_events_policy_action_check;
alter table public.proctor_events add constraint proctor_events_policy_action_check
  check (policy_action is null or policy_action in ('LOG','COUNT','SUBMIT'));

create unique index if not exists proctor_events_idempotency_key_uidx
  on public.proctor_events(idempotency_key)
  where idempotency_key is not null;
create index if not exists proctor_events_exam_created_idx
  on public.proctor_events(exam_id, created_at desc);
create index if not exists proctor_events_session_created_idx
  on public.proctor_events(session_id, created_at desc);
create index if not exists proctor_events_candidate_created_idx
  on public.proctor_events(candidate_id, created_at desc);

alter table public.proctor_events enable row level security;

create table if not exists public.proctor_client_locks (
  session_id uuid primary key references public.exam_sessions(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  client_id text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists proctor_client_locks_exam_idx
  on public.proctor_client_locks(exam_id, last_seen_at desc);

alter table public.proctor_client_locks enable row level security;

create table if not exists public.proctor_violation_resets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists proctor_violation_resets_session_idx
  on public.proctor_violation_resets(session_id, created_at desc);

create index if not exists proctor_violation_resets_exam_idx
  on public.proctor_violation_resets(exam_id, created_at desc);

alter table public.proctor_violation_resets enable row level security;

-- ============================================================
-- CANDIDATE LOGIN RATE LIMIT
-- ============================================================
create table if not exists public.candidate_login_rate_limits (
  scope_hash text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists candidate_login_rate_limits_updated_idx
  on public.candidate_login_rate_limits(updated_at desc);

alter table public.candidate_login_rate_limits enable row level security;

-- ============================================================
-- R5 COMMUNICATION STORAGE CONTRACT
-- ============================================================
-- Source Communication memakai dua tabel ini. Release lama tidak pernah
-- membawa schema-nya, sehingga fitur bisa baru gagal saat tombol dipakai.

create table if not exists public.exam_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  name text not null,
  subject_template text not null,
  body_template text not null,
  send_mode text not null default 'NOW',
  scheduled_at timestamptz null,
  status text not null default 'DRAFT',
  settings jsonb not null default '{}'::jsonb,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exam_email_campaigns
  add column if not exists organization_id uuid,
  add column if not exists exam_id uuid,
  add column if not exists created_by uuid,
  add column if not exists name text,
  add column if not exists subject_template text,
  add column if not exists body_template text,
  add column if not exists send_mode text default 'NOW',
  add column if not exists scheduled_at timestamptz,
  add column if not exists status text default 'DRAFT',
  add column if not exists settings jsonb default '{}'::jsonb,
  add column if not exists sent_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.exam_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.exam_email_campaigns(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  recipient_name text not null,
  recipient_email text not null,
  subject_rendered text not null,
  body_rendered text not null,
  status text not null default 'PENDING',
  attempt_count integer not null default 0,
  provider_message_id text null,
  last_error text null,
  processing_at timestamptz null,
  next_attempt_at timestamptz null,
  sent_at timestamptz null,
  failed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exam_email_deliveries
  add column if not exists campaign_id uuid,
  add column if not exists organization_id uuid,
  add column if not exists exam_id uuid,
  add column if not exists candidate_id uuid,
  add column if not exists recipient_name text,
  add column if not exists recipient_email text,
  add column if not exists subject_rendered text,
  add column if not exists body_rendered text,
  add column if not exists status text default 'PENDING',
  add column if not exists attempt_count integer default 0,
  add column if not exists provider_message_id text,
  add column if not exists last_error text,
  add column if not exists processing_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.exam_email_campaigns alter column created_at set default now();
alter table public.exam_email_campaigns alter column updated_at set default now();
alter table public.exam_email_deliveries alter column attempt_count set default 0;
alter table public.exam_email_deliveries alter column created_at set default now();
alter table public.exam_email_deliveries alter column updated_at set default now();

create index if not exists exam_email_campaigns_exam_created_idx
  on public.exam_email_campaigns(exam_id, created_at desc);
create index if not exists exam_email_campaigns_org_status_idx
  on public.exam_email_campaigns(organization_id, status);
create index if not exists exam_email_deliveries_campaign_status_created_idx
  on public.exam_email_deliveries(campaign_id, status, created_at);
create index if not exists exam_email_deliveries_exam_status_idx
  on public.exam_email_deliveries(exam_id, status);

alter table public.exam_email_campaigns enable row level security;
alter table public.exam_email_deliveries enable row level security;

-- ============================================================
-- R5 CORE STATE / ENUM / CHECK COMPATIBILITY
-- ============================================================
-- Menormalisasi state machine yang benar-benar ditulis source. Ini adalah fix
-- utama untuk kasus Modul DRAFT terbaca normal tetapi UPDATE -> ACTIVE ditolak DB.
DO $$
DECLARE
  v_table text;
  v_column text;
  v_values text[];
  v_attnum smallint;
  v_typtype "char";
  v_type_schema text;
  v_type_name text;
  v_constraint record;
  v_constraint_name text;
  v_check_sql text;
  v_value text;
  v_all_expected boolean;
BEGIN
  FOR v_table, v_column, v_values IN
    SELECT * FROM (VALUES
      ('admin_profiles', 'role', ARRAY['ADMIN']::text[]),
      ('organization_members', 'role', ARRAY['ADMIN']::text[]),
      ('modules', 'status', ARRAY['DRAFT','ACTIVE','INACTIVE']::text[]),
      ('questions', 'status', ARRAY['ACTIVE','INACTIVE']::text[]),
      ('batches', 'status', ARRAY['ACTIVE','INACTIVE']::text[]),
      ('exams', 'status', ARRAY['DRAFT','ACTIVE','CLOSED']::text[]),
      ('exam_sessions', 'status', ARRAY['ACTIVE','SUBMITTED']::text[]),
      ('candidates', 'candidate_type', ARRAY['INDIVIDUAL']::text[]),
      ('exam_email_campaigns', 'send_mode', ARRAY['NOW','SCHEDULED']::text[]),
      ('exam_email_campaigns', 'status', ARRAY['DRAFT','SENDING','SENT','SCHEDULED','FAILED','PARTIAL']::text[]),
      ('exam_email_deliveries', 'status', ARRAY['PENDING','PROCESSING','SCHEDULED','SENT','FAILED']::text[])
    ) AS expected(table_name, column_name, allowed_values)
  LOOP
    v_attnum := NULL;
    v_typtype := NULL;
    v_type_schema := NULL;
    v_type_name := NULL;
    v_all_expected := false;

    SELECT a.attnum, t.typtype, tn.nspname, t.typname
      INTO v_attnum, v_typtype, v_type_schema, v_type_name
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace cn ON cn.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    JOIN pg_namespace tn ON tn.oid = t.typnamespace
    WHERE cn.nspname = 'public'
      AND c.relname = v_table
      AND a.attname = v_column
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF v_attnum IS NULL THEN
      RAISE NOTICE 'R5 compatibility: %.% tidak ditemukan, dilewati.', v_table, v_column;
      CONTINUE;
    END IF;

    IF v_typtype = 'e' THEN
      FOREACH v_value IN ARRAY v_values LOOP
        EXECUTE format(
          'ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L',
          v_type_schema, v_type_name, v_value
        );
      END LOOP;
    END IF;

    -- Hanya drop CHECK satu-kolom yang jelas menolak state source.
    FOR v_constraint IN
      SELECT con.oid, con.conname, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND con.contype = 'c'
        AND array_length(con.conkey, 1) = 1
        AND v_attnum = ANY(con.conkey)
    LOOP
      IF EXISTS (
        SELECT 1 FROM unnest(v_values) expected_value
        WHERE position(upper(quote_literal(expected_value)) in upper(v_constraint.definition)) = 0
      ) THEN
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_constraint.conname);
      END IF;
    END LOOP;

    -- Kalau semua existing row sudah memakai state source, pasang guard baru.
    -- Kalau masih ada legacy state lain, jangan hapus datanya dan jangan paksa check baru.
    EXECUTE format(
      'SELECT NOT EXISTS (
         SELECT 1 FROM public.%I
         WHERE %I IS NOT NULL AND NOT (%I::text = ANY($1))
       )',
      v_table, v_column, v_column
    ) INTO v_all_expected USING v_values;

    v_constraint_name := format('exam_platform_%s_%s_check_r5', v_table, v_column);

    IF NOT v_all_expected THEN
      IF EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class c ON c.oid=con.conrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_table AND con.conname=v_constraint_name
      ) THEN
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_constraint_name);
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class c ON c.oid=con.conrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=v_table AND con.conname=v_constraint_name
      ) THEN
        SELECT string_agg(quote_literal(x), ',') INTO v_check_sql FROM unnest(v_values) x;
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I::text IN (%s)) NOT VALID',
          v_table, v_constraint_name, v_column, v_check_sql
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- R5 NULLABILITY / DEFAULT CONTRACT REPAIR
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.answers') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='answers' AND column_name='selected_option_id') THEN
      ALTER TABLE public.answers ALTER COLUMN selected_option_id DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='answers' AND column_name='answered_at') THEN
      ALTER TABLE public.answers ALTER COLUMN answered_at DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='answers' AND column_name='flagged') THEN
      ALTER TABLE public.answers ALTER COLUMN flagged SET DEFAULT false;
    END IF;
  END IF;

  IF to_regclass('public.exam_assignments') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_assignments' AND column_name='access_code_hash') THEN
      ALTER TABLE public.exam_assignments ALTER COLUMN access_code_hash DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_assignments' AND column_name='access_code_ciphertext') THEN
      ALTER TABLE public.exam_assignments ALTER COLUMN access_code_ciphertext DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_assignments' AND column_name='access_code_generated_at') THEN
      ALTER TABLE public.exam_assignments ALTER COLUMN access_code_generated_at DROP NOT NULL;
    END IF;
  END IF;

  -- Field yang memang optional di form/source tidak boleh memblok INSERT/UPDATE.
  IF to_regclass('public.candidates') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='external_identifier') THEN
      ALTER TABLE public.candidates ALTER COLUMN external_identifier DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='email') THEN
      ALTER TABLE public.candidates ALTER COLUMN email DROP NOT NULL;
    END IF;
  END IF;

  IF to_regclass('public.modules') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='modules' AND column_name='description') THEN
    ALTER TABLE public.modules ALTER COLUMN description DROP NOT NULL;
  END IF;

  IF to_regclass('public.batches') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='batches' AND column_name='description') THEN
    ALTER TABLE public.batches ALTER COLUMN description DROP NOT NULL;
  END IF;

  IF to_regclass('public.exam_sessions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_sessions' AND column_name='submitted_at') THEN
    ALTER TABLE public.exam_sessions ALTER COLUMN submitted_at DROP NOT NULL;
  END IF;
END $$;

-- Create-flow mengandalkan UUID/created_at default. Perbaiki jika V2 lama kehilangan default.
DO $$
DECLARE
  v_table text;
  v_type text;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY[
      'organizations','organization_members','batches','candidates','modules','questions',
      'exams','exam_assignments','exam_sessions','session_questions','proctor_events',
      'proctor_violation_resets','exam_email_campaigns','exam_email_deliveries'
    ]::text[])
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN CONTINUE; END IF;

    SELECT data_type INTO v_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=v_table AND column_name='id';

    IF v_type='uuid' THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()', v_table);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_table AND column_name='created_at'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT now()', v_table);
    END IF;
  END LOOP;

  IF to_regclass('public.exam_assignments') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='exam_assignments' AND column_name='assigned_at'
  ) THEN
    ALTER TABLE public.exam_assignments ALTER COLUMN assigned_at SET DEFAULT now();
  END IF;
END $$;

-- ============================================================
-- R5 UNIQUE CONTRACTS
-- ============================================================
-- Dibutuhkan oleh duplicate prevention, onConflict/upsert, attempt, dan scoring.
DO $$
DECLARE
  v_table text;
  v_columns text[];
  v_index_name text;
  v_columns_sql text;
  v_has_unique boolean;
  v_has_duplicates boolean;
BEGIN
  FOR v_table, v_columns, v_index_name IN
    SELECT * FROM (VALUES
      ('organizations', ARRAY['code']::text[], 'exam_platform_organizations_code_uidx_r5'),
      ('organizations', ARRAY['slug']::text[], 'exam_platform_organizations_slug_uidx_r5'),
      ('organization_members', ARRAY['organization_id','user_id']::text[], 'exam_platform_membership_org_user_uidx_r5'),
      ('batches', ARRAY['organization_id','code']::text[], 'exam_platform_batches_org_code_uidx_r5'),
      ('candidates', ARRAY['organization_id','candidate_code']::text[], 'exam_platform_candidates_org_code_uidx_r5'),
      ('modules', ARRAY['organization_id','code']::text[], 'exam_platform_modules_org_code_uidx_r5'),
      ('questions', ARRAY['module_id','code']::text[], 'exam_platform_questions_module_code_uidx_r5'),
      ('exam_assignments', ARRAY['exam_id','candidate_id']::text[], 'exam_platform_assignment_exam_candidate_uidx_r5'),
      ('exam_sessions', ARRAY['assignment_id','attempt_no']::text[], 'exam_platform_session_assignment_attempt_uidx_r5'),
      ('answers', ARRAY['session_question_id']::text[], 'exam_platform_answers_session_question_uidx_r5'),
      ('results', ARRAY['session_id']::text[], 'exam_platform_results_session_uidx_r5'),
      ('exam_email_deliveries', ARRAY['campaign_id','candidate_id']::text[], 'exam_platform_email_delivery_campaign_candidate_uidx_r5'),
      ('candidate_login_rate_limits', ARRAY['scope_hash']::text[], 'exam_platform_login_rate_scope_uidx_r5'),
      ('proctor_client_locks', ARRAY['session_id']::text[], 'exam_platform_client_lock_session_uidx_r5')
    ) AS contracts(table_name, column_names, index_name)
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN CONTINUE; END IF;

    SELECT EXISTS(
      SELECT 1 FROM pg_index i
      WHERE i.indrelid=to_regclass(format('public.%I', v_table))
        AND i.indisunique
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND (
          SELECT array_agg(a.attname ORDER BY u.ord)
          FROM unnest(string_to_array(trim(i.indkey::text), ' ')::smallint[]) WITH ORDINALITY u(attnum, ord)
          JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=u.attnum
        ) = v_columns
    ) INTO v_has_unique;

    IF v_has_unique THEN CONTINUE; END IF;

    SELECT string_agg(format('%I', col), ',') INTO v_columns_sql FROM unnest(v_columns) col;
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM public.%I GROUP BY %s HAVING count(*) > 1)',
      v_table, v_columns_sql
    ) INTO v_has_duplicates;

    IF v_has_duplicates THEN
      RAISE WARNING 'R5 uniqueness: %.% memiliki duplikat; index % tidak dibuat. Healthcheck akan melaporkannya.',
        v_table, array_to_string(v_columns, ','), v_index_name;
      CONTINUE;
    END IF;

    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (%s)', v_index_name, v_table, v_columns_sql);
  END LOOP;
END $$;

-- ============================================================
-- R5 DATABASE HEALTHCHECK
-- ============================================================
create or replace function public.exam_platform_healthcheck()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  missing_items text[] := array[]::text[];
  item text;
  pair text[];
  contract_table text;
  contract_column text;
  contract_values text[];
  contract_attnum smallint;
  contract_typtype "char";
  contract_type_oid oid;
  contract_definition text;
  contract_value text;
  unique_table text;
  unique_columns text[];
  has_unique boolean;
  has_admin_org_rpc boolean;
  has_start_rpc boolean;
  has_submit_rpc boolean;
  required_tables text[] := array[
    'organizations','admin_profiles','organization_members','batches','candidates',
    'modules','questions','exams','exam_assignments','exam_sessions','session_questions','answers','results',
    'proctor_events','proctor_client_locks','proctor_violation_resets','candidate_login_rate_limits',
    'exam_email_campaigns','exam_email_deliveries'
  ];
  required_columns text[][] := array[
    array['organizations','id'], array['organizations','code'], array['organizations','name'], array['organizations','slug'], array['organizations','active'], array['organizations','created_at'],
    array['admin_profiles','id'], array['admin_profiles','created_at'], array['admin_profiles','full_name'], array['admin_profiles','role'], array['admin_profiles','active'], array['admin_profiles','is_platform_owner'],
    array['organization_members','id'], array['organization_members','created_at'], array['organization_members','organization_id'], array['organization_members','user_id'], array['organization_members','role'], array['organization_members','active'],
    array['batches','id'], array['batches','organization_id'], array['batches','code'], array['batches','name'], array['batches','description'], array['batches','status'], array['batches','created_at'],
    array['candidates','id'], array['candidates','created_at'], array['candidates','organization_id'], array['candidates','batch_id'], array['candidates','candidate_type'], array['candidates','candidate_code'], array['candidates','display_name'], array['candidates','external_identifier'], array['candidates','email'], array['candidates','active'],
    array['modules','id'], array['modules','organization_id'], array['modules','code'], array['modules','name'], array['modules','description'], array['modules','status'], array['modules','default_duration_minutes'], array['modules','shuffle_questions'], array['modules','shuffle_options'], array['modules','created_at'],
    array['questions','id'], array['questions','module_id'], array['questions','code'], array['questions','question_text'], array['questions','options'], array['questions','correct_option_id'], array['questions','weight'], array['questions','status'], array['questions','created_at'],
    array['exams','id'], array['exams','organization_id'], array['exams','module_id'], array['exams','batch_id'], array['exams','title'], array['exams','login_open_at'], array['exams','starts_at'], array['exams','hard_close_at'], array['exams','duration_minutes'], array['exams','status'], array['exams','settings'], array['exams','created_by'], array['exams','created_at'],
    array['exam_assignments','id'], array['exam_assignments','exam_id'], array['exam_assignments','candidate_id'], array['exam_assignments','active'], array['exam_assignments','extra_time_minutes'], array['exam_assignments','assigned_at'], array['exam_assignments','access_code_hash'], array['exam_assignments','access_code_ciphertext'], array['exam_assignments','access_code_generated_at'],
    array['exam_sessions','id'], array['exam_sessions','assignment_id'], array['exam_sessions','attempt_no'], array['exam_sessions','status'], array['exam_sessions','started_at'], array['exam_sessions','deadline_at'], array['exam_sessions','submitted_at'], array['exam_sessions','last_seen_at'], array['exam_sessions','updated_at'],
    array['session_questions','id'], array['session_questions','session_id'], array['session_questions','question_id'], array['session_questions','order_index'], array['session_questions','option_order'], array['session_questions','question_snapshot'],
    array['answers','session_question_id'], array['answers','selected_option_id'], array['answers','flagged'], array['answers','answered_at'], array['answers','updated_at'],
    array['results','session_id'], array['results','raw_score'], array['results','max_score'], array['results','final_score'], array['results','correct_count'], array['results','wrong_count'], array['results','blank_count'],
    array['proctor_events','id'], array['proctor_events','organization_id'], array['proctor_events','exam_id'], array['proctor_events','session_id'], array['proctor_events','assignment_id'], array['proctor_events','candidate_id'], array['proctor_events','event_type'], array['proctor_events','severity'], array['proctor_events','policy_action'], array['proctor_events','counted'], array['proctor_events','idempotency_key'], array['proctor_events','detail'], array['proctor_events','client_event_at'], array['proctor_events','created_at'],
    array['proctor_client_locks','session_id'], array['proctor_client_locks','exam_id'], array['proctor_client_locks','candidate_id'], array['proctor_client_locks','client_id'], array['proctor_client_locks','user_agent'], array['proctor_client_locks','last_seen_at'],
    array['proctor_violation_resets','id'], array['proctor_violation_resets','organization_id'], array['proctor_violation_resets','exam_id'], array['proctor_violation_resets','session_id'], array['proctor_violation_resets','created_at'],
    array['candidate_login_rate_limits','scope_hash'], array['candidate_login_rate_limits','attempts'], array['candidate_login_rate_limits','window_started_at'], array['candidate_login_rate_limits','blocked_until'], array['candidate_login_rate_limits','updated_at'],
    array['exam_email_campaigns','id'], array['exam_email_campaigns','organization_id'], array['exam_email_campaigns','exam_id'], array['exam_email_campaigns','created_by'], array['exam_email_campaigns','name'], array['exam_email_campaigns','subject_template'], array['exam_email_campaigns','body_template'], array['exam_email_campaigns','send_mode'], array['exam_email_campaigns','scheduled_at'], array['exam_email_campaigns','status'], array['exam_email_campaigns','settings'], array['exam_email_campaigns','sent_at'], array['exam_email_campaigns','created_at'], array['exam_email_campaigns','updated_at'],
    array['exam_email_deliveries','id'], array['exam_email_deliveries','campaign_id'], array['exam_email_deliveries','organization_id'], array['exam_email_deliveries','exam_id'], array['exam_email_deliveries','candidate_id'], array['exam_email_deliveries','recipient_name'], array['exam_email_deliveries','recipient_email'], array['exam_email_deliveries','subject_rendered'], array['exam_email_deliveries','body_rendered'], array['exam_email_deliveries','status'], array['exam_email_deliveries','attempt_count'], array['exam_email_deliveries','provider_message_id'], array['exam_email_deliveries','last_error'], array['exam_email_deliveries','processing_at'], array['exam_email_deliveries','next_attempt_at'], array['exam_email_deliveries','sent_at'], array['exam_email_deliveries','failed_at'], array['exam_email_deliveries','created_at'], array['exam_email_deliveries','updated_at']
  ];
begin
  foreach item in array required_tables loop
    if to_regclass(format('public.%I', item)) is null then
      missing_items := array_append(missing_items, 'table:' || item);
    end if;
  end loop;

  foreach pair slice 1 in array required_columns loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=pair[1] and column_name=pair[2]
    ) then
      missing_items := array_append(missing_items, 'column:' || pair[1] || '.' || pair[2]);
    end if;
  end loop;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='answers' and column_name='selected_option_id' and is_nullable <> 'YES') then
    missing_items := array_append(missing_items, 'contract:answers.selected_option_id must be nullable');
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='answers' and column_name='answered_at' and is_nullable <> 'YES') then
    missing_items := array_append(missing_items, 'contract:answers.answered_at must be nullable');
  end if;

  foreach item in array array['access_code_hash','access_code_ciphertext','access_code_generated_at']::text[] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='exam_assignments' and column_name=item and is_nullable <> 'YES'
    ) then
      missing_items := array_append(missing_items, 'contract:exam_assignments.' || item || ' must be nullable');
    end if;
  end loop;

  for contract_table, contract_column in
    select * from (values
      ('candidates','external_identifier'),
      ('candidates','email'),
      ('modules','description'),
      ('batches','description'),
      ('exam_sessions','submitted_at')
    ) as nullable_contracts(table_name, column_name)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=contract_table and column_name=contract_column and is_nullable <> 'YES'
    ) then
      missing_items := array_append(missing_items, 'contract:' || contract_table || '.' || contract_column || ' must be nullable');
    end if;
  end loop;

  -- JSON fields dipakai source sebagai object/array; type text lama akan membuat mutation gagal.
  for contract_table, contract_column in
    select * from (values
      ('exams','settings'),
      ('questions','options'),
      ('session_questions','option_order'),
      ('session_questions','question_snapshot'),
      ('proctor_events','detail'),
      ('exam_email_campaigns','settings')
    ) as json_contracts(table_name, column_name)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=contract_table and column_name=contract_column
        and data_type not in ('json','jsonb')
    ) then
      missing_items := array_append(missing_items, 'type:' || contract_table || '.' || contract_column || ' must be json/jsonb');
    end if;
  end loop;

  for contract_table, contract_column, contract_values in
    select * from (values
      ('admin_profiles', 'role', array['ADMIN']::text[]),
      ('organization_members', 'role', array['ADMIN']::text[]),
      ('modules', 'status', array['DRAFT','ACTIVE','INACTIVE']::text[]),
      ('questions', 'status', array['ACTIVE','INACTIVE']::text[]),
      ('batches', 'status', array['ACTIVE','INACTIVE']::text[]),
      ('exams', 'status', array['DRAFT','ACTIVE','CLOSED']::text[]),
      ('exam_sessions', 'status', array['ACTIVE','SUBMITTED']::text[]),
      ('candidates', 'candidate_type', array['INDIVIDUAL']::text[]),
      ('exam_email_campaigns', 'send_mode', array['NOW','SCHEDULED']::text[]),
      ('exam_email_campaigns', 'status', array['DRAFT','SENDING','SENT','SCHEDULED','FAILED','PARTIAL']::text[]),
      ('exam_email_deliveries', 'status', array['PENDING','PROCESSING','SCHEDULED','SENT','FAILED']::text[])
    ) as contracts(table_name, column_name, required_values)
  loop
    contract_attnum := null;
    contract_typtype := null;
    contract_type_oid := null;

    select a.attnum, t.typtype, t.oid into contract_attnum, contract_typtype, contract_type_oid
    from pg_attribute a
    join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_type t on t.oid=a.atttypid
    where n.nspname='public' and c.relname=contract_table and a.attname=contract_column
      and a.attnum > 0 and not a.attisdropped;

    if contract_attnum is null then continue; end if;

    if contract_typtype='e' then
      foreach contract_value in array contract_values loop
        if not exists (select 1 from pg_enum where enumtypid=contract_type_oid and enumlabel=contract_value) then
          missing_items := array_append(missing_items, 'contract:' || contract_table || '.' || contract_column || ' missing ' || contract_value);
        end if;
      end loop;
    end if;

    for contract_definition in
      select pg_get_constraintdef(con.oid)
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=contract_table and con.contype='c'
        and array_length(con.conkey,1)=1 and contract_attnum=any(con.conkey)
    loop
      foreach contract_value in array contract_values loop
        if position(upper(quote_literal(contract_value)) in upper(contract_definition))=0 then
          missing_items := array_append(missing_items, 'contract:' || contract_table || '.' || contract_column || ' check rejects ' || contract_value);
          exit;
        end if;
      end loop;
    end loop;
  end loop;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_my_admin_organizations' and p.pronargs=0
  ) into has_admin_org_rpc;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='start_or_resume_exam_session' and p.pronargs=1
      and coalesce(p.proargnames, array[]::text[]) @> array['p_assignment_id']::text[]
  ) into has_start_rpc;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='submit_and_score_exam_session' and p.pronargs=1
      and coalesce(p.proargnames, array[]::text[]) @> array['p_session_id']::text[]
  ) into has_submit_rpc;

  if not has_admin_org_rpc then missing_items := array_append(missing_items, 'rpc:get_my_admin_organizations()'); end if;
  if not has_start_rpc then missing_items := array_append(missing_items, 'rpc:start_or_resume_exam_session(p_assignment_id)'); end if;
  if not has_submit_rpc then missing_items := array_append(missing_items, 'rpc:submit_and_score_exam_session(p_session_id)'); end if;

  for unique_table, unique_columns in
    select * from (values
      ('organizations', array['code']::text[]),
      ('organizations', array['slug']::text[]),
      ('organization_members', array['organization_id','user_id']::text[]),
      ('batches', array['organization_id','code']::text[]),
      ('candidates', array['organization_id','candidate_code']::text[]),
      ('modules', array['organization_id','code']::text[]),
      ('questions', array['module_id','code']::text[]),
      ('exam_assignments', array['exam_id','candidate_id']::text[]),
      ('exam_sessions', array['assignment_id','attempt_no']::text[]),
      ('answers', array['session_question_id']::text[]),
      ('results', array['session_id']::text[]),
      ('exam_email_deliveries', array['campaign_id','candidate_id']::text[]),
      ('candidate_login_rate_limits', array['scope_hash']::text[]),
      ('proctor_client_locks', array['session_id']::text[])
    ) as uniques(table_name, column_names)
  loop
    if to_regclass(format('public.%I', unique_table)) is null then continue; end if;

    select exists(
      select 1 from pg_index i
      where i.indrelid=to_regclass(format('public.%I', unique_table))
        and i.indisunique
        and i.indpred is null
        and i.indexprs is null
        and (
          select array_agg(a.attname order by u.ord)
          from unnest(string_to_array(trim(i.indkey::text), ' ')::smallint[]) with ordinality u(attnum, ord)
          join pg_attribute a on a.attrelid=i.indrelid and a.attnum=u.attnum
        ) = unique_columns
    ) into has_unique;

    if not has_unique then
      missing_items := array_append(missing_items, 'unique:' || unique_table || '(' || array_to_string(unique_columns, ',') || ')');
    end if;
  end loop;

  return jsonb_build_object(
    'version', 'R5-DEEPSCAN',
    'ok', coalesce(array_length(missing_items,1),0)=0,
    'missing', to_jsonb(missing_items),
    'admin_org_rpc', has_admin_org_rpc,
    'start_rpc', has_start_rpc,
    'submit_rpc', has_submit_rpc,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.exam_platform_healthcheck() from public;
grant execute on function public.exam_platform_healthcheck() to service_role;

-- Minta PostgREST refresh schema cache supaya pre-flight via API langsung melihat patch baru.
notify pgrst, 'reload schema';

-- SQL Editor langsung menampilkan semua gap sekaligus setelah patch selesai.
select public.exam_platform_healthcheck() as exam_platform_health;
