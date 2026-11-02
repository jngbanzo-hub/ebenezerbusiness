-- Disposable PostgreSQL fixture only. Never run on Supabase.
create schema auth;
create schema extensions;
do $$begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key);
create table public.agents(id uuid primary key references auth.users(id), nom text, role text, actif boolean, agence text);
create table public.stockage_accounts(id uuid primary key,agency text unique,status text,
  current_parcel_count integer,current_weight_kg numeric,version bigint,updated_at timestamptz,
  unique(id,agency),check(agency in ('FIH','LSHI','KLZ')),
  check(status in ('ACTIVE','SUSPENDED')),check(current_parcel_count>=0),
  check(current_weight_kg>=0),check(version>0));
create table public.stockage_events(event_id text primary key,account_id uuid,request_id uuid unique,
  event_type text,agency text,parcel_count_delta integer,weight_kg_delta numeric,
  tracking_code text,actor_id uuid,actor_name text,actor_role text,business_date date,
  occurred_at timestamptz,payload_hash text,account_version_before bigint,
  account_version_after bigint,source_type text,source_request_id text,metadata jsonb,
  foreign key(account_id,agency) references public.stockage_accounts(id,agency),
  unique(account_id,account_version_after),check(account_version_before>0),
  check(account_version_after=account_version_before+1),
  check(event_type<>'SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION' or
    (parcel_count_delta=-1 and weight_kg_delta<0 and tracking_code is not null
      and actor_role='AGENT')));
create table public.stockage_parcels(parcel_id uuid primary key,agency text,tracking_code text,
  forwarding_id uuid,canonical_weight_kg numeric,delivery_status text,
  weight_source text,weight_source_reference text,delivered_event_id text,delivered_by uuid,
  delivered_at timestamptz,version bigint,updated_at timestamptz,
  foreign key(delivered_event_id) references public.stockage_events(event_id),
  check(delivery_status in ('AVAILABLE','DELIVERED')),
  check((delivery_status='AVAILABLE' and delivered_event_id is null and delivered_by is null and delivered_at is null)
    or (delivery_status='DELIVERED' and delivered_event_id is not null and delivered_by is not null and delivered_at is not null)));
create unique index stockage_events_native_delivery_unique on public.stockage_events(agency,tracking_code)
  where event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION',
    'SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT')
    and source_type<>'INTER_AGENCY_FORWARDING';
create table public.stockage_payment_orchestrations(request_id uuid primary key,
  command_fingerprint text,tracking_code text,agency text,actor_id uuid,actor_name text,
  expected_amount numeric,paid_amount numeric,payment_created boolean,payment_response jsonb,
  cash_event_id text,stockage_event_id text,state text,parcel_id uuid,forwarding_id uuid,
  last_error text,created_at timestamptz,updated_at timestamptz,completed_at timestamptz,
  foreign key(parcel_id) references public.stockage_parcels(parcel_id),
  foreign key(stockage_event_id) references public.stockage_events(event_id),
  constraint stockage_payment_forwarding_identity_check check (
    (parcel_id is null and forwarding_id is null) or
    (parcel_id is not null and forwarding_id is not null)));
create table public.stockage_forwardings(forwarding_id uuid,original_tracking_code text,destination_agency text);
create table public.cash_accounts(id uuid primary key,agency text not null unique,
  currency text not null default 'USD',status text not null default 'ACTIVE',
  version integer not null default 1,created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique(id,agency),check(agency in ('FIH','LSHI','KLZ')),
  check(currency='USD'),check(status in ('ACTIVE','SUSPENDED','CLOSED')),check(version>0));
