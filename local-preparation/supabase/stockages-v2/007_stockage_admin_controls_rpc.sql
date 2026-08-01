-- PREPARATORY ONLY. DO NOT APPLY DURING PHASE 2.2.
begin;

create or replace function public.record_admin_stock_adjustment(
  p_agency text, p_direction text, p_parcel_count integer, p_weight_kg numeric,
  p_business_date date, p_reason text, p_request_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_admin public.agents%rowtype; v_account public.stockage_accounts%rowtype;
  v_existing public.stockage_events%rowtype; v_agency text:=upper(btrim(p_agency));
  v_sign integer; v_count_delta integer; v_weight_delta numeric; v_hash text; v_event_id text;
begin
  select * into v_admin from public.agents where id=p_actor_id;
  if not found or v_admin.actif is not true or upper(btrim(v_admin.role))<>'ADMIN' then raise exception 'ADMIN_REQUIRED'; end if;
  if v_agency not in ('FIH','LSHI','KLZ') then raise exception 'INVALID_STORAGE_AGENCY'; end if;
  if upper(btrim(p_direction)) not in ('CREDIT','DEBIT') or p_parcel_count is null or p_parcel_count<0
     or p_weight_kg is null or p_weight_kg<0 or (p_parcel_count=0 and p_weight_kg=0)
     or btrim(coalesce(p_reason,''))='' or p_business_date is null or p_request_id is null then
    raise exception 'INVALID_STOCK_ADJUSTMENT';
  end if;
  v_sign:=case when upper(btrim(p_direction))='CREDIT' then 1 else -1 end;
  v_count_delta:=v_sign*p_parcel_count; v_weight_delta:=v_sign*p_weight_kg;
  v_hash:=encode(extensions.digest(jsonb_build_object('type','ADMIN_STOCK_ADJUSTMENT_RECORDED',
    'agency',v_agency,'direction',upper(btrim(p_direction)),'parcelCount',p_parcel_count,
    'weightKg',p_weight_kg,'businessDate',p_business_date,'reason',btrim(p_reason),'actorId',p_actor_id)::text,'sha256'),'hex');
  select * into v_existing from public.stockage_events where request_id=p_request_id;
  if found then
    if v_existing.payload_hash<>v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('eventId',v_existing.event_id,'replayed',true,'version',v_existing.account_version_after);
  end if;
  select * into v_account from public.stockage_accounts where agency=v_agency for update;
  if not found or v_account.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if;
  if v_account.current_parcel_count+v_count_delta<0 or v_account.current_weight_kg+v_weight_delta<0 then
    raise exception 'INSUFFICIENT_STOCK';
  end if;
  v_event_id:='stockage-adjustment-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex');
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,
    parcel_count_delta,weight_kg_delta,actor_id,actor_name,actor_role,business_date,
    occurred_at,payload_hash,account_version_before,account_version_after,source_type,reason,metadata)
  values(v_event_id,v_account.id,p_request_id,'ADMIN_STOCK_ADJUSTMENT_RECORDED',v_agency,
    v_count_delta,v_weight_delta,p_actor_id,btrim(v_admin.nom),'ADMIN',p_business_date,
    clock_timestamp(),v_hash,v_account.version,v_account.version+1,'ADMIN_COMMAND',btrim(p_reason),
    jsonb_build_object('direction',upper(btrim(p_direction))));
  update public.stockage_accounts set current_parcel_count=current_parcel_count+v_count_delta,
    current_weight_kg=current_weight_kg+v_weight_delta,version=version+1,updated_at=clock_timestamp()
  where id=v_account.id and version=v_account.version;
  if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;
  insert into public.stockage_admin_audit(audit_id,action,agency,request_id,admin_id,admin_name,
    old_value,new_value,reason,occurred_at,metadata)
  values('audit-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex'),'ADMIN_STOCK_ADJUSTMENT_RECORDED',
    v_agency,p_request_id,p_actor_id,btrim(v_admin.nom),
    jsonb_build_object('parcelCount',v_account.current_parcel_count,'weightKg',v_account.current_weight_kg),
    jsonb_build_object('parcelCount',v_account.current_parcel_count+v_count_delta,
      'weightKg',v_account.current_weight_kg+v_weight_delta),btrim(p_reason),clock_timestamp(),'{}'::jsonb);
  return jsonb_build_object('eventId',v_event_id,'replayed',false,'version',v_account.version+1);
end;
$$;

