-- Isolated PostgreSQL test fixture only. Never run against a real Supabase database.
create schema if not exists auth;
create schema if not exists extensions;
do $$begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create extension if not exists pgcrypto with schema extensions;

create table auth.users(id uuid primary key);
create table public.agents(id uuid primary key references auth.users(id), nom text not null, role text not null, actif boolean not null, agence text);
create table public.stockage_accounts(id uuid primary key, agency text unique not null,
  status text not null, current_parcel_count integer not null check(current_parcel_count>=0),
  current_weight_kg numeric not null check(current_weight_kg>=0), version bigint not null, updated_at timestamptz);
create table public.stockage_forwardings(forwarding_id uuid primary key,
  forwarding_reference text not null unique, creation_request_id uuid not null unique,
  command_fingerprint text not null,
  original_tracking_code text not null, origin_agency text not null, destination_agency text not null,
  canonical_weight_kg numeric not null, amount_expected numeric not null, amount_paid numeric not null,
  rate_usd_per_kg numeric, created_by uuid, created_by_name text,
  cash_event_id text, delivery_event_id text, arrival_event_id text,
  status text not null default 'PAID_AWAITING_ARRIVAL'
    check(status in ('IN_TRANSIT','ARRIVAL_CONFIRMED','PAID_AWAITING_ARRIVAL','CANCELLED_BY_COMPENSATION')),
  created_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1, updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint stockage_forwardings_original_tracking_code_origin_agency_d_key
    unique(original_tracking_code,origin_agency,destination_agency));
create table public.stockage_forwarding_manifest_registry(
  registry_id uuid primary key default gen_random_uuid(),
  forwarding_id uuid not null unique references public.stockage_forwardings(forwarding_id) on delete restrict,
  source_parcel_id uuid not null, destination_parcel_id uuid,
  tracking_code text not null, origin_agency text not null, destination_agency text not null,
  canonical_weight_kg numeric not null, rate_usd_per_kg numeric not null,
  amount_expected numeric not null, amount_paid numeric not null default 0,
  payment_request_id uuid, cash_event_id text, payment_datetime timestamptz,
  manifest_sheet text not null, manifest_source_tracking_code text not null,
  manifest_source_weight numeric not null, manifest_source_row bigint,
  manifest_source_date date, manifest_source_fingerprint text,
  resolution_state text not null default 'PENDING'
    check(resolution_state in ('PENDING','CERTIFIED','AMBIGUOUS','DRIFTED')),
  sync_state text not null default 'AWAITING_PAYMENT',
  constraint stockage_forwarding_manifest_registry_sync_state_check
    check(sync_state in ('AWAITING_PAYMENT','AWAITING_MANIFEST_IDENTITY',
      'PENDING','RETRY','AMBIGUOUS','SYNCED')),
  next_retry_at timestamptz, claimed_at timestamptz, claimed_by text,
  lease_until timestamptz, updated_at timestamptz not null default clock_timestamp(),
  constraint stockage_forwarding_manifest_registry_check3
    check((payment_request_id is null and cash_event_id is null and payment_datetime is null and amount_paid=0)
       or (payment_request_id is not null and cash_event_id is not null and payment_datetime is not null and amount_paid=amount_expected)),
  constraint stockage_forwarding_manifest_registry_check4
    check((resolution_state='CERTIFIED')=(manifest_source_row is not null and manifest_source_date is not null and manifest_source_fingerprint is not null))
);
-- The real production trigger captures INSERT and payment changes, but does not
-- recognize CANCELLED_BY_COMPENSATION on UPDATE OF status. Keep that behavior here.
create function public.fixture_capture_forwarding_manifest_registry() returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' then
    -- Production catches a missing source parcel identifier and defers this
    -- registry capture for legacy paid-at-origin forwardings.
    if new.metadata->>'parcelId' is null then return new; end if;
    insert into public.stockage_forwarding_manifest_registry(
      forwarding_id,source_parcel_id,tracking_code,origin_agency,destination_agency,
      canonical_weight_kg,rate_usd_per_kg,amount_expected,amount_paid,
      manifest_sheet,manifest_source_tracking_code,manifest_source_weight)
    values(new.forwarding_id,(new.metadata->>'parcelId')::uuid,new.original_tracking_code,
      new.origin_agency,new.destination_agency,new.canonical_weight_kg,
      new.amount_expected/new.canonical_weight_kg,new.amount_expected,new.amount_paid,
      new.origin_agency,new.original_tracking_code,new.canonical_weight_kg);
  end if;
  return new;
end $$;
create trigger stockage_forwarding_manifest_registry_capture
  after insert or update of status,amount_paid,cash_event_id on public.stockage_forwardings
  for each row execute function public.fixture_capture_forwarding_manifest_registry();
