create table if not exists public.expense_performance_events (
  event_id uuid primary key default gen_random_uuid(),
  request_hash text not null unique check (request_hash ~ '^[0-9a-f]{64}$'),
  agency text not null check (agency in ('COO','FIH','LSHI','KLZ')),
  result text not null check (result in ('SUCCESS','ERROR')),
  server_started_at timestamptz not null,
  server_finished_at timestamptz not null,
  server_durations_ms jsonb not null default '{}'::jsonb,
  apps_script_started_at timestamptz,
  apps_script_finished_at timestamptz,
  apps_script_total_ms numeric,
  apps_script_steps_ms jsonb not null default '{}'::jsonb,
  statistics_path text check (statistics_path in ('INCREMENTAL','FULL_FALLBACK')),
  fallback_reason text,
  sheet_calls jsonb not null default '{}'::jsonb,
  frontend_durations_ms jsonb not null default '{}'::jsonb,
  telemetry_cost_ms numeric,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.expense_performance_events enable row level security;
revoke all on public.expense_performance_events from anon, authenticated;
comment on table public.expense_performance_events is 'Non-sensitive technical timings for expense operations; service-role only.';