create or replace function public.record_stock_correction(
  p_target_event_id text, p_corrected_parcel_delta integer, p_corrected_weight_delta numeric,
  p_business_date date, p_reason text, p_request_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_admin public.agents%rowtype; v_target public.stockage_events%rowtype;
  v_account public.stockage_accounts%rowtype; v_existing public.stockage_events%rowtype;
  v_count_delta integer; v_weight_delta numeric; v_hash text; v_event_id text;
begin
  select * into v_admin from public.agents where id=p_actor_id;
  if not found or v_admin.actif is not true or upper(btrim(v_admin.role))<>'ADMIN' then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_target from public.stockage_events where event_id=btrim(p_target_event_id);
  if not found or v_target.event_type='STOCK_CORRECTION_RECORDED' then raise exception 'INVALID_CORRECTION_TARGET'; end if;
  if p_corrected_parcel_delta is null or p_corrected_weight_delta is null
     or btrim(coalesce(p_reason,''))='' or p_business_date is null or p_request_id is null then
    raise exception 'INVALID_STOCK_CORRECTION';
  end if;
  v_count_delta:=p_corrected_parcel_delta-v_target.parcel_count_delta;
  v_weight_delta:=p_corrected_weight_delta-v_target.weight_kg_delta;
  if v_count_delta=0 and v_weight_delta=0 then raise exception 'CORRECTION_HAS_NO_EFFECT'; end if;
  v_hash:=encode(extensions.digest(jsonb_build_object('type','STOCK_CORRECTION_RECORDED',
    'targetEventId',v_target.event_id,'correctedParcelDelta',p_corrected_parcel_delta,
    'correctedWeightDelta',p_corrected_weight_delta,'businessDate',p_business_date,
    'reason',btrim(p_reason),'actorId',p_actor_id)::text,'sha256'),'hex');
  select * into v_existing from public.stockage_events where request_id=p_request_id;
  if found then
    if v_existing.payload_hash<>v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('eventId',v_existing.event_id,'replayed',true,'version',v_existing.account_version_after);
  end if;
  select * into v_account from public.stockage_accounts where id=v_target.account_id for update;
  if not found or v_account.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if;
  if v_account.current_parcel_count+v_count_delta<0 or v_account.current_weight_kg+v_weight_delta<0 then
    raise exception 'INSUFFICIENT_STOCK';
  end if;
  v_event_id:='stockage-correction-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex');
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,
    parcel_count_delta,weight_kg_delta,actor_id,actor_name,actor_role,business_date,
    occurred_at,payload_hash,account_version_before,account_version_after,source_type,
    target_event_id,reason,metadata)
  values(v_event_id,v_account.id,p_request_id,'STOCK_CORRECTION_RECORDED',v_target.agency,
    v_count_delta,v_weight_delta,p_actor_id,btrim(v_admin.nom),'ADMIN',p_business_date,
    clock_timestamp(),v_hash,v_account.version,v_account.version+1,'ADMIN_COMMAND',
    v_target.event_id,btrim(p_reason),jsonb_build_object('correctedParcelDelta',p_corrected_parcel_delta,
      'correctedWeightDelta',p_corrected_weight_delta));
  update public.stockage_accounts set current_parcel_count=current_parcel_count+v_count_delta,
    current_weight_kg=current_weight_kg+v_weight_delta,version=version+1,updated_at=clock_timestamp()
  where id=v_account.id and version=v_account.version;
  if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;
  insert into public.stockage_admin_audit(audit_id,action,agency,request_id,admin_id,admin_name,
    old_value,new_value,reason,target_event_id,occurred_at,metadata)
  values('audit-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex'),'STOCK_CORRECTION_RECORDED',
    v_target.agency,p_request_id,p_actor_id,btrim(v_admin.nom),
    jsonb_build_object('parcelDelta',v_target.parcel_count_delta,'weightDelta',v_target.weight_kg_delta),
    jsonb_build_object('parcelDelta',p_corrected_parcel_delta,'weightDelta',p_corrected_weight_delta),
    btrim(p_reason),v_target.event_id,clock_timestamp(),'{}'::jsonb);
  return jsonb_build_object('eventId',v_event_id,'replayed',false,'version',v_account.version+1);
end;
$$;

