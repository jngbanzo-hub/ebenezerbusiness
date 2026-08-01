-- PREPARATORY ONLY. Canonical weight is resolved by the trusted server first.
begin;

create or replace function public.confirm_parcel_delivery(
  p_tracking_code text, p_destination_agency text, p_canonical_weight_kg numeric,
  p_weight_source text, p_weight_source_reference text, p_business_date date,
  p_physical_delivery_confirmed boolean, p_payment_snapshot jsonb,
  p_request_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_agent public.agents%rowtype;
  v_account public.stockage_accounts%rowtype;
  v_parcel public.stockage_parcels%rowtype;
  v_existing public.stockage_events%rowtype;
  v_agency text;
  v_code text := upper(btrim(p_tracking_code));
  v_hash text;
  v_event_id text;
begin
  if p_tracking_code is null or p_destination_agency is null then
    raise exception 'INVALID_DELIVERY_CONFIRMATION';
  end if;
  select * into v_agent from public.agents where id=p_actor_id;
  if not found or v_agent.actif is not true or upper(btrim(v_agent.role)) <> 'AGENT' then
    raise exception 'ACTIVE_AGENT_REQUIRED';
  end if;
  v_agency := upper(btrim(v_agent.agence));
  if v_agency not in ('FIH','LSHI','KLZ') or upper(btrim(p_destination_agency)) <> v_agency then
    raise exception 'PARCEL_AGENCY_MISMATCH';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$' or p_canonical_weight_kg is null
     or p_canonical_weight_kg <= 0 or p_weight_source <> 'PHYSICAL_ARRIVAL'
     or btrim(coalesce(p_weight_source_reference,''))='' or p_business_date is null
     or p_physical_delivery_confirmed is not true or p_request_id is null then
    raise exception 'INVALID_DELIVERY_CONFIRMATION';
  end if;
  if jsonb_typeof(coalesce(p_payment_snapshot,'{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_PAYMENT_SNAPSHOT';
  end if;

  v_hash := encode(extensions.digest(jsonb_build_object(
    'type','CONFIRMED_DELIVERY_RECORDED','trackingCode',v_code,'agency',v_agency,
    'weightKg',p_canonical_weight_kg,'weightSource',p_weight_source,
    'weightReference',p_weight_source_reference,'businessDate',p_business_date,
    'physicalConfirmed',p_physical_delivery_confirmed,'actorId',p_actor_id
  )::text,'sha256'),'hex');
  select * into v_existing from public.stockage_events where request_id=p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('eventId',v_existing.event_id,'replayed',true,'version',v_existing.account_version_after);
  end if;

  insert into public.stockage_parcels(tracking_code,agency,canonical_weight_kg,
    weight_source,weight_source_reference)
  values(v_code,v_agency,p_canonical_weight_kg,p_weight_source,btrim(p_weight_source_reference))
  on conflict (tracking_code) do nothing;
  select * into v_parcel from public.stockage_parcels where tracking_code=v_code for update;
  if v_parcel.agency <> v_agency then raise exception 'PARCEL_AGENCY_MISMATCH'; end if;
  if v_parcel.canonical_weight_kg <> p_canonical_weight_kg or v_parcel.weight_source_reference <> btrim(p_weight_source_reference) then
    raise exception 'PARCEL_WEIGHT_CONFLICT';
  end if;
  if v_parcel.delivery_status='DELIVERED' then raise exception 'PARCEL_ALREADY_DELIVERED'; end if;

  select * into v_account from public.stockage_accounts where agency=v_agency for update;
  if not found or v_account.status <> 'ACTIVE' then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if;
  if v_account.current_parcel_count < 1 or v_account.current_weight_kg < p_canonical_weight_kg then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  v_event_id := 'stockage-delivery-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex');
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,
    parcel_count_delta,weight_kg_delta,tracking_code,actor_id,actor_name,actor_role,
    business_date,occurred_at,payload_hash,account_version_before,account_version_after,
    source_type,source_request_id,metadata)
  values(v_event_id,v_account.id,p_request_id,'CONFIRMED_DELIVERY_RECORDED',v_agency,
    -1,-p_canonical_weight_kg,v_code,p_actor_id,btrim(v_agent.nom),'AGENT',p_business_date,
    clock_timestamp(),v_hash,v_account.version,v_account.version+1,'PHYSICAL_DELIVERY_CONFIRMATION',
    p_weight_source_reference,jsonb_build_object('physicalDeliveryConfirmed',true,
      'weightSource',p_weight_source,'paymentSnapshot',coalesce(p_payment_snapshot,'{}'::jsonb)));
  update public.stockage_parcels set delivery_status='DELIVERED',delivered_event_id=v_event_id,
    delivered_by=p_actor_id,delivered_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
  where tracking_code=v_code and version=v_parcel.version and delivery_status='AVAILABLE';
  if not found then raise exception 'PARCEL_VERSION_CONFLICT'; end if;
  update public.stockage_accounts set current_parcel_count=current_parcel_count-1,
    current_weight_kg=current_weight_kg-p_canonical_weight_kg,version=version+1,
    updated_at=clock_timestamp()
  where id=v_account.id and version=v_account.version
    and current_parcel_count>=1 and current_weight_kg>=p_canonical_weight_kg;
  if not found then raise exception 'INSUFFICIENT_STOCK'; end if;
  return jsonb_build_object('eventId',v_event_id,'replayed',false,'version',v_account.version+1);
end;
$$;

revoke all on function public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid)
  to service_role;
commit;