create table public.cash_events(
  event_id text primary key,cash_account_id uuid not null references public.cash_accounts(id),
  agency text not null,business_date date not null,occurred_at timestamptz not null,
  event_type text not null,direction text not null,amount numeric(18,2) not null,
  currency text not null default 'USD',source_type text not null,source_id text not null,
  source_request_id text not null,actor_user_id uuid not null references auth.users(id),
  actor_name_snapshot text not null,corrected_event_id text references public.cash_events(event_id),
  reason text,version_before integer not null,version_after integer not null,
  metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),
  foreign key(cash_account_id,agency) references public.cash_accounts(id,agency),
  unique(source_type,source_id),unique(source_type,source_request_id),
  unique(cash_account_id,version_after),
  check(agency in ('FIH','LSHI','KLZ')),check(currency='USD'),check(amount>0),
  check(direction in ('CREDIT','DEBIT')),
  check(event_type in ('OPENING_BALANCE_RECORDED','PAYMENT_CREDIT_RECORDED',
    'EXPENSE_DEBIT_RECORDED','ADMIN_ADJUSTMENT_RECORDED','CASH_CORRECTION_RECORDED')),
  check(version_before>=0 and version_after=version_before+1),
  check(jsonb_typeof(metadata)='object'),check(btrim(actor_name_snapshot)<>''),
  check(btrim(source_type)<>'' and btrim(source_id)<>'' and btrim(source_request_id)<>''));
create function public.fixture_fail_exit() returns trigger language plpgsql as $$
begin
  if new.event_type='SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION'
     and current_setting('test.fail_exit',true)='true'
  then raise exception 'SYNTHETIC_EXIT_FAILURE'; end if;
  return new;
end $$;
create trigger fixture_fail_exit before insert on public.stockage_events
  for each row execute function public.fixture_fail_exit();
create function public.fixture_immutable_log() returns trigger language plpgsql as $$
begin raise exception 'IMMUTABLE_LOG'; end $$;
create trigger cash_events_reject_mutation before update or delete on public.cash_events
  for each row execute function public.fixture_immutable_log();
create trigger stockage_events_reject_mutation before update or delete on public.stockage_events
  for each row execute function public.fixture_immutable_log();
create function public.seed_legacy_resume(p_agency text,p_code text,p_request uuid,p_parcel uuid,p_arrival uuid)
returns void language plpgsql as $$
declare v_actor uuid='00000000-0000-4000-8000-000000000001';
begin
  truncate public.cash_events,public.cash_accounts,public.stockage_forwardings,public.stockage_payment_orchestrations,
    public.stockage_parcels,public.stockage_events,public.stockage_accounts,public.agents,
    auth.users cascade;
  insert into auth.users values(v_actor),('00000000-0000-4000-8000-000000000004');
  insert into public.agents values
    (v_actor,'Agent historique','AGENT',true,p_agency),
    ('00000000-0000-4000-8000-000000000004','Agent repreneur','AGENT',true,p_agency);
  insert into public.stockage_accounts values('00000000-0000-4000-8000-000000000002',p_agency,'ACTIVE',1,9,2,now());
  insert into public.cash_accounts(id,agency,created_by) values
    ('00000000-0000-4000-8000-000000000003',p_agency,v_actor);
  insert into public.stockage_events values('arrival-one','00000000-0000-4000-8000-000000000002',
    p_arrival,'MANUAL_ARRIVAL_RECORDED',p_agency,1,9,null,v_actor,'Agent historique','AGENT',
    '2026-10-26','2026-10-26T09:00:00Z',repeat('a',64),1,2,'PHYSICAL_AGENT_CONFIRMATION',null,
    jsonb_build_object('parcels',jsonb_build_array(jsonb_build_object('trackingCode',p_code,'weightKg',9))));
  insert into public.stockage_parcels values(p_parcel,p_agency,p_code,null,9,'AVAILABLE',
    'PHYSICAL_ARRIVAL','arrival:'||p_arrival,null,null,null,1,now());
  insert into public.stockage_payment_orchestrations values(p_request,repeat('b',64),p_code,p_agency,
    v_actor,'Agent historique',99,99,false,null,null,null,'PENDING',null,null,null,
    '2026-11-02T09:30:00Z',now(),null);
end $$;
