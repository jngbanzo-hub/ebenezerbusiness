-- PREPARATORY ONLY. DO NOT APPLY WITHOUT A SEPARATE DISTANT PREFLIGHT AND APPROVAL.
create table public.stockage_payment_orchestrations (
  request_id uuid primary key,
  command_fingerprint text not null unique check (command_fingerprint ~ '^[0-9a-f]{64}$'),
  tracking_code text not null check (tracking_code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'),
  agency text not null check (agency in ('FIH','LSHI','KLZ')),
  actor_id uuid not null references auth.users(id), actor_name text not null,
  expected_amount numeric(18,2) not null check (expected_amount > 0),
  paid_amount numeric(18,2) not null check (paid_amount > 0),
  payment_created boolean not null default false,
  cash_event_id text, stockage_event_id text references public.stockage_events(event_id),
  payment_response jsonb, state text not null default 'PENDING'
    check (state in ('PENDING','COMPLETED','FAILED','COMPENSATION_REQUIRED')),
  last_error text, attempt_count integer not null default 1 check (attempt_count > 0),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
  check (jsonb_typeof(payment_response) is null or jsonb_typeof(payment_response)='object')
);
create index stockage_payment_orchestrations_admin_idx on public.stockage_payment_orchestrations(state,updated_at desc);

create table public.stockage_forwarding_orchestrations (
 request_id uuid primary key, command_fingerprint text not null unique check(command_fingerprint ~ '^[0-9a-f]{64}$'),
 original_tracking_code text not null, origin_agency text not null check(origin_agency in ('FIH','LSHI','KLZ')), destination_agency text not null check(destination_agency in ('FIH','LSHI','KLZ')),
 canonical_weight_kg numeric(18,3) not null check(canonical_weight_kg>0), rate_usd_per_kg numeric(18,2) not null check(rate_usd_per_kg>0), expected_amount numeric(18,2) not null check(expected_amount>0),
 source_status text not null, payment_mode text not null, payment_reference text, actor_id uuid not null references auth.users(id), actor_name text not null,
 payment_created boolean not null default false, payment_response jsonb, forwarding_id uuid,
 state text not null default 'QUOTE_READY' check(state in ('QUOTE_READY','PAYMENT_IN_PROGRESS','PAID_AWAITING_ARRIVAL','ARRIVAL_CONFIRMED','READY_FOR_DELIVERY','DELIVERED','CANCELLED_BY_COMPENSATION','ANOMALY_REQUIRES_ADMIN')),
 last_error text, attempt_count integer not null default 1 check(attempt_count>0), created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 check(origin_agency<>destination_agency), check(jsonb_typeof(payment_response) is null or jsonb_typeof(payment_response)='object')
);

create table public.stockage_forwardings (
  forwarding_id uuid primary key default gen_random_uuid(),
  forwarding_reference text not null unique,
  original_tracking_code text not null,
  origin_agency text not null check (origin_agency in ('FIH','LSHI','KLZ')),
  destination_agency text not null check (destination_agency in ('FIH','LSHI','KLZ')),
  canonical_weight_kg numeric(18,3) not null check (canonical_weight_kg > 0),
  rate_usd_per_kg numeric(18,2) not null check (rate_usd_per_kg > 0),
  amount_expected numeric(18,2) not null check (amount_expected > 0),
  amount_paid numeric(18,2) not null check (amount_paid >= 0 and amount_paid <= amount_expected),
  currency text not null default 'USD' check (currency='USD'),
  status text not null default 'PAID_AWAITING_ARRIVAL'
    check (status in ('PAID_AWAITING_ARRIVAL','ARRIVAL_CONFIRMED','READY_FOR_DELIVERY','DELIVERED','CANCELLED_BY_COMPENSATION','ANOMALY_REQUIRES_ADMIN')),
  creation_request_id uuid not null unique, command_fingerprint text not null check(command_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id), created_by_name text not null,
  cash_event_id text not null, arrival_event_id text references public.stockage_events(event_id), delivery_event_id text references public.stockage_events(event_id),
  arrived_by uuid references auth.users(id), arrived_at timestamptz, delivered_by uuid references auth.users(id), delivered_at timestamptz,
  version bigint not null default 1 check(version>0), created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  check(origin_agency<>destination_agency),
  unique(original_tracking_code,origin_agency,destination_agency)
);
create index stockage_forwardings_destination_idx on public.stockage_forwardings(destination_agency,status,updated_at desc);

create table public.stockage_forwarding_events (
  event_id text primary key, forwarding_id uuid not null references public.stockage_forwardings(forwarding_id),
  request_id uuid not null unique, event_type text not null check(event_type in ('PAYMENT_CONFIRMED','FORWARDING_CREATED','FORWARDING_ARRIVED','FORWARDING_READY_FOR_DELIVERY','FORWARDING_DELIVERED','FORWARDING_ANOMALY_RECORDED','FORWARDING_CANCELLED_BY_COMPENSATION')),
  actor_id uuid not null references auth.users(id), actor_name text not null, agency text not null check(agency in ('FIH','LSHI','KLZ')),
  version_before bigint not null, version_after bigint not null check(version_after=version_before+1),
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'), occurred_at timestamptz not null default clock_timestamp(), metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object')
);

