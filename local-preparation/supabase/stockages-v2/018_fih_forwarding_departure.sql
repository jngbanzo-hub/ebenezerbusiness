-- LOCAL PREPARATION ONLY. Production requires a separate explicit approval.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stockage_parcels' and column_name='parcel_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stockage_parcels' and column_name='forwarding_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stockage_payment_orchestrations' and column_name='parcel_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stockage_payment_orchestrations' and column_name='forwarding_id'
  ) or to_regclass('public.stockage_parcels_native_identity_unique') is null
    or to_regclass('public.stockage_parcels_forwarding_identity_unique') is null
    or to_regclass('public.stockage_payment_forwarding_request_unique') is null
    or to_regprocedure('public.begin_forwarding_destination_payment(uuid,text,uuid,uuid,text,numeric,numeric,uuid)') is null
    or to_regprocedure('public.finalize_forwarding_destination_payment(uuid,text,date,text,text,text)') is null
  then raise exception 'MIGRATION_015_REQUIRED'; end if;

  if to_regprocedure('public.confirm_klz_forwarding_departure(text,text,numeric,text,numeric,numeric,text,date,uuid,text,uuid)') is null
    or to_regprocedure('public.record_forwarding_arrival(text,text,date,uuid,uuid)') is null
    or not exists (
      select 1 from pg_constraint
      where conrelid='public.stockage_forwardings'::regclass
        and conname='stockage_forwardings_financial_lifecycle_check'
        and position('IN_TRANSIT' in pg_get_constraintdef(oid,true))>0
        and position('ARRIVAL_CONFIRMED' in pg_get_constraintdef(oid,true))>0
    )
  then raise exception 'MIGRATION_016_REQUIRED'; end if;

  if to_regprocedure('public.confirm_storage_forwarding_departure(text,text,numeric,text,numeric,numeric,text,date,uuid,text,uuid)') is null
  then raise exception 'MIGRATION_017_REQUIRED'; end if;
end $$;

