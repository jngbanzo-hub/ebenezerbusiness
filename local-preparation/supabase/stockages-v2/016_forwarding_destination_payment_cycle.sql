-- LOCAL PREPARATION ONLY. Apply 015 first. Production requires a separate approval.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stockage_payment_orchestrations' and column_name='parcel_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stockage_payment_orchestrations' and column_name='forwarding_id'
  ) or to_regprocedure('public.begin_forwarding_destination_payment(uuid,text,uuid,uuid,text,numeric,numeric,uuid)') is null
    or to_regprocedure('public.finalize_forwarding_destination_payment(uuid,text,date,text,text,text)') is null
    or to_regclass('public.stockage_payment_forwarding_request_unique') is null
    or to_regclass('public.stockage_events_native_delivery_unique') is null
    or to_regclass('public.stockage_events_forwarding_delivery_unique') is null
  then raise exception 'MIGRATION_015_REQUIRED'; end if;
end $$;

alter table public.stockage_forwardings alter column cash_event_id drop not null;
alter table public.stockage_forwardings add constraint stockage_forwardings_financial_lifecycle_check check (
  (status in ('IN_TRANSIT','ARRIVAL_CONFIRMED') and amount_paid=0 and cash_event_id is null)
  or (status in ('PAID_AWAITING_ARRIVAL','READY_FOR_DELIVERY','DELIVERED') and amount_paid=amount_expected and cash_event_id is not null)
  or status in ('CANCELLED_BY_COMPENSATION','ANOMALY_REQUIRES_ADMIN')
);

