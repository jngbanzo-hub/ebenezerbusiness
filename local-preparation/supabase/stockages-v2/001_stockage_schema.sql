-- PREPARATORY ONLY. DO NOT APPLY WITHOUT A SEPARATE APPROVAL AND BACKUP.
begin;

create table public.stockage_accounts (
  id uuid primary key default gen_random_uuid(),
  agency text not null unique,
  status text not null default 'SUSPENDED',
  current_parcel_count integer not null default 0,
  current_weight_kg numeric(18,3) not null default 0,
  version bigint not null default 1,
  opened_business_date date,
  opened_by uuid references auth.users(id),
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stockage_accounts_agency_check check (agency in ('FIH', 'LSHI', 'KLZ')),
  constraint stockage_accounts_status_check check (status in ('SUSPENDED', 'ACTIVE')),
  constraint stockage_accounts_count_check check (current_parcel_count >= 0),
  constraint stockage_accounts_weight_check check (current_weight_kg >= 0),
  constraint stockage_accounts_version_check check (version > 0),
  constraint stockage_accounts_opening_check check (
    (status = 'SUSPENDED' and opened_business_date is null and opened_by is null and opened_at is null)
    or (status = 'ACTIVE' and opened_business_date is not null and opened_by is not null and opened_at is not null)
  ),
  constraint stockage_accounts_id_agency_unique unique (id, agency)
);