revoke all on function public.record_admin_stock_adjustment(text,text,integer,numeric,date,text,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.record_stock_correction(text,integer,numeric,date,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.record_admin_stock_adjustment(text,text,integer,numeric,date,text,uuid,uuid) to service_role;
grant execute on function public.record_stock_correction(text,integer,numeric,date,text,uuid,uuid) to service_role;

create or replace function public.record_stockage_anomaly(
  p_anomaly_type text, p_agency text, p_tracking_code text, p_request_id uuid,
  p_details jsonb, p_actor_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor public.agents%rowtype;
  v_type text := upper(btrim(p_anomaly_type));
  v_agency text := nullif(upper(btrim(coalesce(p_agency, ''))), '');
  v_code text := nullif(upper(btrim(coalesce(p_tracking_code, ''))), '');
  v_anomaly_id text;
begin
  select * into v_actor from public.agents where id = p_actor_id;
  if not found or v_actor.actif is not true
     or upper(btrim(v_actor.role)) not in ('AGENT', 'ADMIN') then
    raise exception 'AUTHORIZED_ACTOR_REQUIRED';
  end if;
  if v_agency is null or v_agency not in ('FIH', 'LSHI', 'KLZ') then
    raise exception 'INVALID_STORAGE_AGENCY';
  end if;
  if v_type not in ('WEIGHT_MISSING','WEIGHT_AMBIGUOUS','WEIGHT_CONFLICT','AGENCY_MISMATCH',
    'INSUFFICIENT_STOCK','PARCEL_NOT_FOUND','DUPLICATE_DELIVERY_ATTEMPT',
    'IDEMPOTENCY_CONFLICT','VERSION_CONFLICT')
    or p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'INVALID_STORAGE_ANOMALY';
  end if;
  v_anomaly_id := 'stockage-anomaly-' || encode(extensions.digest(
    concat_ws('|', v_type, coalesce(v_agency, ''), coalesce(v_code, ''),
      coalesce(p_request_id::text, ''), p_actor_id::text, clock_timestamp()::text), 'sha256'), 'hex');
  insert into public.stockage_anomalies(
    anomaly_id, agency, tracking_code, request_id, anomaly_type, status, details, created_at
  ) values (
    v_anomaly_id, v_agency, v_code, p_request_id, v_type, 'OPEN',
    p_details || jsonb_build_object('reportedBy', p_actor_id), clock_timestamp()
  );
  return jsonb_build_object('anomalyId', v_anomaly_id, 'status', 'OPEN');
end;
$$;

revoke all on function public.record_stockage_anomaly(text,text,text,uuid,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.record_stockage_anomaly(text,text,text,uuid,jsonb,uuid) to service_role;

create or replace function public.resolve_stockage_anomaly(
  p_anomaly_id text, p_reason text, p_request_id uuid, p_actor_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_admin public.agents%rowtype;
  v_anomaly public.stockage_anomalies%rowtype;
  v_existing public.stockage_admin_audit%rowtype;
  v_hash text;
begin
  select * into v_admin from public.agents where id = p_actor_id;
  if not found or v_admin.actif is not true or upper(btrim(v_admin.role)) <> 'ADMIN' then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if btrim(coalesce(p_anomaly_id, '')) = '' or btrim(coalesce(p_reason, '')) = ''
     or p_request_id is null then
    raise exception 'INVALID_ANOMALY_RESOLUTION';
  end if;
  v_hash := encode(extensions.digest(jsonb_build_object(
    'type','STOCKAGE_ANOMALY_RESOLVED','anomalyId',btrim(p_anomaly_id),
    'reason',btrim(p_reason),'actorId',p_actor_id
  )::text, 'sha256'), 'hex');
  select * into v_existing from public.stockage_admin_audit where request_id = p_request_id;
  if found then
    if v_existing.action <> 'STOCKAGE_ANOMALY_RESOLVED'
       or v_existing.metadata->>'commandHash' <> v_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('anomalyId',btrim(p_anomaly_id),'status','RESOLVED','replayed',true);
  end if;
  select * into v_anomaly from public.stockage_anomalies
    where anomaly_id = btrim(p_anomaly_id) for update;
  if not found then raise exception 'STOCKAGE_ANOMALY_NOT_FOUND'; end if;
  if v_anomaly.status <> 'OPEN' then raise exception 'STOCKAGE_ANOMALY_ALREADY_RESOLVED'; end if;
  update public.stockage_anomalies set status='RESOLVED',resolved_at=clock_timestamp(),
    resolved_by=p_actor_id,resolution_reason=btrim(p_reason)
  where anomaly_id=v_anomaly.anomaly_id and status='OPEN';
  if not found then raise exception 'STOCKAGE_ANOMALY_VERSION_CONFLICT'; end if;
  insert into public.stockage_admin_audit(
    audit_id,action,agency,request_id,admin_id,admin_name,old_value,new_value,
    reason,occurred_at,metadata
  ) values (
    'audit-'||encode(extensions.digest(p_request_id::text,'sha256'),'hex'),
    'STOCKAGE_ANOMALY_RESOLVED',v_anomaly.agency,p_request_id,p_actor_id,btrim(v_admin.nom),
    jsonb_build_object('anomalyId',v_anomaly.anomaly_id,'status','OPEN'),
    jsonb_build_object('anomalyId',v_anomaly.anomaly_id,'status','RESOLVED'),
    btrim(p_reason),clock_timestamp(),jsonb_build_object('commandHash',v_hash)
  );
  return jsonb_build_object('anomalyId',v_anomaly.anomaly_id,'status','RESOLVED','replayed',false);
end;
$$;

revoke all on function public.resolve_stockage_anomaly(text,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_stockage_anomaly(text,text,uuid,uuid) to service_role;
commit;