alter table public.stockage_forwarding_orchestrations add constraint stockage_forwarding_orchestration_forwarding_fk foreign key(forwarding_id) references public.stockage_forwardings(forwarding_id);

create table public.stockage_forwarding_anomalies (
 anomaly_id text primary key, anomaly_type text not null, successful_step text not null, failed_step text not null,
 payment_request_id uuid not null unique, forwarding_reference text not null, original_tracking_code text not null,
 origin_agency text not null check(origin_agency in ('FIH','LSHI','KLZ')), destination_agency text not null check(destination_agency in ('FIH','LSHI','KLZ')),
 actor_id uuid not null references auth.users(id), actor_name text not null, compensation_state text not null default 'PENDING_ADMIN_REVIEW',
 admin_message text not null, occurred_at timestamptz not null default clock_timestamp(), metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object')
);

alter table public.stockage_events drop constraint stockage_events_type_check;
alter table public.stockage_events add constraint stockage_events_type_check check(event_type in (
 'OPENING_STOCK_RECORDED','MANUAL_ARRIVAL_RECORDED','CONFIRMED_DELIVERY_RECORDED','ADMIN_STOCK_ADJUSTMENT_RECORDED','STOCK_CORRECTION_RECORDED',
 'SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT','ARRIVAGE_ACHEMINEMENT','CORRECTION_COMPENSATOIRE_ADMIN'));