create or replace function public.confirm_storage_forwarding_departure(
  p_tracking_code text,p_destination_agency text,p_canonical_weight_kg numeric,
  p_forwarding_reference text,p_expected_amount numeric,p_rate_usd_per_kg numeric,
  p_source_status text,p_business_date date,p_request_id uuid,p_command_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_agent public.agents%rowtype; v_parcel public.stockage_parcels%rowtype; v_account public.stockage_accounts%rowtype;
 v_existing public.stockage_forwardings%rowtype; v_id uuid:=gen_random_uuid(); v_code text:=upper(btrim(p_tracking_code));
 v_origin text; v_destination text:=upper(btrim(p_destination_agency)); v_reference text:=upper(btrim(p_forwarding_reference));
 v_rate numeric(18,2); v_hash text; v_forwarding_event_id text; v_stockage_event_id text;
begin
 if p_request_id is null or p_actor_id is null or p_business_date is null or p_canonical_weight_kg<=0
 or p_command_fingerprint !~ '^[0-9a-f]{64}$' or v_code !~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
 then raise exception 'INVALID_FORWARDING_DEPARTURE'; end if;
 select * into v_agent from public.agents where id=p_actor_id for share;
 if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
 v_origin:=upper(btrim(v_agent.agence));
 if v_origin='KLZ' and v_destination='LSHI' then v_rate:=13;
 elsif v_origin='KLZ' and v_destination='FIH' then v_rate:=16;
 elsif v_origin='LSHI' and v_destination='KLZ' then v_rate:=11;
 elsif v_origin='LSHI' and v_destination='FIH' then v_rate:=13;
 elsif v_origin='FIH' and v_destination='LSHI' then v_rate:=12;
 elsif v_origin='FIH' and v_destination='KLZ' then v_rate:=13;
 else raise exception 'FORWARDING_ROUTE_NOT_ALLOWED'; end if;
 if p_rate_usd_per_kg<>v_rate or p_expected_amount<>round(p_canonical_weight_kg*v_rate,2)
 or v_reference<>v_code||'-'||v_origin||'-'||v_destination then raise exception 'INVALID_FORWARDING_QUOTE'; end if;
 select * into v_existing from public.stockage_forwardings where creation_request_id=p_request_id for update;
 if found then
   if v_existing.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('forwardingId',v_existing.forwarding_id,'forwardingReference',v_existing.forwarding_reference,'trackingCode',v_existing.original_tracking_code,'originAgency',v_existing.origin_agency,'destinationAgency',v_existing.destination_agency,'state',v_existing.status,'replayed',true,'version',v_existing.version);
 end if;
 if exists(select 1 from public.stockage_forwarding_orchestrations where request_id=p_request_id or command_fingerprint=p_command_fingerprint)
 or exists(select 1 from public.stockage_forwardings where original_tracking_code=v_code and origin_agency=v_origin and destination_agency=v_destination)
 then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 select * into v_parcel from public.stockage_parcels where agency=v_origin and tracking_code=v_code and forwarding_id is null for update;
 if not found or v_parcel.delivery_status<>'AVAILABLE' then raise exception 'PARCEL_NOT_IN_STOCK'; end if;
 if v_parcel.canonical_weight_kg<>p_canonical_weight_kg then raise exception 'PARCEL_WEIGHT_MISMATCH'; end if;
 select * into v_account from public.stockage_accounts where agency=v_origin for update;
 if not found or v_account.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_SUSPENDED'; end if;
 if v_account.current_parcel_count<1 or v_account.current_weight_kg<p_canonical_weight_kg then raise exception 'INSUFFICIENT_STOCK'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('type','FORWARDING_DEPARTED','trackingCode',v_code,'originAgency',v_origin,'destinationAgency',v_destination,'weightKg',p_canonical_weight_kg,'amountExpected',p_expected_amount,'requestId',p_request_id,'actorId',p_actor_id)::text,'sha256'),'hex');
 v_forwarding_event_id:='forwarding-departure-'||encode(extensions.digest(lower(p_request_id::text),'sha256'),'hex');
 v_stockage_event_id:='stock-forwarding-departure-'||encode(extensions.digest(lower(p_request_id::text),'sha256'),'hex');
 insert into public.stockage_forwardings(forwarding_id,forwarding_reference,original_tracking_code,origin_agency,destination_agency,canonical_weight_kg,rate_usd_per_kg,amount_expected,amount_paid,status,creation_request_id,command_fingerprint,created_by,created_by_name,cash_event_id,metadata)
 values(v_id,v_reference,v_code,v_origin,v_destination,p_canonical_weight_kg,v_rate,p_expected_amount,0,'IN_TRANSIT',p_request_id,p_command_fingerprint,p_actor_id,btrim(v_agent.nom),null,jsonb_build_object('cycle','DESTINATION_PAYMENT_AFTER_ARRIVAL','sourceStatus',p_source_status,'parcelId',v_parcel.parcel_id));
 insert into public.stockage_forwarding_orchestrations(request_id,command_fingerprint,original_tracking_code,origin_agency,destination_agency,canonical_weight_kg,rate_usd_per_kg,expected_amount,source_status,payment_mode,payment_reference,actor_id,actor_name,payment_created,payment_response,forwarding_id,state,completed_at)
 values(p_request_id,p_command_fingerprint,v_code,v_origin,v_destination,p_canonical_weight_kg,v_rate,p_expected_amount,p_source_status,'DESTINATION_AFTER_ARRIVAL',null,p_actor_id,btrim(v_agent.nom),false,null,v_id,'IN_TRANSIT',clock_timestamp());
 delete from public.stockage_parcels where parcel_id=v_parcel.parcel_id and version=v_parcel.version and delivery_status='AVAILABLE';
 if not found then raise exception 'PARCEL_VERSION_CONFLICT'; end if;
 insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,weight_kg_delta,tracking_code,arrival_reference,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,account_version_before,account_version_after,source_type,source_request_id,metadata)
 values(v_stockage_event_id,v_account.id,p_request_id,'SORTIE_POUR_ACHEMINEMENT',v_origin,-1,-p_canonical_weight_kg,v_code,v_reference,p_actor_id,btrim(v_agent.nom),'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,'INTER_AGENCY_FORWARDING',v_id::text,jsonb_build_object('originAgency',v_origin,'destinationAgency',v_destination,'forwardingReference',v_reference));
 update public.stockage_accounts set current_parcel_count=current_parcel_count-1,current_weight_kg=current_weight_kg-p_canonical_weight_kg,version=version+1,updated_at=clock_timestamp() where id=v_account.id and version=v_account.version;
 if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;
 insert into public.stockage_forwarding_events(event_id,forwarding_id,request_id,event_type,actor_id,actor_name,agency,version_before,version_after,payload_hash,occurred_at,metadata)
 values(v_forwarding_event_id,v_id,p_request_id,'FORWARDING_DEPARTED',p_actor_id,btrim(v_agent.nom),v_origin,0,1,v_hash,clock_timestamp(),jsonb_build_object('trackingCode',v_code,'originAgency',v_origin,'destinationAgency',v_destination,'stockageEventId',v_stockage_event_id));
 return jsonb_build_object('forwardingId',v_id,'forwardingReference',v_reference,'trackingCode',v_code,'originAgency',v_origin,'destinationAgency',v_destination,'state','IN_TRANSIT','eventId',v_forwarding_event_id,'stockageEventId',v_stockage_event_id,'paymentCreated',false,'replayed',false,'version',1);
end $$;

revoke all on function public.confirm_storage_forwarding_departure(text,text,numeric,text,numeric,numeric,text,date,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.confirm_storage_forwarding_departure(text,text,numeric,text,numeric,numeric,text,date,uuid,text,uuid) to service_role;

commit;
