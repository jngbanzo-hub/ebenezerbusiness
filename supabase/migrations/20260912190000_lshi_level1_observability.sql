create table if not exists public.payment_performance_events (
  event_id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  agency text not null check (agency in ('COO','FIH','LSHI','KLZ')),
  flow_type text not null,
  result text not null,
  http_status integer not null check (http_status between 100 and 599),
  total_ms numeric not null check (total_ms >= 0),
  apps_script_ms numeric check (apps_script_ms >= 0),
  apps_script_lock_wait_ms numeric check (apps_script_lock_wait_ms >= 0),
  canonical_payment_ms numeric check (canonical_payment_ms >= 0),
  checkpoint_ms numeric check (checkpoint_ms >= 0),
  cash_event_ms numeric check (cash_event_ms >= 0),
  storage_exit_ms numeric check (storage_exit_ms >= 0),
  finalization_ms numeric check (finalization_ms >= 0),
  timeout boolean not null default false,
  retry boolean not null default false,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  durations_ms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists payment_performance_agency_created_idx
  on public.payment_performance_events(agency, created_at desc);
create index if not exists payment_performance_request_idx
  on public.payment_performance_events(request_id, created_at desc);

create table if not exists public.lshi_reconciliation_state (
  singleton boolean primary key default true check (singleton),
  next_payment_sheet_row integer not null default 2 check (next_payment_sheet_row >= 2),
  active_run_id uuid,
  lease_until timestamptz,
  last_completed_at timestamptz,
  last_daily_business_date date,
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.lshi_reconciliation_state(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.lshi_reconciliation_runs (
  run_id uuid primary key,
  run_kind text not null check (run_kind in ('INCREMENTAL','DAILY','DAILY_RETRY')),
  slot_key text not null unique,
  business_date date,
  status text not null check (status in ('RUNNING','COMPLETED','FAILED','SKIPPED')),
  cursor_start integer not null check (cursor_start >= 2),
  cursor_end integer,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  anomalies jsonb not null default '[]'::jsonb,
  information jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  failure_code text
);

create index if not exists lshi_reconciliation_runs_finished_idx
  on public.lshi_reconciliation_runs(finished_at desc)
  where status = 'COMPLETED';

alter table public.payment_performance_events enable row level security;
alter table public.payment_performance_events force row level security;
alter table public.lshi_reconciliation_state enable row level security;
alter table public.lshi_reconciliation_state force row level security;
alter table public.lshi_reconciliation_runs enable row level security;
alter table public.lshi_reconciliation_runs force row level security;

revoke all on public.payment_performance_events from public, anon, authenticated;
revoke all on public.lshi_reconciliation_state from public, anon, authenticated;
revoke all on public.lshi_reconciliation_runs from public, anon, authenticated;
grant select, insert on public.payment_performance_events to service_role;
grant select, insert, update on public.lshi_reconciliation_state to service_role;
grant select, insert, update on public.lshi_reconciliation_runs to service_role;

comment on table public.payment_performance_events is
  'Télémétrie technique sans donnée client pour paiements; service_role uniquement.';
comment on table public.lshi_reconciliation_runs is
  'Résultats de contrôles read-only LSHI; aucune réparation métier.';

create or replace function public.claim_lshi_reconciliation_run(
  p_run_id uuid,
  p_run_kind text,
  p_slot_key text,
  p_business_date date default null,
  p_lease_seconds integer default 480
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.lshi_reconciliation_state%rowtype;
  v_inserted uuid;
begin
  if p_run_kind not in ('INCREMENTAL','DAILY','DAILY_RETRY')
     or p_lease_seconds < 60 or p_lease_seconds > 540 then
    raise exception 'INVALID_RECONCILIATION_CLAIM';
  end if;

  select * into v_state
  from public.lshi_reconciliation_state
  where singleton = true
  for update;

  if v_state.active_run_id is not null
     and v_state.lease_until is not null
     and v_state.lease_until > clock_timestamp() then
    return jsonb_build_object('acquired', false, 'reason', 'OVERLAP');
  end if;

  insert into public.lshi_reconciliation_runs(
    run_id, run_kind, slot_key, business_date, status, cursor_start
  ) values (
    p_run_id, p_run_kind, p_slot_key, p_business_date, 'RUNNING',
    greatest(2, v_state.next_payment_sheet_row)
  )
  on conflict (slot_key) do nothing
  returning run_id into v_inserted;

  if v_inserted is null then
    return jsonb_build_object('acquired', false, 'reason', 'SLOT_ALREADY_RUN');
  end if;

  update public.lshi_reconciliation_state
  set active_run_id = p_run_id,
      lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = clock_timestamp()
  where singleton = true;

  return jsonb_build_object(
    'acquired', true,
    'cursorStart', greatest(2, v_state.next_payment_sheet_row),
    'lastDailyBusinessDate', v_state.last_daily_business_date
  );
end;
$$;

create or replace function public.complete_lshi_reconciliation_run(
  p_run_id uuid,
  p_cursor_end integer,
  p_anomalies jsonb,
  p_information jsonb,
  p_metrics jsonb,
  p_sources jsonb
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run public.lshi_reconciliation_runs%rowtype;
begin
  select * into v_run
  from public.lshi_reconciliation_runs
  where run_id = p_run_id
  for update;
  if not found or v_run.status <> 'RUNNING' then
    raise exception 'RECONCILIATION_RUN_NOT_ACTIVE';
  end if;

  update public.lshi_reconciliation_runs
  set status = 'COMPLETED',
      cursor_end = greatest(2, p_cursor_end),
      anomalies = coalesce(p_anomalies, '[]'::jsonb),
      information = coalesce(p_information, '[]'::jsonb),
      metrics = coalesce(p_metrics, '{}'::jsonb),
      sources = coalesce(p_sources, '{}'::jsonb),
      finished_at = clock_timestamp()
  where run_id = p_run_id;

  update public.lshi_reconciliation_state
  set next_payment_sheet_row = case
        when v_run.run_kind = 'INCREMENTAL'
          then greatest(next_payment_sheet_row, p_cursor_end)
        else next_payment_sheet_row
      end,
      last_completed_at = clock_timestamp(),
      last_daily_business_date = case
        when v_run.run_kind in ('DAILY','DAILY_RETRY')
          and p_sources->>'cashClosure' = 'AVAILABLE'
          then v_run.business_date
        else last_daily_business_date
      end,
      active_run_id = null,
      lease_until = null,
      updated_at = clock_timestamp()
  where singleton = true and active_run_id = p_run_id;
  return true;
end;
$$;

create or replace function public.fail_lshi_reconciliation_run(
  p_run_id uuid,
  p_failure_code text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.lshi_reconciliation_runs
  set status = 'FAILED',
      failure_code = left(coalesce(p_failure_code, 'UNKNOWN'), 80),
      finished_at = clock_timestamp()
  where run_id = p_run_id and status = 'RUNNING';

  update public.lshi_reconciliation_state
  set active_run_id = null,
      lease_until = null,
      updated_at = clock_timestamp()
  where singleton = true and active_run_id = p_run_id;
  return true;
end;
$$;

revoke all on function public.claim_lshi_reconciliation_run(uuid,text,text,date,integer) from public, anon, authenticated;
revoke all on function public.complete_lshi_reconciliation_run(uuid,integer,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.fail_lshi_reconciliation_run(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_lshi_reconciliation_run(uuid,text,text,date,integer) to service_role;
grant execute on function public.complete_lshi_reconciliation_run(uuid,integer,jsonb,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.fail_lshi_reconciliation_run(uuid,text) to service_role;