create function public.confirm_klz_forwarding_departure(
  p_tracking_code text,p_destination_agency text,p_canonical_weight_kg numeric,
  p_forwarding_reference text,p_expected_amount numeric,p_rate_usd_per_kg numeric,
  p_source_status text,p_business_date date,p_request_id uuid,p_command_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_agent public.agents%rowtype; v_parcel public.stockage_parcels%rowtype; v_account public.stockage_accounts%rowtype;
 v_existing public.stockage_forwardings%rowtype; v_id uuid:=gen_random_uuid(); v_code text:=upper(btrim(p_tracking_code));
 v_destination text:=upper(btrim(p_destination_agency)); v_reference text:=upper(btrim(p_forwarding_reference));
 v_rate numeric(18,2); v_hash text; v_forwarding_event_id text; v_stockage_event_id text;
begin
 if p_request_id is null or p_actor_id is null or p_business_date is null or p_canonical_weight_kg<=0
 or p_command_fingerprint !~ '^[0-9a-f]{64}$' or v_code !~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
 or v_destination not in ('LSHI','FIH') then raise exception 'INVALID_FORWARDING_DEPARTURE'; end if;
 v_rate:=case v_destination when 'LSHI' then 13 when 'FIH' then 16 end;
 if p_rate_usd_per_kg<>v_rate or p_expected_amount<>round(p_canonical_weight_kg*v_rate,2)
 or v_reference<>v_code||'-KLZ-'||v_destination then raise exception 'INVALID_FORWARDING_QUOTE'; end if;
 select * into v_agent from public.agents where id=p_actor_id for share;
 if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
 if upper(btrim(v_agent.agence))<>'KLZ' then raise exception 'WRONG_AGENCY'; end if;
 select * into v_existing from public.stockage_forwardings where creation_request_id=p_request_id for update;
 if found then
   if v_existing.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('forwardingId',v_existing.forwarding_id,'forwardingReference',v_existing.forwarding_reference,'trackingCode',v_existing.original_tracking_code,'destinationAgency',v_existing.destination_agency,'state',v_existing.status,'replayed',true,'version',v_existing.version);
 end if;
 if exists(select 1 from public.stockage_forwarding_orchestrations where request_id=p_request_id or command_fingerprint=p_command_fingerprint)
 or exists(select 1 from public.stockage_forwardings where original_tracking_code=v_code and origin_agency='KLZ' and destination_agency=v_destination)
 then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 select * into v_parcel from public.stockage_parcels where agency='KLZ' and tracking_code=v_code and forwarding_id is null for update;
 if not found or v_parcel.delivery_status<>'AVAILABLE' then raise exception 'PARCEL_NOT_IN_STOCK'; end if;
 if v_parcel.canonical_weight_kg<>p_canonical_weight_kg then raise exception 'PARCEL_WEIGHT_MISMATCH'; end if;
 select * into v_account from public.stockage_accounts where agency='KLZ' for update;
 if not found or v_account.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_SUSPENDED'; end if;
 if v_account.current_parcel_count<1 or v_account.current_weight_kg<p_canonical_weight_kg then raise exception 'INSUFFICIENT_STOCK'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('type','FORWARDING_DEPARTED','trackingCode',v_code,'destinationAgency',v_destination,'weightKg',p_canonical_weight_kg,'amountExpected',p_expected_amount,'requestId',p_request_id,'actorId',p_actor_id)::text,'sha256'),'hex');
 v_forwarding_event_id:='forwarding-departure-'||encode(extensions.digest(lower(p_request_id::text),'sha256'),'hex');
 v_stockage_event_id:='stock-forwarding-departure-'||encode(extensions.digest(lower(p_request_id::text),'sha256'),'hex');
 insert into public.stockage_forwardings(forwarding_id,forwarding_reference,original_tracking_code,origin_agency,destination_agency,canonical_weight_kg,rate_usd_per_kg,amount_expected,amount_paid,status,creation_request_id,command_fingerprint,created_by,created_by_name,cash_event_id,metadata)
 values(v_id,v_reference,v_code,'KLZ',v_destination,p_canonical_weight_kg,v_rate,p_expected_amount,0,'IN_TRANSIT',p_request_id,p_command_fingerprint,p_actor_id,btrim(v_agent.nom),null,jsonb_build_object('cycle','DESTINATION_PAYMENT_AFTER_ARRIVAL','sourceStatus',p_source_status,'parcelId',v_parcel.parcel_id));
 insert into public.stockage_forwarding_orchestrations(request_id,command_fingerprint,original_tracking_code,origin_agency,destination_agency,canonical_weight_kg,rate_usd_per_kg,expected_amount,source_status,payment_mode,payment_reference,actor_id,actor_name,payment_created,payment_response,forwarding_id,state,completed_at)
 values(p_request_id,p_command_fingerprint,v_code,'KLZ',v_destination,p_canonical_weight_kg,v_rate,p_expected_amount,p_source_status,'DESTINATION_AFTER_ARRIVAL',null,p_actor_id,btrim(v_agent.nom),false,null,v_id,'IN_TRANSIT',clock_timestamp());
 delete from public.stockage_parcels where parcel_id=v_parcel.parcel_id and version=v_parcel.version and delivery_status='AVAILABLE';
 if not found then raise exception 'PARCEL_VERSION_CONFLICT'; end if;
 insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,weight_kg_delta,tracking_code,arrival_reference,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,account_version_before,account_version_after,source_type,source_request_id,metadata)
 values(v_stockage_event_id,v_account.id,p_request_id,'SORTIE_POUR_ACHEMINEMENT','KLZ',-1,-p_canonical_weight_kg,v_code,v_reference,p_actor_id,btrim(v_agent.nom),'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,'INTER_AGENCY_FORWARDING',v_id::text,jsonb_build_object('destinationAgency',v_destination,'forwardingReference',v_reference));
 update public.stockage_accounts set current_parcel_count=current_parcel_count-1,current_weight_kg=current_weight_kg-p_canonical_weight_kg,version=version+1,updated_at=clock_timestamp() where id=v_account.id and version=v_account.version;
 if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;
 insert into public.stockage_forwarding_events(event_id,forwarding_id,request_id,event_type,actor_id,actor_name,agency,version_before,version_after,payload_hash,occurred_at,metadata)
 values(v_forwarding_event_id,v_id,p_request_id,'FORWARDING_DEPARTED',p_actor_id,btrim(v_agent.nom),'KLZ',0,1,v_hash,clock_timestamp(),jsonb_build_object('trackingCode',v_code,'destinationAgency',v_destination,'stockageEventId',v_stockage_event_id));
 return jsonb_build_object('forwardingId',v_id,'forwardingReference',v_reference,'trackingCode',v_code,'destinationAgency',v_destination,'state','IN_TRANSIT','eventId',v_forwarding_event_id,'stockageEventId',v_stockage_event_id,'paymentCreated',false,'replayed',false,'version',1);
end $$;

create or replace function public.record_forwarding_arrival(p_forwarding_reference text,p_destination_agency text,p_business_date date,p_request_id uuid,p_actor_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_agent public.agents%rowtype; v_forwarding public.stockage_forwardings%rowtype; v_account public.stockage_accounts%rowtype; v_existing public.stockage_forwarding_events%rowtype; v_hash text; v_event_id text; v_stock_event text; v_parcel_id uuid;
begin
 select * into v_agent from public.agents where id=p_actor_id; if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
 select * into v_forwarding from public.stockage_forwardings where forwarding_reference=upper(btrim(p_forwarding_reference)) for update; if not found then raise exception 'FORWARDING_NOT_FOUND'; end if;
 if upper(btrim(v_agent.agence))<>v_forwarding.destination_agency or upper(btrim(p_destination_agency))<>v_forwarding.destination_agency then raise exception 'WRONG_AGENCY'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('type','FORWARDING_ARRIVED','forwardingId',v_forwarding.forwarding_id,'actorId',p_actor_id,'businessDate',p_business_date)::text,'sha256'),'hex');
 select * into v_existing from public.stockage_forwarding_events where request_id=p_request_id;
 if found then if v_existing.forwarding_id<>v_forwarding.forwarding_id or v_existing.event_type<>'FORWARDING_ARRIVED' or v_existing.payload_hash<>v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('forwardingId',v_forwarding.forwarding_id,'eventId',v_existing.event_id,'replayed',true,'state',v_forwarding.status,'weightKg',v_forwarding.canonical_weight_kg); end if;
 if v_forwarding.status<>'IN_TRANSIT' or v_forwarding.amount_paid<>0 or v_forwarding.cash_event_id is not null then raise exception 'FORWARDING_NOT_IN_TRANSIT'; end if;
 select * into v_account from public.stockage_accounts where agency=v_forwarding.destination_agency for update; if not found or v_account.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if;
 v_parcel_id:=(v_forwarding.metadata->>'parcelId')::uuid;
 if v_parcel_id is null then raise exception 'FORWARDING_IDENTITY_MISSING'; end if;
 insert into public.stockage_parcels(parcel_id,tracking_code,agency,canonical_weight_kg,weight_source,weight_source_reference,forwarding_id) values(v_parcel_id,v_forwarding.original_tracking_code,v_forwarding.destination_agency,v_forwarding.canonical_weight_kg,'PHYSICAL_ARRIVAL','forwarding:'||v_forwarding.forwarding_id,v_forwarding.forwarding_id);
 v_event_id:='forwarding-arrival-'||encode(extensions.digest(lower(p_request_id::text),'sha256'),'hex'); v_stock_event:='stockage-forwarding-arrival-'||encode(extensions.digest(lower(p_request_id::text),'sha256'),'hex');
 insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,weight_kg_delta,tracking_code,arrival_reference,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,account_version_before,account_version_after,source_type,source_request_id,metadata)
 values(v_stock_event,v_account.id,p_request_id,'ARRIVAGE_ACHEMINEMENT',v_account.agency,1,v_forwarding.canonical_weight_kg,v_forwarding.original_tracking_code,v_forwarding.forwarding_reference,p_actor_id,btrim(v_agent.nom),'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,'INTER_AGENCY_FORWARDING',v_forwarding.forwarding_id::text,jsonb_build_object('parcelId',v_parcel_id,'forwardingReference',v_forwarding.forwarding_reference));
 update public.stockage_accounts set current_parcel_count=current_parcel_count+1,current_weight_kg=current_weight_kg+v_forwarding.canonical_weight_kg,version=version+1,updated_at=clock_timestamp() where id=v_account.id and version=v_account.version;
 if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;
 update public.stockage_forwardings set status='ARRIVAL_CONFIRMED',arrival_event_id=v_stock_event,arrived_by=p_actor_id,arrived_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where forwarding_id=v_forwarding.forwarding_id and version=v_forwarding.version and status='IN_TRANSIT';
 if not found then raise exception 'FORWARDING_VERSION_CONFLICT'; end if;
 update public.stockage_forwarding_orchestrations set state='ARRIVAL_CONFIRMED',updated_at=clock_timestamp() where forwarding_id=v_forwarding.forwarding_id and state='IN_TRANSIT';
 if not found then raise exception 'FORWARDING_ORCHESTRATION_CONFLICT'; end if;
 insert into public.stockage_forwarding_events(event_id,forwarding_id,request_id,event_type,actor_id,actor_name,agency,version_before,version_after,payload_hash,occurred_at,metadata)
 values(v_event_id,v_forwarding.forwarding_id,p_request_id,'FORWARDING_ARRIVED',p_actor_id,btrim(v_agent.nom),v_forwarding.destination_agency,v_forwarding.version,v_forwarding.version+1,v_hash,clock_timestamp(),jsonb_build_object('parcelId',v_parcel_id,'stockageEventId',v_stock_event));
 return jsonb_build_object('forwardingId',v_forwarding.forwarding_id,'parcelId',v_parcel_id,'eventId',v_stock_event,'replayed',false,'state','ARRIVAL_CONFIRMED','weightKg',v_forwarding.canonical_weight_kg,'version',v_account.version+1);
end $$;

create or replace function public.finalize_forwarding_destination_payment(p_request_id uuid,p_command_fingerprint text,p_business_date date,p_payment_mode text,p_payment_reference text,p_observation text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_row public.stockage_payment_orchestrations%rowtype; v_parcel public.stockage_parcels%rowtype; v_forwarding public.stockage_forwardings%rowtype; v_cash jsonb; v_event_id text; v_hash text;
begin
 select * into v_row from public.stockage_payment_orchestrations where request_id=p_request_id for update;
 if not found or v_row.forwarding_id is null or v_row.parcel_id is null then raise exception 'PAYMENT_ORCHESTRATION_NOT_FOUND'; end if;
 if v_row.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 if v_row.state='COMPLETED' then return jsonb_build_object('state','COMPLETED','replayed',true,'cashEventId',v_row.cash_event_id,'forwardingId',v_row.forwarding_id,'parcelId',v_row.parcel_id); end if;
 if v_row.payment_created is not true or v_row.payment_response is null then raise exception 'PAYMENT_ORCHESTRATION_INCOMPLETE'; end if;
 select * into v_forwarding from public.stockage_forwardings where forwarding_id=v_row.forwarding_id for update;
 select * into v_parcel from public.stockage_parcels where parcel_id=v_row.parcel_id and forwarding_id=v_row.forwarding_id for update;
 if not found or v_parcel.agency<>v_row.agency or v_parcel.delivery_status not in ('AVAILABLE','PRESENT') then raise exception 'PARCEL_NOT_IN_STOCK'; end if;
 if v_forwarding.status<>'ARRIVAL_CONFIRMED' or v_forwarding.destination_agency<>v_row.agency or v_forwarding.amount_paid<>0 or v_forwarding.cash_event_id is not null or v_forwarding.amount_expected<>v_row.paid_amount then raise exception 'FORWARDING_NOT_READY_FOR_PAYMENT'; end if;
 v_cash:=public.record_cash_payment_credit(v_row.request_id::text,v_row.tracking_code,v_row.agency,v_row.paid_amount,p_business_date,clock_timestamp(),v_row.actor_id,v_row.actor_name,v_row.command_fingerprint,jsonb_build_object('modePaiement',p_payment_mode,'referencePaiement',coalesce(p_payment_reference,''),'observation',coalesce(p_observation,''),'paymentResult',v_row.payment_response,'forwardingId',v_row.forwarding_id,'parcelId',v_row.parcel_id));
 v_hash:=encode(extensions.digest(jsonb_build_object('type','PAYMENT_CONFIRMED','requestId',v_row.request_id,'parcelId',v_row.parcel_id,'forwardingId',v_row.forwarding_id,'agency',v_row.agency,'actorId',v_row.actor_id,'amount',v_row.paid_amount)::text,'sha256'),'hex');
 v_event_id:='forwarding-payment-'||encode(extensions.digest(lower(v_row.request_id::text),'sha256'),'hex');
 update public.stockage_forwardings set amount_paid=amount_expected,cash_event_id=v_cash->>'eventId',status='READY_FOR_DELIVERY',version=version+1,updated_at=clock_timestamp() where forwarding_id=v_row.forwarding_id and version=v_forwarding.version and status='ARRIVAL_CONFIRMED';
 if not found then raise exception 'FORWARDING_VERSION_CONFLICT'; end if;
 insert into public.stockage_forwarding_events(event_id,forwarding_id,request_id,event_type,actor_id,actor_name,agency,version_before,version_after,payload_hash,occurred_at,metadata)
 values(v_event_id,v_row.forwarding_id,v_row.request_id,'PAYMENT_CONFIRMED',v_row.actor_id,v_row.actor_name,v_row.agency,v_forwarding.version,v_forwarding.version+1,v_hash,clock_timestamp(),jsonb_build_object('cashEventId',v_cash->>'eventId','parcelId',v_row.parcel_id));
 update public.stockage_forwarding_orchestrations set payment_created=true,payment_response=v_row.payment_response,state='READY_FOR_DELIVERY',updated_at=clock_timestamp() where forwarding_id=v_row.forwarding_id and state='ARRIVAL_CONFIRMED' and payment_created is false;
 if not found then raise exception 'FORWARDING_ORCHESTRATION_CONFLICT'; end if;
 update public.stockage_payment_orchestrations set cash_event_id=v_cash->>'eventId',state='COMPLETED',last_error=null,updated_at=clock_timestamp(),completed_at=clock_timestamp() where request_id=v_row.request_id;
 return jsonb_build_object('state','COMPLETED','forwardingState','READY_FOR_DELIVERY','cashEventId',v_cash->>'eventId','forwardingId',v_row.forwarding_id,'parcelId',v_row.parcel_id,'replayed',false,'version',v_forwarding.version+1);
end $$;

revoke all on function public.confirm_klz_forwarding_departure(text,text,numeric,text,numeric,numeric,text,date,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.confirm_klz_forwarding_departure(text,text,numeric,text,numeric,numeric,text,date,uuid,text,uuid) to service_role;

commit;
