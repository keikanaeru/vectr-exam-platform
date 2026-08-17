-- Exam Platform Final - proctoring event log
-- Jalankan sekali pada Supabase SQL Editor sebelum menggunakan Proctor Monitor.

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
      'TAB_HIDDEN',
      'WINDOW_BLUR',
      'FULLSCREEN_EXIT',
      'PRINT_SCREEN',
      'BLOCKED_SHORTCUT',
      'COPY_PASTE',
      'CONTEXT_MENU',
      'DUPLICATE_TAB',
      'MULTIPLE_DEVICE',
      'OFFLINE',
      'PAGE_LEAVE'
    )
  ),
  constraint proctor_events_severity_check check (severity in ('INFO', 'WARNING', 'CRITICAL')),
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

-- Tidak ada policy browser langsung. Semua read/write proctoring dilakukan oleh
-- server-side service-role setelah sesi kandidat / admin divalidasi aplikasi.

-- Candidate credential brute-force throttling. Server/service-role only.
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
