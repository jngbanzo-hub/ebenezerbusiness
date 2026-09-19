-- PREPARATORY ONLY. DO NOT APPLY WITHOUT A SEPARATE SUPABASE AUTHORIZATION.
begin;

alter table public.stockage_parcels drop constraint stockage_parcels_source_check;
alter table public.stockage_parcels add constraint stockage_parcels_source_check check (
  weight_source in ('PHYSICAL_ARRIVAL', 'SHIPPING_MANIFEST', 'PAYMENT_SNAPSHOT_CONTROL')
  and btrim(weight_source_reference) <> ''
);

create or replace function public.record_detailed_arrival(
  p_parcels jsonb, p_business_date date, p_arrival_reference text,
  p_observation text, p_request_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_agent public.agents%rowtype; v_account public.stockage_accounts%rowtype;
  v_existing public.stockage_events%rowtype; v_agency text; v_hash text; v_event_id text;
  v_count integer; v_weight numeric(18,3); v_item jsonb; v_code text; v_item_weight numeric(18,3);
begin
  select * into v_agent from public.agents where id=p_actor_id;
  if not found or v_agent.actif is not true or upper(btrim(v_agent.role)) <> 'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
  v_agency := upper(btrim(v_agent.agence));
  if v_agency not in ('FIH','LSHI','KLZ') then raise exception 'INVALID_STORAGE_AGENCY'; end if;
  if p_request_id is null or p_business_date is null or jsonb_typeof(p_parcels) <> 'array' or jsonb_array_length(p_parcels)=0 then raise exception 'INVALID_ARRIVAL_PARCELS'; end if;
  select count(*),sum((item->>'weightKg')::numeric) into v_count,v_weight from jsonb_array_elements(p_parcels) item;
  if v_count > 500 or v_weight <= 0 then raise exception 'INVALID_ARRIVAL_PARCELS'; end if;
  if (select count(distinct upper(btrim(item->>'trackingCode'))) from jsonb_array_elements(p_parcels) item) <> v_count then raise exception 'DUPLICATE_ARRIVAL_PARCEL'; end if;

  v_hash := encode(extensions.digest(jsonb_build_object('type','DETAILED_ARRIVAL_RECORDED','agency',v_agency,'parcels',p_parcels,'businessDate',p_business_date,'reference',coalesce(p_arrival_reference,''),'observation',coalesce(p_observation,''),'actorId',p_actor_id)::text,'sha256'),'hex');
  select * into v_existing from public.stockage_events where request_id=p_request_id;
  if found then if v_existing.payload_hash<>v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('eventId',v_existing.event_id,'replayed',true,'version',v_existing.account_version_after); end if;
  select * into v_account from public.stockage_accounts where agency=v_agency for update;
  if not found or v_account.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if;

  for v_item in select value from jsonb_array_elements(p_parcels) loop
    v_code := upper(btrim(v_item->>'trackingCode')); v_item_weight := (v_item->>'weightKg')::numeric;
    if v_code !~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$' or v_item_weight<=0 then raise exception 'INVALID_ARRIVAL_PARCELS'; end if;
    insert into public.stockage_parcels(tracking_code,agency,canonical_weight_kg,weight_source,weight_source_reference)
    values(v_code,v_agency,v_item_weight,'PHYSICAL_ARRIVAL','arrival:'||p_request_id::text);
  end loop;

  v_event_id := 'stockage-arrival-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex');
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,weight_kg_delta,arrival_reference,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,account_version_before,account_version_after,source_type,metadata)
  values(v_event_id,v_account.id,p_request_id,'MANUAL_ARRIVAL_RECORDED',v_agency,v_count,v_weight,nullif(btrim(p_arrival_reference),''),p_actor_id,btrim(v_agent.nom),'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,'PHYSICAL_AGENT_CONFIRMATION',jsonb_build_object('observation',coalesce(p_observation,''),'parcels',p_parcels));
  update public.stockage_accounts set current_parcel_count=current_parcel_count+v_count,current_weight_kg=current_weight_kg+v_weight,version=version+1,updated_at=clock_timestamp() where id=v_account.id and version=v_account.version;
  if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;
  return jsonb_build_object('eventId',v_event_id,'replayed',false,'version',v_account.version+1);
end;
$$;

revoke all on function public.record_detailed_arrival(jsonb,date,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_detailed_arrival(jsonb,date,text,text,uuid,uuid) to service_role;
commit;
