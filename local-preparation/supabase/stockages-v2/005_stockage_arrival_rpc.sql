-- PREPARATORY ONLY. DO NOT APPLY DURING PHASE 2.2.
begin;

create or replace function public.record_manual_arrival(
  p_parcel_count integer, p_weight_kg numeric, p_business_date date,
  p_arrival_reference text, p_observation text, p_request_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_agent public.agents%rowtype;
  v_account public.stockage_accounts%rowtype;
  v_existing public.stockage_events%rowtype;
  v_agency text;
  v_hash text;
  v_event_id text;
begin
  select * into v_agent from public.agents where id=p_actor_id;
  if not found or v_agent.actif is not true or upper(btrim(v_agent.role)) <> 'AGENT' then
    raise exception 'ACTIVE_AGENT_REQUIRED';
  end if;
  v_agency := upper(btrim(v_agent.agence));
  if v_agency not in ('FIH','LSHI','KLZ') then raise exception 'INVALID_STORAGE_AGENCY'; end if;
  if p_parcel_count is null or p_parcel_count <= 0 or p_weight_kg is null or p_weight_kg <= 0
     or p_business_date is null or p_request_id is null then raise exception 'INVALID_MANUAL_ARRIVAL'; end if;

  v_hash := encode(extensions.digest(jsonb_build_object(
    'type','MANUAL_ARRIVAL_RECORDED','agency',v_agency,'parcelCount',p_parcel_count,
    'weightKg',p_weight_kg,'businessDate',p_business_date,
    'arrivalReference',coalesce(p_arrival_reference,''),'observation',coalesce(p_observation,''),
    'actorId',p_actor_id
  )::text,'sha256'),'hex');
  select * into v_existing from public.stockage_events where request_id=p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('eventId',v_existing.event_id,'replayed',true,'version',v_existing.account_version_after);
  end if;

  select * into v_account from public.stockage_accounts where agency=v_agency for update;
  if not found or v_account.status <> 'ACTIVE' then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if;
  v_event_id := 'stockage-arrival-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex');
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,
    parcel_count_delta,weight_kg_delta,arrival_reference,actor_id,actor_name,actor_role,
    business_date,occurred_at,payload_hash,account_version_before,account_version_after,
    source_type,metadata)
  values(v_event_id,v_account.id,p_request_id,'MANUAL_ARRIVAL_RECORDED',v_agency,
    p_parcel_count,p_weight_kg,nullif(btrim(p_arrival_reference),''),p_actor_id,btrim(v_agent.nom),'AGENT',
    p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,
    'PHYSICAL_AGENT_CONFIRMATION',jsonb_build_object('observation',coalesce(p_observation,'')));
  update public.stockage_accounts set current_parcel_count=current_parcel_count+p_parcel_count,
    current_weight_kg=current_weight_kg+p_weight_kg,version=version+1,updated_at=clock_timestamp()
  where id=v_account.id and version=v_account.version;
  if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;
  return jsonb_build_object('eventId',v_event_id,'replayed',false,'version',v_account.version+1);
end;
$$;

revoke all on function public.record_manual_arrival(integer,numeric,date,text,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.record_manual_arrival(integer,numeric,date,text,text,uuid,uuid) to service_role;
commit;