create table public.stockage_events (
  event_id text primary key,
  account_id uuid not null,
  request_id uuid not null unique,
  event_type text not null,
  agency text not null,
  parcel_count_delta integer not null,
  weight_kg_delta numeric(18,3) not null,
  tracking_code text,
  arrival_reference text,
  actor_id uuid not null references auth.users(id),
  actor_name text not null,
  actor_role text not null,
  business_date date not null,
  occurred_at timestamptz not null,
  payload_hash text not null,
  account_version_before bigint not null,
  account_version_after bigint not null,
  source_type text not null,
  source_request_id text,
  target_event_id text references public.stockage_events(event_id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint stockage_events_account_agency_fk foreign key (account_id, agency)
    references public.stockage_accounts(id, agency),
  constraint stockage_events_type_check check (event_type in (
    'OPENING_STOCK_RECORDED', 'MANUAL_ARRIVAL_RECORDED',
    'CONFIRMED_DELIVERY_RECORDED', 'ADMIN_STOCK_ADJUSTMENT_RECORDED',
    'STOCK_CORRECTION_RECORDED'
  )),
  constraint stockage_events_agency_check check (agency in ('FIH', 'LSHI', 'KLZ')),
  constraint stockage_events_actor_check check (btrim(actor_name) <> '' and actor_role in ('AGENT', 'ADMIN')),
  constraint stockage_events_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint stockage_events_versions_check check (
    account_version_before > 0 and account_version_after = account_version_before + 1
  ),
  constraint stockage_events_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint stockage_events_tracking_check check (
    tracking_code is null or tracking_code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
  ),
  constraint stockage_events_semantics_check check (
    (event_type = 'OPENING_STOCK_RECORDED' and parcel_count_delta >= 0 and weight_kg_delta >= 0
      and tracking_code is null and target_event_id is null and actor_role = 'ADMIN')
    or (event_type = 'MANUAL_ARRIVAL_RECORDED' and parcel_count_delta > 0 and weight_kg_delta > 0
      and tracking_code is null and target_event_id is null and actor_role = 'AGENT')
    or (event_type = 'CONFIRMED_DELIVERY_RECORDED' and parcel_count_delta = -1 and weight_kg_delta < 0
      and tracking_code is not null and target_event_id is null and actor_role = 'AGENT')
    or (event_type = 'ADMIN_STOCK_ADJUSTMENT_RECORDED' and actor_role = 'ADMIN'
      and (parcel_count_delta <> 0 or weight_kg_delta <> 0) and target_event_id is null
      and reason is not null and btrim(reason) <> '')
    or (event_type = 'STOCK_CORRECTION_RECORDED' and actor_role = 'ADMIN'
      and (parcel_count_delta <> 0 or weight_kg_delta <> 0) and target_event_id is not null
      and reason is not null and btrim(reason) <> '')
  ),
  constraint stockage_events_account_version_unique unique (account_id, account_version_after)
);

create unique index stockage_events_delivery_unique
  on public.stockage_events (tracking_code)
  where event_type = 'CONFIRMED_DELIVERY_RECORDED';
create index stockage_events_agency_date_idx
  on public.stockage_events (agency, business_date, occurred_at, event_id);
create index stockage_events_actor_idx
  on public.stockage_events (agency, actor_id, occurred_at desc);
create index stockage_events_target_idx
  on public.stockage_events (target_event_id) where target_event_id is not null;

create table public.stockage_parcels (
  tracking_code text primary key,
  agency text not null,
  canonical_weight_kg numeric(18,3) not null,
  weight_source text not null,
  weight_source_reference text not null,
  delivery_status text not null default 'AVAILABLE',
  delivered_event_id text unique references public.stockage_events(event_id),
  delivered_by uuid references auth.users(id),
  delivered_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stockage_parcels_code_check check (tracking_code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'),
  constraint stockage_parcels_agency_check check (agency in ('FIH', 'LSHI', 'KLZ')),
  constraint stockage_parcels_weight_check check (canonical_weight_kg > 0),
  constraint stockage_parcels_source_check check (
    weight_source in ('SHIPPING_MANIFEST', 'PAYMENT_SNAPSHOT_CONTROL') and btrim(weight_source_reference) <> ''
  ),
  constraint stockage_parcels_status_check check (delivery_status in ('AVAILABLE', 'DELIVERED')),
  constraint stockage_parcels_version_check check (version > 0),
  constraint stockage_parcels_delivery_check check (
    (delivery_status = 'AVAILABLE' and delivered_event_id is null and delivered_by is null and delivered_at is null)
    or (delivery_status = 'DELIVERED' and delivered_event_id is not null and delivered_by is not null and delivered_at is not null)
  )
);
create index stockage_parcels_agency_status_idx
  on public.stockage_parcels (agency, delivery_status, updated_at desc);

create table public.stockage_admin_audit (
  audit_id text primary key,
  action text not null,
  agency text not null,
  request_id uuid not null unique,
  admin_id uuid not null references auth.users(id),
  admin_name text not null,
  old_value jsonb,
  new_value jsonb not null,
  reason text not null,
  target_event_id text references public.stockage_events(event_id),
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint stockage_audit_agency_check check (agency in ('FIH', 'LSHI', 'KLZ')),
  constraint stockage_audit_text_check check (
    btrim(action) <> '' and btrim(admin_name) <> '' and btrim(reason) <> ''
  ),
  constraint stockage_audit_json_check check (
    jsonb_typeof(new_value) is not null and jsonb_typeof(metadata) = 'object'
  )
);
create index stockage_audit_agency_date_idx
  on public.stockage_admin_audit (agency, occurred_at desc, audit_id);

create table public.stockage_anomalies (
  anomaly_id text primary key,
  agency text not null,
  tracking_code text,
  request_id uuid,
  anomaly_type text not null,
  status text not null default 'OPEN',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_reason text,
  constraint stockage_anomalies_agency_check check (agency in ('FIH', 'LSHI', 'KLZ')),
  constraint stockage_anomalies_type_check check (anomaly_type in (
    'WEIGHT_MISSING', 'WEIGHT_AMBIGUOUS', 'WEIGHT_CONFLICT', 'AGENCY_MISMATCH',
    'INSUFFICIENT_STOCK', 'PARCEL_NOT_FOUND', 'DUPLICATE_DELIVERY_ATTEMPT',
    'IDEMPOTENCY_CONFLICT', 'VERSION_CONFLICT'
  )),
  constraint stockage_anomalies_status_check check (status in ('OPEN', 'RESOLVED')),
  constraint stockage_anomalies_details_check check (jsonb_typeof(details) = 'object'),
  constraint stockage_anomalies_resolution_check check (
    (status = 'OPEN' and resolved_at is null and resolved_by is null and resolution_reason is null)
    or (status = 'RESOLVED' and resolved_at is not null and resolved_by is not null
      and resolution_reason is not null and btrim(resolution_reason) <> '')
  )
);
create index stockage_anomalies_open_idx
  on public.stockage_anomalies (agency, created_at desc) where status = 'OPEN';

create function public.reject_stockage_immutable_mutation()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$ begin raise exception 'STOCKAGE_RECORD_IMMUTABLE'; end; $$;

create trigger stockage_events_reject_mutation before update or delete on public.stockage_events
  for each row execute function public.reject_stockage_immutable_mutation();
create trigger stockage_audit_reject_mutation before update or delete on public.stockage_admin_audit
  for each row execute function public.reject_stockage_immutable_mutation();

create function public.reject_stockage_anomaly_delete()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$ begin raise exception 'STOCKAGE_ANOMALY_DELETE_FORBIDDEN'; end; $$;
create trigger stockage_anomalies_reject_delete before delete on public.stockage_anomalies
  for each row execute function public.reject_stockage_anomaly_delete();

commit;