create table public.stockage_events(event_id text primary key, account_id uuid not null,
  request_id uuid not null unique, event_type text not null, agency text not null,
  parcel_count_delta integer not null, weight_kg_delta numeric not null,
  tracking_code text, arrival_reference text, actor_id uuid not null, actor_name text not null, actor_role text not null,
  business_date date not null, occurred_at timestamptz not null, payload_hash text not null,
  account_version_before bigint not null, account_version_after bigint not null,
  source_type text, source_request_id text, target_event_id text references public.stockage_events(event_id),
  reason text, metadata jsonb not null default '{}'::jsonb,
  unique(account_id,account_version_after),
  check(account_version_after=account_version_before+1),
  check(event_type<>'CORRECTION_COMPENSATOIRE_ADMIN' or
    (actor_role='ADMIN' and reason is not null and btrim(reason)<>'')));
create table public.stockage_parcels(parcel_id uuid primary key,
  forwarding_id uuid references public.stockage_forwardings(forwarding_id),
  tracking_code text not null, agency text not null, canonical_weight_kg numeric not null,
  delivery_status text not null, weight_source text, weight_source_reference text,
  created_at timestamptz not null, version bigint not null, updated_at timestamptz,
  unique(agency,tracking_code,forwarding_id));
create unique index stockage_parcels_native_identity_unique on public.stockage_parcels(agency,tracking_code)
  where forwarding_id is null;
create table public.stockage_forwarding_orchestrations(request_id uuid primary key,
  forwarding_id uuid references public.stockage_forwardings(forwarding_id),
  command_fingerprint text unique, original_tracking_code text,
  origin_agency text, destination_agency text, canonical_weight_kg numeric,
  rate_usd_per_kg numeric, expected_amount numeric, source_status text,
  payment_mode text, payment_reference text, actor_id uuid, actor_name text,
  payment_response jsonb, completed_at timestamptz, last_error text,
  attempt_count integer not null default 0,
  state text not null, payment_created boolean not null, updated_at timestamptz);
create table public.stockage_payment_orchestrations(request_id uuid primary key,
  forwarding_id uuid references public.stockage_forwardings(forwarding_id));
create table public.cash_events(event_id text primary key, source_id text, metadata jsonb not null default '{}'::jsonb);
create table public.stockage_forwarding_events(event_id text primary key,
  forwarding_id uuid not null, request_id uuid not null unique, event_type text not null,
  actor_id uuid not null, actor_name text not null, agency text not null,
  version_before bigint not null, version_after bigint not null, payload_hash text not null,
  occurred_at timestamptz not null, metadata jsonb not null default '{}'::jsonb);
create table public.stockage_admin_audit(audit_id text primary key, action text not null,
  agency text not null, request_id uuid not null unique, admin_id uuid not null, admin_name text not null,
  old_value jsonb, new_value jsonb not null, reason text not null,
  target_event_id text references public.stockage_events(event_id),
  occurred_at timestamptz not null, metadata jsonb not null default '{}'::jsonb);
create table public.stockage_forwarding_anomalies(
  anomaly_id text primary key, anomaly_type text, successful_step text, failed_step text,
  payment_request_id uuid unique, forwarding_reference text, original_tracking_code text,
  origin_agency text, destination_agency text, actor_id uuid, actor_name text,
  admin_message text, metadata jsonb);

-- The append-only production logs reject later UPDATE/DELETE; TRUNCATE is used
-- only to reset this disposable fixture between fictitious scenarios.
create function public.fixture_immutable_log() returns trigger language plpgsql as $$
begin raise exception 'IMMUTABLE_LOG'; end $$;
create trigger stockage_events_immutable before update or delete on public.stockage_events
  for each row execute function public.fixture_immutable_log();
create trigger stockage_forwarding_events_immutable before update or delete on public.stockage_forwarding_events
  for each row execute function public.fixture_immutable_log();
create trigger stockage_admin_audit_immutable before update or delete on public.stockage_admin_audit
  for each row execute function public.fixture_immutable_log();

-- The isolated fixture starts with the already-deployed function signature;
-- migration 023 replaces it with the production-compatible body under test.
create function public.confirm_storage_forwarding_departure(
  text,text,numeric,text,numeric,numeric,text,date,uuid,text,uuid
) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.finalize_inter_agency_forwarding(uuid,text)
  returns jsonb language sql as $$ select '{}'::jsonb $$;

create table public.fixture_case(forwarding_id uuid, parcel_id uuid, origin_agency text,
  destination_agency text, tracking_code text, weight_kg numeric,
  historical_price numeric, forwarding_price numeric,
  origin_arrival_id text, departure_id text, destination_arrival_id text);

create function public.seed_fixture(p_origin text,p_destination text,p_code text,
  p_weight numeric,p_historical_price numeric,p_forwarding_price numeric) returns void