alter table public.stockage_events drop constraint stockage_events_semantics_check;
alter table public.stockage_events add constraint stockage_events_semantics_check check (
 (event_type='OPENING_STOCK_RECORDED' and parcel_count_delta>=0 and weight_kg_delta>=0 and actor_role='ADMIN') or
 (event_type in ('MANUAL_ARRIVAL_RECORDED','ARRIVAGE_ACHEMINEMENT') and parcel_count_delta>0 and weight_kg_delta>0 and actor_role='AGENT') or
 (event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT') and parcel_count_delta=-1 and weight_kg_delta<0 and tracking_code is not null and actor_role='AGENT') or
 (event_type in ('ADMIN_STOCK_ADJUSTMENT_RECORDED','STOCK_CORRECTION_RECORDED','CORRECTION_COMPENSATOIRE_ADMIN') and actor_role='ADMIN' and (parcel_count_delta<>0 or weight_kg_delta<>0) and reason is not null and btrim(reason)<>'')
);
drop index stockage_events_delivery_unique;
create unique index stockage_events_delivery_unique on public.stockage_events(tracking_code)
 where event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT');

alter table public.stockage_payment_orchestrations enable row level security; alter table public.stockage_payment_orchestrations force row level security;
alter table public.stockage_forwarding_orchestrations enable row level security; alter table public.stockage_forwarding_orchestrations force row level security;
alter table public.stockage_forwardings enable row level security; alter table public.stockage_forwardings force row level security;
alter table public.stockage_forwarding_events enable row level security; alter table public.stockage_forwarding_events force row level security;
alter table public.stockage_forwarding_anomalies enable row level security; alter table public.stockage_forwarding_anomalies force row level security;
create policy stockage_forwardings_read on public.stockage_forwardings for select to authenticated using(exists(select 1 from public.agents a where a.id=auth.uid() and a.actif is true and (upper(btrim(a.role))='ADMIN' or (upper(btrim(a.role))='AGENT' and upper(btrim(a.agence)) in (origin_agency,destination_agency)))));
create policy stockage_forwarding_events_read on public.stockage_forwarding_events for select to authenticated using(exists(select 1 from public.stockage_forwardings f join public.agents a on a.id=auth.uid() where f.forwarding_id=stockage_forwarding_events.forwarding_id and a.actif is true and (upper(btrim(a.role))='ADMIN' or upper(btrim(a.agence)) in (f.origin_agency,f.destination_agency))));
create policy stockage_forwarding_anomalies_admin_read on public.stockage_forwarding_anomalies for select to authenticated using(exists(select 1 from public.agents a where a.id=auth.uid() and a.actif is true and upper(btrim(a.role))='ADMIN'));
revoke all on public.stockage_payment_orchestrations,public.stockage_forwarding_orchestrations,public.stockage_forwardings,public.stockage_forwarding_events,public.stockage_forwarding_anomalies from public,anon,authenticated;
grant select on public.stockage_forwardings,public.stockage_forwarding_events to authenticated;
grant select on public.stockage_forwarding_anomalies to authenticated;
grant select,insert,update on public.stockage_payment_orchestrations,public.stockage_forwarding_orchestrations,public.stockage_forwardings to service_role;
grant select,insert on public.stockage_forwarding_events to service_role;
grant select,insert on public.stockage_forwarding_anomalies to service_role;

create trigger stockage_forwarding_events_reject_mutation before update or delete on public.stockage_forwarding_events for each row execute function public.reject_stockage_immutable_mutation();
create trigger stockage_forwarding_anomalies_reject_mutation before update or delete on public.stockage_forwarding_anomalies for each row execute function public.reject_stockage_immutable_mutation();

alter table public.stockage_anomalies drop constraint stockage_anomalies_type_check;
alter table public.stockage_anomalies add constraint stockage_anomalies_type_check check(anomaly_type in (
 'WEIGHT_MISSING','WEIGHT_AMBIGUOUS','WEIGHT_CONFLICT','AGENCY_MISMATCH','INSUFFICIENT_STOCK','PARCEL_NOT_FOUND','DUPLICATE_DELIVERY_ATTEMPT','IDEMPOTENCY_CONFLICT','VERSION_CONFLICT',
 'PARCEL_NOT_IN_STOCK','PAYMENT_ORCHESTRATION_INCOMPLETE'));

create or replace function public.begin_paid_destination_orchestration(p_request_id uuid,p_command_fingerprint text,p_tracking_code text,p_agency text,p_expected_amount numeric,p_paid_amount numeric,p_actor_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_agent public.agents%rowtype; v_existing public.stockage_payment_orchestrations%rowtype; v_agency text:=upper(btrim(p_agency)); v_code text:=upper(btrim(p_tracking_code));
begin
 select * into v_agent from public.agents where id=p_actor_id;
 if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
 if upper(btrim(v_agent.agence))<>v_agency or v_agency not in ('FIH','LSHI','KLZ') then raise exception 'WRONG_AGENCY'; end if;
 if p_request_id is null or p_command_fingerprint !~ '^[0-9a-f]{64}$' or v_code !~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$' or p_expected_amount<=0 or p_paid_amount<>p_expected_amount then raise exception 'INVALID_PAID_EXIT_COMMAND'; end if;
 select * into v_existing from public.stockage_payment_orchestrations where request_id=p_request_id for update;
 if found then update public.stockage_payment_orchestrations set attempt_count=attempt_count+1,updated_at=clock_timestamp() where request_id=p_request_id; if v_existing.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('state',v_existing.state,'paymentCreated',v_existing.payment_created,'paymentResponse',v_existing.payment_response,'replayed',v_existing.state='COMPLETED','eventId',v_existing.stockage_event_id); end if;
 if not exists(select 1 from public.stockage_accounts where agency=v_agency and status='ACTIVE') then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if;
 if not exists(select 1 from public.cash_accounts where agency=v_agency and status='ACTIVE') then raise exception 'CASH_ACCOUNT_NOT_ACTIVE'; end if;
 insert into public.stockage_payment_orchestrations(request_id,command_fingerprint,tracking_code,agency,actor_id,actor_name,expected_amount,paid_amount) values(p_request_id,p_command_fingerprint,v_code,v_agency,p_actor_id,btrim(v_agent.nom),p_expected_amount,p_paid_amount);
 return jsonb_build_object('state','PENDING','paymentCreated',false,'replayed',false);
end $$;

create or replace function public.checkpoint_paid_destination_payment(p_request_id uuid,p_command_fingerprint text,p_payment_response jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.stockage_payment_orchestrations%rowtype;
begin
 select * into v_row from public.stockage_payment_orchestrations where request_id=p_request_id for update; if not found then raise exception 'PAYMENT_ORCHESTRATION_NOT_FOUND'; end if;
 if v_row.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 if jsonb_typeof(p_payment_response)<>'object' then raise exception 'INVALID_PAYMENT_RESPONSE'; end if;
 update public.stockage_payment_orchestrations set payment_created=true,payment_response=p_payment_response,updated_at=clock_timestamp(),last_error=null where request_id=p_request_id;
 return jsonb_build_object('state',v_row.state,'paymentCreated',true);
end $$;

create or replace function public.finalize_paid_destination_orchestration(p_request_id uuid,p_command_fingerprint text,p_business_date date,p_payment_mode text,p_payment_reference text,p_observation text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_row public.stockage_payment_orchestrations%rowtype; v_account public.stockage_accounts%rowtype; v_parcel public.stockage_parcels%rowtype; v_cash jsonb; v_event_id text; v_hash text; v_anomaly text;
begin
 select * into v_row from public.stockage_payment_orchestrations where request_id=p_request_id for update; if not found then raise exception 'PAYMENT_ORCHESTRATION_NOT_FOUND'; end if;
 if v_row.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 if v_row.state='COMPLETED' then return jsonb_build_object('state','COMPLETED','replayed',true,'eventId',v_row.stockage_event_id,'cashEventId',v_row.cash_event_id); end if;
 if v_row.payment_created is not true or v_row.payment_response is null then raise exception 'PAYMENT_ORCHESTRATION_INCOMPLETE'; end if;
 v_cash:=public.record_cash_payment_credit(v_row.request_id::text,v_row.tracking_code,v_row.agency,v_row.paid_amount,p_business_date,clock_timestamp(),v_row.actor_id,v_row.actor_name,v_row.command_fingerprint,jsonb_build_object('modePaiement',p_payment_mode,'referencePaiement',coalesce(p_payment_reference,''),'observation',coalesce(p_observation,''),'paymentResult',v_row.payment_response,'orchestratedStockExit',true));
 select * into v_parcel from public.stockage_parcels where tracking_code=v_row.tracking_code for update;
 if not found or v_parcel.agency<>v_row.agency or v_parcel.delivery_status<>'AVAILABLE' then
   v_anomaly:='stockage-anomaly-'||encode(extensions.digest(v_row.request_id::text,'sha256'),'hex');
   insert into public.stockage_anomalies(anomaly_id,agency,tracking_code,request_id,anomaly_type,details) values(v_anomaly,v_row.agency,v_row.tracking_code,v_row.request_id,'PARCEL_NOT_IN_STOCK',jsonb_build_object('cashEventId',v_cash->>'eventId','paymentCreated',true)) on conflict(anomaly_id) do nothing;
   update public.stockage_payment_orchestrations set cash_event_id=v_cash->>'eventId',state='COMPENSATION_REQUIRED',last_error='PARCEL_NOT_IN_STOCK',updated_at=clock_timestamp() where request_id=v_row.request_id;
   return jsonb_build_object('state','COMPENSATION_REQUIRED','code','PARCEL_NOT_IN_STOCK','replayed',false);
 end if;
 select * into v_account from public.stockage_accounts where agency=v_row.agency for update;
 if not found or v_account.status<>'ACTIVE' or v_account.current_parcel_count<1 or v_account.current_weight_kg<v_parcel.canonical_weight_kg then
   v_anomaly:='stockage-anomaly-'||encode(extensions.digest(v_row.request_id::text,'sha256'),'hex');
   insert into public.stockage_anomalies(anomaly_id,agency,tracking_code,request_id,anomaly_type,details) values(v_anomaly,v_row.agency,v_row.tracking_code,v_row.request_id,'INSUFFICIENT_STOCK',jsonb_build_object('cashEventId',v_cash->>'eventId','paymentCreated',true)) on conflict(anomaly_id) do nothing;
   update public.stockage_payment_orchestrations set cash_event_id=v_cash->>'eventId',state='COMPENSATION_REQUIRED',last_error='STOCK_INSUFFICIENT',updated_at=clock_timestamp() where request_id=v_row.request_id;
   return jsonb_build_object('state','COMPENSATION_REQUIRED','code','STOCK_INSUFFICIENT','replayed',false);
 end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('type','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','requestId',v_row.request_id,'trackingCode',v_row.tracking_code,'agency',v_row.agency,'actorId',v_row.actor_id,'weightKg',v_parcel.canonical_weight_kg)::text,'sha256'),'hex');
 v_event_id:='stockage-paid-exit-'||encode(extensions.digest(v_row.request_id::text,'sha256'),'hex');
 insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,weight_kg_delta,tracking_code,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,account_version_before,account_version_after,source_type,source_request_id,metadata) values(v_event_id,v_account.id,v_row.request_id,'SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION',v_row.agency,-1,-v_parcel.canonical_weight_kg,v_row.tracking_code,v_row.actor_id,v_row.actor_name,'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,'PAYMENT_ENGINE',v_row.request_id::text,jsonb_build_object('cashEventId',v_cash->>'eventId','paymentResult',v_row.payment_response));
 update public.stockage_parcels set delivery_status='DELIVERED',delivered_event_id=v_event_id,delivered_by=v_row.actor_id,delivered_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where tracking_code=v_row.tracking_code and version=v_parcel.version and delivery_status='AVAILABLE'; if not found then raise exception 'PARCEL_ALREADY_DELIVERED'; end if;
 update public.stockage_accounts set current_parcel_count=current_parcel_count-1,current_weight_kg=current_weight_kg-v_parcel.canonical_weight_kg,version=version+1,updated_at=clock_timestamp() where id=v_account.id and version=v_account.version and current_parcel_count>=1 and current_weight_kg>=v_parcel.canonical_weight_kg; if not found then raise exception 'STOCK_INSUFFICIENT'; end if;
 update public.stockage_payment_orchestrations set cash_event_id=v_cash->>'eventId',stockage_event_id=v_event_id,state='COMPLETED',last_error=null,updated_at=clock_timestamp(),completed_at=clock_timestamp() where request_id=v_row.request_id;
 return jsonb_build_object('state','COMPLETED','eventId',v_event_id,'cashEventId',v_cash->>'eventId','replayed',false,'version',v_account.version+1);
end $$;

revoke all on function public.begin_paid_destination_orchestration(uuid,text,text,text,numeric,numeric,uuid),public.checkpoint_paid_destination_payment(uuid,text,jsonb),public.finalize_paid_destination_orchestration(uuid,text,date,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_paid_destination_orchestration(uuid,text,text,text,numeric,numeric,uuid),public.checkpoint_paid_destination_payment(uuid,text,jsonb),public.finalize_paid_destination_orchestration(uuid,text,date,text,text,text) to service_role;

create or replace function public.begin_inter_agency_forwarding(p_original_tracking_code text,p_origin_agency text,p_destination_agency text,p_canonical_weight_kg numeric,p_expected_amount numeric,p_source_status text,p_payment_mode text,p_payment_reference text,p_request_id uuid,p_command_fingerprint text,p_actor_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_agent public.agents%rowtype; v_existing public.stockage_forwarding_orchestrations%rowtype; v_cash public.cash_accounts%rowtype; v_storage public.stockage_accounts%rowtype; v_origin text:=upper(btrim(p_origin_agency)); v_destination text:=upper(btrim(p_destination_agency)); v_code text:=upper(btrim(p_original_tracking_code)); v_rate numeric; v_expected numeric;
begin
 select * into v_agent from public.agents where id=p_actor_id;
 if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
 if upper(btrim(v_agent.agence))<>v_destination then raise exception 'WRONG_AGENCY'; end if;
 v_rate:=case v_origin||'-'||v_destination when 'FIH-LSHI' then 12 when 'LSHI-FIH' then 13 when 'FIH-KLZ' then 14 when 'KLZ-FIH' then 16 when 'LSHI-KLZ' then 11 when 'KLZ-LSHI' then 13 else null end;
 if v_rate is null or v_origin=v_destination then raise exception 'FORWARDING_ROUTE_NOT_ALLOWED'; end if;
 v_expected:=round(p_canonical_weight_kg*v_rate,2);
 if p_request_id is null or p_command_fingerprint !~ '^[0-9a-f]{64}$' or p_canonical_weight_kg<=0 or p_expected_amount<>v_expected then raise exception 'INVALID_FORWARDING_COMMAND'; end if;
 if upper(btrim(p_source_status)) not in ('EN ATTENTE','ENREGISTRE','EN VOL','EN TRANSIT','ARRIVE') then raise exception 'SOURCE_PARCEL_NOT_ELIGIBLE'; end if;
 select * into v_existing from public.stockage_forwarding_orchestrations where request_id=p_request_id for update;
 if found then update public.stockage_forwarding_orchestrations set attempt_count=attempt_count+1,updated_at=clock_timestamp() where request_id=p_request_id; if v_existing.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('state',v_existing.state,'paymentCreated',v_existing.payment_created,'paymentResponse',v_existing.payment_response,'forwardingId',v_existing.forwarding_id,'replayed',v_existing.state in ('PAID_AWAITING_ARRIVAL','READY_FOR_DELIVERY','DELIVERED')); end if;
 if exists(select 1 from public.stockage_forwardings where original_tracking_code=v_code and origin_agency=v_origin and destination_agency=v_destination and status not in ('DELIVERED','CANCELLED_BY_COMPENSATION')) then raise exception 'FORWARDING_ALREADY_EXISTS'; end if;
 select * into v_cash from public.cash_accounts where agency=v_destination for update; if not found or v_cash.status<>'ACTIVE' then raise exception 'CASH_ACCOUNT_SUSPENDED'; end if; if not exists(select 1 from public.cash_events where cash_account_id=v_cash.id and event_type='OPENING_BALANCE_RECORDED') then raise exception 'INITIAL_BALANCE_REQUIRED'; end if;
 select * into v_storage from public.stockage_accounts where agency=v_destination for update; if not found or v_storage.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_SUSPENDED'; end if; if v_storage.opened_business_date is null then raise exception 'INITIAL_STOCK_REQUIRED'; end if;
 insert into public.stockage_forwarding_orchestrations(request_id,command_fingerprint,original_tracking_code,origin_agency,destination_agency,canonical_weight_kg,rate_usd_per_kg,expected_amount,source_status,payment_mode,payment_reference,actor_id,actor_name,state) values(p_request_id,p_command_fingerprint,v_code,v_origin,v_destination,p_canonical_weight_kg,v_rate,v_expected,upper(btrim(p_source_status)),p_payment_mode,nullif(btrim(p_payment_reference),''),p_actor_id,btrim(v_agent.nom),'PAYMENT_IN_PROGRESS');
 return jsonb_build_object('state','PAYMENT_IN_PROGRESS','paymentCreated',false,'replayed',false);
end $$;

create or replace function public.checkpoint_inter_agency_payment(p_request_id uuid,p_command_fingerprint text,p_payment_response jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.stockage_forwarding_orchestrations%rowtype; begin select * into v_row from public.stockage_forwarding_orchestrations where request_id=p_request_id for update; if not found then raise exception 'FORWARDING_ORCHESTRATION_NOT_FOUND'; end if; if v_row.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if; if jsonb_typeof(p_payment_response)<>'object' then raise exception 'INVALID_PAYMENT_RESPONSE'; end if; update public.stockage_forwarding_orchestrations set payment_created=true,payment_response=p_payment_response,state='PAID_AWAITING_ARRIVAL',last_error=null,updated_at=clock_timestamp() where request_id=p_request_id; return jsonb_build_object('state','PAID_AWAITING_ARRIVAL','paymentCreated',true); end $$;

create or replace function public.finalize_inter_agency_forwarding(p_request_id uuid,p_command_fingerprint text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_row public.stockage_forwarding_orchestrations%rowtype; v_existing public.stockage_forwardings%rowtype; v_id uuid; v_reference text; v_event_id text;
begin
 select * into v_row from public.stockage_forwarding_orchestrations where request_id=p_request_id for update; if not found then raise exception 'FORWARDING_ORCHESTRATION_NOT_FOUND'; end if; if v_row.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 if v_row.forwarding_id is not null then select * into v_existing from public.stockage_forwardings where forwarding_id=v_row.forwarding_id; return jsonb_build_object('forwardingId',v_existing.forwarding_id,'forwardingReference',v_existing.forwarding_reference,'state',v_existing.status,'version',v_existing.version,'replayed',true); end if;
 if v_row.payment_created is not true or v_row.payment_response is null then raise exception 'PAYMENT_ORCHESTRATION_INCOMPLETE'; end if;
 v_reference:=v_row.original_tracking_code||'-'||v_row.origin_agency||'-'||v_row.destination_agency; v_id:=gen_random_uuid(); v_event_id:='forwarding-created-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex');
 insert into public.stockage_forwardings(forwarding_id,forwarding_reference,original_tracking_code,origin_agency,destination_agency,canonical_weight_kg,rate_usd_per_kg,amount_expected,amount_paid,creation_request_id,command_fingerprint,created_by,created_by_name,cash_event_id,metadata) values(v_id,v_reference,v_row.original_tracking_code,v_row.origin_agency,v_row.destination_agency,v_row.canonical_weight_kg,v_row.rate_usd_per_kg,v_row.expected_amount,v_row.expected_amount,p_request_id,v_row.command_fingerprint,v_row.actor_id,v_row.actor_name,'cash-payment-'||encode(extensions.digest(v_row.destination_agency||':'||lower(p_request_id::text),'sha256'),'hex'),jsonb_build_object('paymentEngine','paiements-agents-enregistrer-paiement','paymentResponse',v_row.payment_response));
 insert into public.stockage_forwarding_events values(v_event_id,v_id,p_request_id,'FORWARDING_CREATED',v_row.actor_id,v_row.actor_name,v_row.origin_agency,0,1,v_row.command_fingerprint,clock_timestamp(),jsonb_build_object('paymentCheckpoint',true));
 update public.stockage_forwarding_orchestrations set forwarding_id=v_id,state='PAID_AWAITING_ARRIVAL',updated_at=clock_timestamp(),completed_at=clock_timestamp() where request_id=p_request_id;
 return jsonb_build_object('forwardingId',v_id,'forwardingReference',v_reference,'state','PAID_AWAITING_ARRIVAL','version',1,'replayed',false);
exception when others then
 insert into public.stockage_forwarding_anomalies(anomaly_id,anomaly_type,successful_step,failed_step,payment_request_id,forwarding_reference,original_tracking_code,origin_agency,destination_agency,actor_id,actor_name,admin_message,metadata)
 values('forwarding-anomaly-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex'),'PARTIAL_ORCHESTRATION','CANONICAL_PAYMENT_CONFIRMED','FORWARDING_FINALIZATION',p_request_id,coalesce(v_reference,v_row.original_tracking_code||'-'||v_row.origin_agency||'-'||v_row.destination_agency),v_row.original_tracking_code,v_row.origin_agency,v_row.destination_agency,v_row.actor_id,v_row.actor_name,'Paiement confirmé ; finalisation de l’acheminement à vérifier.',jsonb_build_object('sqlState',sqlstate)) on conflict(payment_request_id) do nothing;
 update public.stockage_forwarding_orchestrations set state='ANOMALY_REQUIRES_ADMIN',last_error=sqlstate,updated_at=clock_timestamp() where request_id=p_request_id and payment_created is true;
 return jsonb_build_object('state','ANOMALY_REQUIRES_ADMIN','code','FORWARDING_FINALIZATION_FAILED','replayed',false);
end $$;

create or replace function public.record_forwarding_arrival(p_forwarding_reference text,p_destination_agency text,p_business_date date,p_request_id uuid,p_actor_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_agent public.agents%rowtype; v_forwarding public.stockage_forwardings%rowtype; v_account public.stockage_accounts%rowtype; v_existing public.stockage_forwarding_events%rowtype; v_hash text; v_event_id text; v_stock_event text;
begin
 select * into v_agent from public.agents where id=p_actor_id; if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
 select * into v_forwarding from public.stockage_forwardings where forwarding_reference=upper(btrim(p_forwarding_reference)) for update; if not found then raise exception 'FORWARDING_NOT_FOUND'; end if;
 if upper(btrim(v_agent.agence))<>v_forwarding.destination_agency or upper(btrim(p_destination_agency))<>v_forwarding.destination_agency then raise exception 'WRONG_AGENCY'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('type','FORWARDING_ARRIVED','reference',v_forwarding.forwarding_reference,'actorId',p_actor_id,'businessDate',p_business_date)::text,'sha256'),'hex');
 select * into v_existing from public.stockage_forwarding_events where request_id=p_request_id; if found then if v_existing.payload_hash<>v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('eventId',v_existing.event_id,'replayed',true,'state',v_forwarding.status); end if;
 if v_forwarding.status<>'PAID_AWAITING_ARRIVAL' then raise exception 'FORWARDING_ALREADY_ARRIVED'; end if;
 select * into v_account from public.stockage_accounts where agency=v_forwarding.destination_agency for update; if not found or v_account.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if;
 insert into public.stockage_parcels(tracking_code,agency,canonical_weight_kg,weight_source,weight_source_reference) values(v_forwarding.forwarding_reference,v_forwarding.destination_agency,v_forwarding.canonical_weight_kg,'PHYSICAL_ARRIVAL','forwarding:'||v_forwarding.forwarding_id);
 v_event_id:='forwarding-arrival-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex'); v_stock_event:='stockage-forwarding-arrival-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex');
 insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,weight_kg_delta,tracking_code,arrival_reference,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,account_version_before,account_version_after,source_type,source_request_id,metadata) values(v_stock_event,v_account.id,p_request_id,'ARRIVAGE_ACHEMINEMENT',v_account.agency,1,v_forwarding.canonical_weight_kg,v_forwarding.forwarding_reference,v_forwarding.forwarding_reference,p_actor_id,btrim(v_agent.nom),'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,'INTER_AGENCY_FORWARDING',v_forwarding.forwarding_id::text,jsonb_build_object('originalTrackingCode',v_forwarding.original_tracking_code));
 update public.stockage_accounts set current_parcel_count=current_parcel_count+1,current_weight_kg=current_weight_kg+v_forwarding.canonical_weight_kg,version=version+1,updated_at=clock_timestamp() where id=v_account.id and version=v_account.version;
 update public.stockage_forwardings set status='ARRIVAL_CONFIRMED',arrival_event_id=v_stock_event,arrived_by=p_actor_id,arrived_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where forwarding_id=v_forwarding.forwarding_id and version=v_forwarding.version;
 insert into public.stockage_forwarding_events values(v_event_id,v_forwarding.forwarding_id,p_request_id,'FORWARDING_ARRIVED',p_actor_id,btrim(v_agent.nom),v_forwarding.destination_agency,v_forwarding.version,v_forwarding.version+1,v_hash,clock_timestamp(),'{}');
 update public.stockage_forwardings set status='READY_FOR_DELIVERY',version=version+1,updated_at=clock_timestamp() where forwarding_id=v_forwarding.forwarding_id and status='ARRIVAL_CONFIRMED';
 return jsonb_build_object('eventId',v_stock_event,'replayed',false,'state','READY_FOR_DELIVERY','version',v_account.version+1);
end $$;

create or replace function public.confirm_forwarding_delivery(p_forwarding_reference text,p_destination_agency text,p_physical_delivery_confirmed boolean,p_business_date date,p_request_id uuid,p_actor_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_agent public.agents%rowtype; v_forwarding public.stockage_forwardings%rowtype; v_account public.stockage_accounts%rowtype; v_parcel public.stockage_parcels%rowtype; v_existing public.stockage_forwarding_events%rowtype; v_hash text; v_event_id text; v_audit_event text;
begin
 select * into v_agent from public.agents where id=p_actor_id; if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
 select * into v_forwarding from public.stockage_forwardings where forwarding_reference=upper(btrim(p_forwarding_reference)) for update; if not found then raise exception 'FORWARDING_NOT_FOUND'; end if;
 if upper(btrim(v_agent.agence))<>v_forwarding.destination_agency or upper(btrim(p_destination_agency))<>v_forwarding.destination_agency then raise exception 'WRONG_AGENCY'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('type','FORWARDING_DELIVERED','reference',v_forwarding.forwarding_reference,'actorId',p_actor_id,'physicalConfirmed',p_physical_delivery_confirmed,'businessDate',p_business_date)::text,'sha256'),'hex');
 select * into v_existing from public.stockage_forwarding_events where request_id=p_request_id; if found then if v_existing.payload_hash<>v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('eventId',v_existing.event_id,'replayed',true,'state',v_forwarding.status); end if;
 if v_forwarding.status='DELIVERED' then raise exception 'FORWARDING_ALREADY_DELIVERED'; end if; if v_forwarding.status<>'READY_FOR_DELIVERY' or p_physical_delivery_confirmed is not true then raise exception 'FORWARDING_NOT_READY'; end if;
 select * into v_parcel from public.stockage_parcels where tracking_code=v_forwarding.forwarding_reference for update; if not found or v_parcel.delivery_status<>'AVAILABLE' then raise exception 'PARCEL_NOT_IN_STOCK'; end if;
 select * into v_account from public.stockage_accounts where agency=v_forwarding.destination_agency for update; if not found or v_account.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if; if v_account.current_parcel_count<1 or v_account.current_weight_kg<v_forwarding.canonical_weight_kg then raise exception 'STOCK_INSUFFICIENT'; end if;
 v_event_id:='stockage-forwarding-delivery-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex'); v_audit_event:='forwarding-delivery-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex');
 insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,weight_kg_delta,tracking_code,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,account_version_before,account_version_after,source_type,source_request_id,metadata) values(v_event_id,v_account.id,p_request_id,'SORTIE_APRES_REMISE_ACHEMINEMENT',v_account.agency,-1,-v_forwarding.canonical_weight_kg,v_forwarding.forwarding_reference,p_actor_id,btrim(v_agent.nom),'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,'INTER_AGENCY_FORWARDING',v_forwarding.forwarding_id::text,jsonb_build_object('originalTrackingCode',v_forwarding.original_tracking_code));
 update public.stockage_parcels set delivery_status='DELIVERED',delivered_event_id=v_event_id,delivered_by=p_actor_id,delivered_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where tracking_code=v_forwarding.forwarding_reference and version=v_parcel.version;
 update public.stockage_accounts set current_parcel_count=current_parcel_count-1,current_weight_kg=current_weight_kg-v_forwarding.canonical_weight_kg,version=version+1,updated_at=clock_timestamp() where id=v_account.id and version=v_account.version and current_parcel_count>=1 and current_weight_kg>=v_forwarding.canonical_weight_kg;
 update public.stockage_forwardings set status='DELIVERED',delivery_event_id=v_event_id,delivered_by=p_actor_id,delivered_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where forwarding_id=v_forwarding.forwarding_id and version=v_forwarding.version;
 insert into public.stockage_forwarding_events values(v_audit_event,v_forwarding.forwarding_id,p_request_id,'FORWARDING_DELIVERED',p_actor_id,btrim(v_agent.nom),v_forwarding.destination_agency,v_forwarding.version,v_forwarding.version+1,v_hash,clock_timestamp(),'{}');
 return jsonb_build_object('eventId',v_event_id,'replayed',false,'state','DELIVERED','version',v_account.version+1);
end $$;

revoke all on function public.begin_inter_agency_forwarding(text,text,text,numeric,numeric,text,text,text,uuid,text,uuid),public.checkpoint_inter_agency_payment(uuid,text,jsonb),public.finalize_inter_agency_forwarding(uuid,text),public.record_forwarding_arrival(text,text,date,uuid,uuid),public.confirm_forwarding_delivery(text,text,boolean,date,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_inter_agency_forwarding(text,text,text,numeric,numeric,text,text,text,uuid,text,uuid),public.checkpoint_inter_agency_payment(uuid,text,jsonb),public.finalize_inter_agency_forwarding(uuid,text),public.record_forwarding_arrival(text,text,date,uuid,uuid),public.confirm_forwarding_delivery(text,text,boolean,date,uuid,uuid) to service_role;
