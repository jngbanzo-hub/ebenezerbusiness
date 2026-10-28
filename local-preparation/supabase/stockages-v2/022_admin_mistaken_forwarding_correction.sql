-- LOCAL PREPARATION ONLY. NOT APPLIED TO PRODUCTION.
-- Must be reviewed against the live schema and tested on an isolated database before any approval.
-- The server verifies the external canonical manifest and P1 before invoking this atomic RPC.
begin;

create function public.correct_mistaken_forwarding(
  p_request_id uuid, p_forwarding_id uuid, p_parcel_id uuid,
  p_expected_destination_agency text, p_expected_forwarding_version bigint,
  p_origin_arrival_event_id text, p_departure_event_id text, p_destination_arrival_event_id text,
  p_historical_expected_usd numeric, p_historical_paid_usd numeric, p_current_native_expected_usd numeric,
  p_manifest_source text, p_manifest_date date,
  p_reason text, p_physical_confirmed boolean, p_actor_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions as $$
declare
  v_actor public.agents%rowtype;
  v_forwarding public.stockage_forwardings%rowtype;
  v_parcel public.stockage_parcels%rowtype;
  v_origin public.stockage_accounts%rowtype;
  v_destination public.stockage_accounts%rowtype;
  v_origin_arrival public.stockage_events%rowtype;
  v_departure public.stockage_events%rowtype;
  v_arrival public.stockage_events%rowtype;
  v_prior public.stockage_admin_audit%rowtype;
  v_now timestamptz := clock_timestamp();
  v_business_date date := (clock_timestamp() at time zone 'Africa/Porto-Novo')::date;
  v_out_event text := 'stockage-forwarding-correction-out-' || replace(p_request_id::text,'-','');
  v_in_event text := 'stockage-forwarding-correction-in-' || replace(p_request_id::text,'-','');
  v_forwarding_event text := 'forwarding-correction-' || replace(p_request_id::text,'-','');
  v_hash text;
begin
  if p_request_id is null or p_forwarding_id is null or p_parcel_id is null or p_actor_id is null
     or p_physical_confirmed is not true or length(btrim(coalesce(p_reason,'')))<10
     or p_historical_expected_usd is null or p_historical_expected_usd<=0
     or p_historical_paid_usd is distinct from 0
     or p_current_native_expected_usd is distinct from p_historical_expected_usd
     or p_manifest_date is null or p_manifest_source is null then
    raise exception 'CORRECTION_CONFIRMATION_OR_PROOF_REQUIRED';
  end if;
  select * into v_actor from public.agents where id=p_actor_id for share;
  if not found or v_actor.actif is not true or upper(btrim(v_actor.role))<>'ADMIN' then
    raise exception 'ACTIVE_ADMIN_REQUIRED';
  end if;
  select * into v_prior from public.stockage_admin_audit where request_id=p_request_id;
  if found then
    if v_prior.action<>'MISTAKEN_FORWARDING_CORRECTED'
       or v_prior.metadata->>'forwardingId'<>p_forwarding_id::text
       or v_prior.metadata->>'parcelId'<>p_parcel_id::text then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('state','COMPLETED','replayed',true,'forwardingId',p_forwarding_id,'parcelId',p_parcel_id);
  end if;
  select * into v_forwarding from public.stockage_forwardings
    where forwarding_id=p_forwarding_id for update;
  if not found or v_forwarding.status<>'ARRIVAL_CONFIRMED'
     or v_forwarding.version<>p_expected_forwarding_version
     or v_forwarding.destination_agency<>p_expected_destination_agency
     or v_forwarding.origin_agency=v_forwarding.destination_agency
     or v_forwarding.amount_paid<>0 or v_forwarding.cash_event_id is not null
     or v_forwarding.delivery_event_id is not null
     or v_forwarding.metadata->>'parcelId' is distinct from p_parcel_id::text
     or p_manifest_source !~ ('^'||v_forwarding.origin_agency||'!F[1-9][0-9]*$')
     or p_manifest_date>v_forwarding.created_at::date then
    raise exception 'FORWARDING_CORRECTION_IDENTITY_CONFLICT';
  end if;
  select * into v_parcel from public.stockage_parcels where parcel_id=p_parcel_id for update;
  if not found or v_parcel.forwarding_id is distinct from p_forwarding_id
     or v_parcel.agency<>v_forwarding.destination_agency
     or v_parcel.tracking_code<>v_forwarding.original_tracking_code
     or v_parcel.canonical_weight_kg<>v_forwarding.canonical_weight_kg
     or v_parcel.delivery_status<>'AVAILABLE' then
    raise exception 'PARCEL_CORRECTION_IDENTITY_CONFLICT';
  end if;
  if exists(select 1 from public.stockage_parcels where agency=v_forwarding.origin_agency
    and tracking_code=v_forwarding.original_tracking_code and forwarding_id is null) then
    raise exception 'ORIGIN_PARCEL_COLLISION';
  end if;
  select * into v_origin_arrival from public.stockage_events where event_id=p_origin_arrival_event_id for share;
  if not found or v_origin_arrival.event_type<>'MANUAL_ARRIVAL_RECORDED'
     or v_origin_arrival.agency<>v_forwarding.origin_agency
     or v_origin_arrival.occurred_at>=v_forwarding.created_at
     or not (v_origin_arrival.metadata @> jsonb_build_object('parcels',jsonb_build_array(
       jsonb_build_object('trackingCode',v_parcel.tracking_code,'weightKg',v_parcel.canonical_weight_kg)))) then
    raise exception 'ORIGIN_ARRIVAL_PROOF_CONFLICT';
  end if;
  if (select count(*) from public.stockage_events where agency=v_forwarding.origin_agency
      and event_type='MANUAL_ARRIVAL_RECORDED' and occurred_at<v_forwarding.created_at
      and metadata @> jsonb_build_object('parcels',jsonb_build_array(
        jsonb_build_object('trackingCode',v_parcel.tracking_code,'weightKg',v_parcel.canonical_weight_kg))))<>1 then
    raise exception 'ORIGIN_ARRIVAL_AMBIGUOUS';
  end if;
  select * into v_departure from public.stockage_events where event_id=p_departure_event_id for share;
  select * into v_arrival from public.stockage_events where event_id=p_destination_arrival_event_id for share;
  if v_departure.event_type is distinct from 'SORTIE_POUR_ACHEMINEMENT'
     or v_departure.agency is distinct from v_forwarding.origin_agency
     or v_departure.source_request_id is distinct from p_forwarding_id::text
     or v_departure.parcel_count_delta is distinct from -1
     or v_departure.weight_kg_delta is distinct from -v_parcel.canonical_weight_kg
     or v_arrival.event_type is distinct from 'ARRIVAGE_ACHEMINEMENT'
     or v_arrival.agency is distinct from v_forwarding.destination_agency
     or v_arrival.source_request_id is distinct from p_forwarding_id::text
     or v_arrival.event_id is distinct from v_forwarding.arrival_event_id
     or v_arrival.metadata->>'parcelId' is distinct from p_parcel_id::text
     or v_arrival.parcel_count_delta is distinct from 1
     or v_arrival.weight_kg_delta is distinct from v_parcel.canonical_weight_kg
     or (select count(*) from public.stockage_events where source_request_id=p_forwarding_id::text)<>2 then
    raise exception 'FORWARDING_EVENT_CHAIN_CONFLICT';
  end if;
  if (select count(*) from public.stockage_forwarding_orchestrations where forwarding_id=p_forwarding_id
      and state='ARRIVAL_CONFIRMED' and payment_created is false)<>1
     or exists(select 1 from public.stockage_payment_orchestrations where forwarding_id=p_forwarding_id)
     or exists(select 1 from public.cash_events where source_id=p_forwarding_id::text
       or metadata @> jsonb_build_object('parcelId',p_parcel_id::text))
     or exists(select 1 from public.stockage_events where occurred_at>v_arrival.occurred_at
       and metadata @> jsonb_build_object('parcelId',p_parcel_id::text))
     or exists(select 1 from public.stockage_admin_audit where metadata @> jsonb_build_object('forwardingId',p_forwarding_id::text)) then
    raise exception 'FORWARDING_HAS_SUBSEQUENT_EFFECT';
  end if;
  -- Account locks are acquired in a stable order; every change below is one DB transaction.
  perform 1 from public.stockage_accounts where agency in (v_forwarding.origin_agency,v_forwarding.destination_agency)
    order by agency for update;
  select * into v_origin from public.stockage_accounts where agency=v_forwarding.origin_agency;
  select * into v_destination from public.stockage_accounts where agency=v_forwarding.destination_agency;
  if v_origin.status is distinct from 'ACTIVE' or v_destination.status is distinct from 'ACTIVE'
     or v_destination.current_parcel_count<1 or v_destination.current_weight_kg<v_parcel.canonical_weight_kg then
    raise exception 'STORAGE_ACCOUNT_NOT_READY';
  end if;
  v_hash:=encode(extensions.digest(jsonb_build_object('requestId',p_request_id,
    'forwardingId',p_forwarding_id,'parcelId',p_parcel_id,'origin',v_forwarding.origin_agency,
    'destination',v_forwarding.destination_agency,'weightKg',v_parcel.canonical_weight_kg,
    'historicalExpectedUsd',p_historical_expected_usd,'manifestSource',p_manifest_source)::text,'sha256'),'hex');
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,
    weight_kg_delta,tracking_code,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,
    account_version_before,account_version_after,source_type,source_request_id,target_event_id,reason,metadata)
  values(v_out_event,v_destination.id,gen_random_uuid(),'CORRECTION_COMPENSATOIRE_ADMIN',v_destination.agency,-1,
    -v_parcel.canonical_weight_kg,v_parcel.tracking_code,p_actor_id,btrim(v_actor.nom),'ADMIN',v_business_date,v_now,v_hash,
    v_destination.version,v_destination.version+1,'INTER_AGENCY_FORWARDING',p_forwarding_id::text,
    v_arrival.event_id,btrim(p_reason),jsonb_build_object('parcelId',p_parcel_id,'forwardingId',p_forwarding_id,'administrativeCorrection',true));
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,
    weight_kg_delta,tracking_code,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,
    account_version_before,account_version_after,source_type,source_request_id,target_event_id,reason,metadata)
  values(v_in_event,v_origin.id,gen_random_uuid(),'CORRECTION_COMPENSATOIRE_ADMIN',v_origin.agency,1,
    v_parcel.canonical_weight_kg,v_parcel.tracking_code,p_actor_id,btrim(v_actor.nom),'ADMIN',v_business_date,v_now,v_hash,
    v_origin.version,v_origin.version+1,'INTER_AGENCY_FORWARDING',p_forwarding_id::text,
    v_departure.event_id,btrim(p_reason),jsonb_build_object('parcelId',p_parcel_id,'forwardingId',p_forwarding_id,
      'administrativeCorrection',true,'originalArrivalEventId',v_origin_arrival.event_id,
      'historicalExpectedUsd',p_historical_expected_usd,'historicalPaidUsd',0,'manifestSource',p_manifest_source));
  update public.stockage_accounts set current_parcel_count=current_parcel_count-1,
    current_weight_kg=current_weight_kg-v_parcel.canonical_weight_kg,version=version+1,updated_at=v_now
    where id=v_destination.id and version=v_destination.version;
  if not found then raise exception 'DESTINATION_ACCOUNT_VERSION_CONFLICT'; end if;
  update public.stockage_accounts set current_parcel_count=current_parcel_count+1,
    current_weight_kg=current_weight_kg+v_parcel.canonical_weight_kg,version=version+1,updated_at=v_now
    where id=v_origin.id and version=v_origin.version;
  if not found then raise exception 'ORIGIN_ACCOUNT_VERSION_CONFLICT'; end if;
  update public.stockage_parcels set agency=v_forwarding.origin_agency,forwarding_id=null,
    weight_source='PHYSICAL_ARRIVAL',weight_source_reference=v_origin_arrival.event_id,
    created_at=v_origin_arrival.occurred_at,version=version+1,updated_at=v_now
    where parcel_id=p_parcel_id and forwarding_id=p_forwarding_id and version=v_parcel.version;
  if not found then raise exception 'PARCEL_VERSION_CONFLICT'; end if;
  update public.stockage_forwardings set status='CANCELLED_BY_COMPENSATION',version=version+1,
    updated_at=v_now,metadata=metadata||jsonb_build_object('correctionRequestId',p_request_id,
      'correctionParcelId',p_parcel_id,'correctionReason',btrim(p_reason),
      'historicalExpectedUsd',p_historical_expected_usd,'historicalPaidUsd',0,
      'manifestSource',p_manifest_source,'manifestDate',p_manifest_date)
    where forwarding_id=p_forwarding_id and version=v_forwarding.version;
  if not found then raise exception 'FORWARDING_VERSION_CONFLICT'; end if;
  update public.stockage_forwarding_orchestrations set state='CANCELLED_BY_COMPENSATION',updated_at=v_now
    where forwarding_id=p_forwarding_id and state='ARRIVAL_CONFIRMED' and payment_created is false;
  if not found then raise exception 'FORWARDING_ORCHESTRATION_CONFLICT'; end if;
  insert into public.stockage_forwarding_events(event_id,forwarding_id,request_id,event_type,actor_id,
    actor_name,agency,version_before,version_after,payload_hash,occurred_at,metadata)
  values(v_forwarding_event,p_forwarding_id,p_request_id,'FORWARDING_CANCELLED_BY_COMPENSATION',p_actor_id,
    btrim(v_actor.nom),v_forwarding.destination_agency,v_forwarding.version,v_forwarding.version+1,v_hash,v_now,
    jsonb_build_object('parcelId',p_parcel_id,'originAgency',v_forwarding.origin_agency,
      'destinationAgency',v_forwarding.destination_agency,'originArrivalEventId',v_origin_arrival.event_id,
      'departureEventId',v_departure.event_id,'arrivalEventId',v_arrival.event_id,
      'destinationCorrectionEventId',v_out_event,'originCorrectionEventId',v_in_event,
      'administrativeCorrection',true));
  insert into public.stockage_admin_audit(audit_id,action,agency,request_id,admin_id,admin_name,
    old_value,new_value,reason,target_event_id,occurred_at,metadata)
  values('forwarding-correction-'||replace(p_request_id::text,'-',''),'MISTAKEN_FORWARDING_CORRECTED',
    v_forwarding.destination_agency,p_request_id,p_actor_id,btrim(v_actor.nom),
    jsonb_build_object('parcelAgency',v_forwarding.destination_agency,'forwardingStatus','ARRIVAL_CONFIRMED',
      'forwardingId',p_forwarding_id,'parcelCreatedAt',v_parcel.created_at,
      'weightSource',v_parcel.weight_source,'weightSourceReference',v_parcel.weight_source_reference),
    jsonb_build_object('parcelAgency',v_forwarding.origin_agency,'parcelStatus','AVAILABLE',
      'historicalExpectedUsd',p_historical_expected_usd,'historicalPaidUsd',0),
    btrim(p_reason),v_arrival.event_id,v_now,
    jsonb_build_object('forwardingId',p_forwarding_id,'parcelId',p_parcel_id,
      'originArrivalEventId',v_origin_arrival.event_id,'departureEventId',v_departure.event_id,
      'arrivalEventId',v_arrival.event_id,'destinationCorrectionEventId',v_out_event,
      'originCorrectionEventId',v_in_event,'manifestSource',p_manifest_source,'manifestDate',p_manifest_date));
  return jsonb_build_object('state','COMPLETED','replayed',false,'forwardingId',p_forwarding_id,
    'parcelId',p_parcel_id,'originAgency',v_forwarding.origin_agency,
    'destinationAgency',v_forwarding.destination_agency,
    'destinationCorrectionEventId',v_out_event,'originCorrectionEventId',v_in_event);
end $$;

revoke all on function public.correct_mistaken_forwarding(uuid,uuid,uuid,text,bigint,text,text,text,numeric,numeric,numeric,text,date,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.correct_mistaken_forwarding(uuid,uuid,uuid,text,bigint,text,text,text,numeric,numeric,numeric,text,date,text,boolean,uuid) to service_role;

commit;