language plpgsql as $$
declare
  v_forwarding uuid:=md5('forwarding-'||p_code)::uuid;
  v_parcel uuid:=md5('parcel-'||p_code)::uuid;
  v_origin_id uuid:=md5('account-'||p_origin)::uuid;
  v_destination_id uuid:=md5('account-'||p_destination)::uuid;
  v_admin uuid:='00000000-0000-0000-0000-000000000001';
  v_agent uuid:='00000000-0000-0000-0000-000000000002';
  v_origin_arrival text:='arrival-'||p_code;
  v_departure text:='departure-'||p_code;
  v_destination_arrival text:='destination-arrival-'||p_code;
begin
  truncate public.fixture_case,public.stockage_admin_audit,public.stockage_forwarding_anomalies,
    public.stockage_forwarding_events,
    public.stockage_forwarding_manifest_registry,
    public.stockage_payment_orchestrations,public.stockage_forwarding_orchestrations,
    public.cash_events,public.stockage_parcels,public.stockage_events,
    public.stockage_forwardings,public.stockage_accounts,public.agents,auth.users cascade;
  insert into auth.users values(v_admin),(v_agent);
  insert into public.agents values(v_admin,'Admin fictif','ADMIN',true,null),(v_agent,'Agent fictif','AGENT',true,p_origin);
  insert into public.stockage_accounts values
    (v_origin_id,p_origin,'ACTIVE',0,0,3,now()),
    (v_destination_id,p_destination,'ACTIVE',1,p_weight,2,now());
  insert into public.stockage_forwardings(forwarding_id,forwarding_reference,creation_request_id,
    command_fingerprint,original_tracking_code,origin_agency,destination_agency,
    canonical_weight_kg,amount_expected,amount_paid,cash_event_id,delivery_event_id,
    arrival_event_id,status,created_at,version,updated_at,metadata) values
    (v_forwarding,p_code||'-'||p_origin||'-'||p_destination,
     md5('creation-'||p_code)::uuid,md5(p_code)||md5(p_code),
     p_code,p_origin,p_destination,p_weight,p_forwarding_price,0,
     null,null,v_destination_arrival,'ARRIVAL_CONFIRMED','2026-10-02T12:00:00Z',2,now(),
     jsonb_build_object('parcelId',v_parcel::text));
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,
    parcel_count_delta,weight_kg_delta,tracking_code,actor_id,actor_name,actor_role,
    business_date,occurred_at,payload_hash,account_version_before,account_version_after,
    source_type,source_request_id,metadata) values
    (v_origin_arrival,v_origin_id,gen_random_uuid(),'MANUAL_ARRIVAL_RECORDED',p_origin,
      1,p_weight,null,v_agent,'Agent fictif','AGENT','2026-10-01','2026-10-01T12:00:00Z',repeat('a',64),1,2,
      'MANUAL',null,jsonb_build_object('parcels',jsonb_build_array(jsonb_build_object('trackingCode',p_code,'weightKg',p_weight)))),
    (v_departure,v_origin_id,gen_random_uuid(),'SORTIE_POUR_ACHEMINEMENT',p_origin,
      -1,-p_weight,p_code,v_agent,'Agent fictif','AGENT','2026-10-02','2026-10-02T12:05:00Z',repeat('b',64),2,3,
      'INTER_AGENCY_FORWARDING',v_forwarding::text,'{}'),
    (v_destination_arrival,v_destination_id,gen_random_uuid(),'ARRIVAGE_ACHEMINEMENT',p_destination,
      1,p_weight,p_code,v_agent,'Agent fictif','AGENT','2026-10-03','2026-10-03T12:00:00Z',repeat('c',64),1,2,
      'INTER_AGENCY_FORWARDING',v_forwarding::text,jsonb_build_object('parcelId',v_parcel::text));
  insert into public.stockage_parcels values(v_parcel,v_forwarding,p_code,p_destination,
    p_weight,'AVAILABLE','FORWARDING',v_destination_arrival,'2026-10-03T12:00:00Z',1,now());
  update public.stockage_forwarding_manifest_registry set destination_parcel_id=v_parcel
    where forwarding_id=v_forwarding;
  insert into public.stockage_forwarding_orchestrations(request_id,forwarding_id,
    command_fingerprint,state,payment_created,updated_at) values
    (md5('orchestration-'||p_code)::uuid,v_forwarding,
     md5(p_code)||md5(p_code),'ARRIVAL_CONFIRMED',false,now());
  insert into public.fixture_case values(v_forwarding,v_parcel,p_origin,p_destination,p_code,
    p_weight,p_historical_price,p_forwarding_price,v_origin_arrival,v_departure,v_destination_arrival);
end $$;
