-- PREPARATORY ONLY. DO NOT APPLY WITHOUT A SEPARATE APPROVAL AND BACKUP.
-- Supabase is the future canonical cash source. Google Sheets is not authoritative.
begin;

create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  agency text not null unique,
  currency text not null default 'USD',
  status text not null default 'ACTIVE',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint cash_accounts_agency_check check (agency in ('FIH', 'LSHI', 'KLZ')),
  constraint cash_accounts_currency_check check (currency = 'USD'),
  constraint cash_accounts_status_check check (status in ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  constraint cash_accounts_version_check check (version > 0),
  constraint cash_accounts_id_agency_unique unique (id, agency)
);

create table public.cash_events (
  event_id text primary key,
  cash_account_id uuid not null references public.cash_accounts(id),
  agency text not null,
  business_date date not null,
  occurred_at timestamptz not null,
  event_type text not null,
  direction text not null,
  amount numeric(18,2) not null,
  currency text not null default 'USD',
  source_type text not null,
  source_id text not null,
  source_request_id text not null,
  actor_user_id uuid not null references auth.users(id),
  actor_name_snapshot text not null,
  corrected_event_id text references public.cash_events(event_id),
  reason text,
  version_before integer not null,
  version_after integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint cash_events_agency_check check (agency in ('FIH', 'LSHI', 'KLZ')),
  constraint cash_events_currency_check check (currency = 'USD'),
  constraint cash_events_type_check check (event_type in (
    'OPENING_BALANCE_RECORDED',
    'PAYMENT_CREDIT_RECORDED',
    'EXPENSE_DEBIT_RECORDED',
    'ADMIN_ADJUSTMENT_RECORDED',
    'CASH_CORRECTION_RECORDED'
  )),
  constraint cash_events_direction_check check (direction in ('CREDIT', 'DEBIT')),
  constraint cash_events_amount_check check (amount > 0),
  constraint cash_events_actor_name_check check (btrim(actor_name_snapshot) <> ''),
  constraint cash_events_source_check check (
    btrim(source_type) <> '' and btrim(source_id) <> '' and btrim(source_request_id) <> ''
  ),
  constraint cash_events_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint cash_events_version_check check (
    version_before >= 0 and version_after = version_before + 1
  ),
  constraint cash_events_semantics_check check (
    (event_type = 'OPENING_BALANCE_RECORDED' and direction = 'CREDIT' and corrected_event_id is null)
    or (event_type = 'PAYMENT_CREDIT_RECORDED' and direction = 'CREDIT' and corrected_event_id is null)
    or (event_type = 'EXPENSE_DEBIT_RECORDED' and direction = 'DEBIT' and corrected_event_id is null)
    or (event_type = 'ADMIN_ADJUSTMENT_RECORDED' and corrected_event_id is null and reason is not null and btrim(reason) <> '')
    or (event_type = 'CASH_CORRECTION_RECORDED' and corrected_event_id is not null and reason is not null and btrim(reason) <> '')
  ),
  constraint cash_events_account_agency_fk foreign key (cash_account_id, agency)
    references public.cash_accounts(id, agency),
  constraint cash_events_source_unique unique (source_type, source_id),
  constraint cash_events_request_unique unique (source_type, source_request_id),
  constraint cash_events_account_version_unique unique (cash_account_id, version_after)
);

create table public.cash_daily_closures (
  closure_id text primary key,
  cash_account_id uuid not null references public.cash_accounts(id),
  agency text not null,
  business_date date not null,
  opening_balance numeric(18,2) not null,
  payments_total numeric(18,2) not null,
  expenses_total numeric(18,2) not null,
  corrections_net numeric(18,2) not null,
  closing_balance numeric(18,2) not null,
  status text not null,
  version integer not null,
  previous_closure_id text references public.cash_daily_closures(closure_id),
  admin_user_id uuid not null references auth.users(id),
  admin_name_snapshot text not null,
  closed_at timestamptz not null,
  reopened_at timestamptz,
  reopened_by_admin_id uuid references auth.users(id),
  reopen_reason text,
  audit_id text not null unique,
  created_at timestamptz not null default now(),
  constraint cash_closures_agency_check check (agency in ('FIH', 'LSHI', 'KLZ')),
  constraint cash_closures_status_check check (status in ('CLOSED', 'REOPENED')),
  constraint cash_closures_money_check check (
    opening_balance >= 0 and payments_total >= 0 and expenses_total >= 0 and closing_balance >= 0
  ),
  constraint cash_closures_formula_check check (
    closing_balance = opening_balance + payments_total - expenses_total + corrections_net
  ),
  constraint cash_closures_version_check check (version > 0),
  constraint cash_closures_reopen_check check (
    (status = 'CLOSED' and reopened_at is null and reopened_by_admin_id is null and reopen_reason is null)
    or (status = 'REOPENED' and reopened_at is not null and reopened_by_admin_id is not null and reopen_reason is not null and btrim(reopen_reason) <> '')
  ),
  constraint cash_closures_account_agency_fk foreign key (cash_account_id, agency)
    references public.cash_accounts(id, agency),
  constraint cash_closures_version_unique unique (cash_account_id, business_date, version)
);

create unique index cash_daily_closures_one_active_idx
  on public.cash_daily_closures (cash_account_id, business_date)
  where status = 'CLOSED';

create table public.cash_admin_audit (
  audit_id text primary key,
  agency text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  previous_value jsonb,
  new_value jsonb not null,
  reason text not null,
  admin_user_id uuid not null references auth.users(id),
  admin_name_snapshot text not null,
  occurred_at timestamptz not null,
  request_id text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint cash_audit_agency_check check (agency in ('FIH', 'LSHI', 'KLZ')),
  constraint cash_audit_required_text_check check (
    btrim(action) <> '' and btrim(target_type) <> '' and btrim(target_id) <> ''
    and btrim(reason) <> '' and btrim(admin_name_snapshot) <> '' and btrim(request_id) <> ''
  ),
  constraint cash_audit_new_value_check check (jsonb_typeof(new_value) in ('object', 'number', 'string', 'boolean', 'null')),
  constraint cash_audit_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index cash_events_agency_date_idx on public.cash_events (agency, business_date, occurred_at, event_id);
create index cash_events_actor_idx on public.cash_events (agency, business_date, actor_user_id);
create index cash_events_corrected_event_idx on public.cash_events (corrected_event_id) where corrected_event_id is not null;
create index cash_closures_history_idx on public.cash_daily_closures (agency, business_date desc, version desc);
create index cash_audit_history_idx on public.cash_admin_audit (agency, occurred_at desc, audit_id);

create function public.reject_cash_immutable_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'CASH_RECORD_IMMUTABLE';
end;
$$;

create trigger cash_events_reject_mutation
  before update or delete on public.cash_events
  for each row execute function public.reject_cash_immutable_mutation();
create trigger cash_closures_reject_mutation
  before update or delete on public.cash_daily_closures
  for each row execute function public.reject_cash_immutable_mutation();
create trigger cash_audit_reject_mutation
  before update or delete on public.cash_admin_audit
  for each row execute function public.reject_cash_immutable_mutation();

-- Server producers must lock the cash_accounts row and verify version_before
-- before inserting the next event. Browser input never supplies agency/version.

commit;
