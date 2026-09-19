-- PREPARATORY ONLY. DO NOT APPLY DURING PHASE 2.2.
begin;

create or replace function public.record_opening_stock(
  p_agency text, p_parcel_count integer, p_weight_kg numeric,
  p_business_date date, p_observation text, p_request_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_admin public.agents%rowtype;
  v_account public.stockage_accounts%rowtype;
  v_existing public.stockage_events%rowtype;
  v_hash text;
  v_event_id text;
  v_agency text := upper(btrim(p_agency));
begin
  select * into v_admin from public.agents where id = p_actor_id;
  if not found or v_admin.actif is not true or upper(btrim(v_admin.role)) <> 'ADMIN' then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if v_agency not in ('FIH','LSHI','KLZ') then raise exception 'INVALID_STORAGE_AGENCY'; end if;
  if p_parcel_count is null or p_parcel_count < 0 or p_weight_kg is null or p_weight_kg < 0
     or p_business_date is null or p_request_id is null then raise exception 'INVALID_OPENING_STOCK'; end if;

  v_hash := encode(extensions.digest(jsonb_build_object(
    'type','OPENING_STOCK_RECORDED','agency',v_agency,'parcelCount',p_parcel_count,
    'weightKg',p_weight_kg,'businessDate',p_business_date,'observation',coalesce(p_observation,''),
    'actorId',p_actor_id
  )::text, 'sha256'), 'hex');
  select * into v_existing from public.stockage_events where request_id = p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('eventId',v_existing.event_id,'replayed',true,'version',v_existing.account_version_after);
  end if;

  select * into v_account from public.stockage_accounts where agency = v_agency for update;
  if not found or v_account.status <> 'SUSPENDED' then raise exception 'STORAGE_ACCOUNT_NOT_SUSPENDED'; end if;
  if exists (select 1 from public.stockage_events where agency = v_agency and event_type = 'OPENING_STOCK_RECORDED') then
    raise exception 'OPENING_STOCK_ALREADY_RECORDED';
  end if;
  v_event_id := 'stockage-opening-' || encode(extensions.digest(p_request_id::text, 'sha256'),'hex');

  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,
    parcel_count_delta,weight_kg_delta,actor_id,actor_name,actor_role,business_date,
    occurred_at,payload_hash,account_version_before,account_version_after,source_type,
    reason,metadata)
  values(v_event_id,v_account.id,p_request_id,'OPENING_STOCK_RECORDED',v_agency,
    p_parcel_count,p_weight_kg,p_actor_id,btrim(v_admin.nom),'ADMIN',p_business_date,
    clock_timestamp(),v_hash,v_account.version,v_account.version+1,'ADMIN_COMMAND',
    null,jsonb_build_object('observation',coalesce(p_observation,'')));

  update public.stockage_accounts set status='ACTIVE',current_parcel_count=p_parcel_count,
    current_weight_kg=p_weight_kg,version=v_account.version+1,opened_business_date=p_business_date,
    opened_by=p_actor_id,opened_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=v_account.id and version=v_account.version;
  if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;

  insert into public.stockage_admin_audit(audit_id,action,agency,request_id,admin_id,
    admin_name,old_value,new_value,reason,occurred_at,metadata)
  values('audit-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex'),
    'OPENING_STOCK_RECORDED',v_agency,p_request_id,p_actor_id,btrim(v_admin.nom),
    jsonb_build_object('status','SUSPENDED','parcelCount',0,'weightKg',0),
    jsonb_build_object('status','ACTIVE','parcelCount',p_parcel_count,'weightKg',p_weight_kg),
    'Ouverture initiale confirmée',clock_timestamp(),jsonb_build_object('observation',coalesce(p_observation,'')));
  return jsonb_build_object('eventId',v_event_id,'replayed',false,'version',v_account.version+1);
end;
$$;

revoke all on function public.record_opening_stock(text,integer,numeric,date,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.record_opening_stock(text,integer,numeric,date,text,uuid,uuid) to service_role;
commit;
