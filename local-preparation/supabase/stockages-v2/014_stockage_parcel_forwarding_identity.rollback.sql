-- CONDITIONAL ROLLBACK. Refuses any destructive collapse of forwarding identities.
begin;
do $$
begin
  if exists(select 1 from public.stockage_parcels where forwarding_id is not null) then
    raise exception 'ROLLBACK_REFUSED_FORWARDING_PARCELS_EXIST';
  end if;
  if exists(select 1 from public.stockage_parcels group by agency,tracking_code having count(*)>1) then
    raise exception 'ROLLBACK_REFUSED_IDENTITY_COLLISIONS_EXIST';
  end if;
end $$;

do $$ declare v_def text; begin
  select pg_get_functiondef('public.begin_paid_destination_orchestration(uuid,text,text,text,numeric,numeric,uuid)'::regprocedure) into v_def;
  execute replace(v_def,'where tracking_code=v_code and agency=v_agency and forwarding_id is null for update','where tracking_code=v_code and agency=v_agency for update');
  select pg_get_functiondef('public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,'on conflict (agency,tracking_code) where forwarding_id is null do nothing','on conflict (agency,tracking_code) do nothing');
  v_def:=replace(v_def,'where agency=v_agency and tracking_code=v_code and forwarding_id is null for update','where agency=v_agency and tracking_code=v_code for update');
  execute replace(v_def,'where parcel_id=v_parcel.parcel_id and version=v_parcel.version and delivery_status=''AVAILABLE''','where tracking_code=v_code and version=v_parcel.version and delivery_status=''AVAILABLE''');
  select pg_get_functiondef('public.finalize_paid_destination_orchestration(uuid,text,date,text,text,text)'::regprocedure) into v_def;
  v_def:=replace(v_def,'where agency=v_row.agency and tracking_code=v_row.tracking_code and forwarding_id is null for update','where agency=v_row.agency and tracking_code=v_row.tracking_code for update');
  execute replace(v_def,'where parcel_id=v_parcel.parcel_id and version=v_parcel.version and delivery_status=''AVAILABLE''','where tracking_code=v_row.tracking_code and version=v_parcel.version and delivery_status=''AVAILABLE''');
  select pg_get_functiondef('public.reconcile_initial_physical_inventory(text,jsonb,date,text,uuid,uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,'where agency = v_agency and forwarding_id is null)', 'where agency = v_agency)');
  execute replace(v_def,'where agency = v_agency and tracking_code = v_code and forwarding_id is null)', 'where agency = v_agency and tracking_code = v_code)');
  select pg_get_functiondef('public.confirm_klz_lshi_departure(text,numeric,text,date,uuid,uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,'where agency=''KLZ'' and tracking_code=v_code and forwarding_id is null','where agency=''KLZ'' and tracking_code=v_code');
  execute replace(v_def,'delete from public.stockage_parcels where parcel_id=v_parcel.parcel_id and version=v_parcel.version','delete from public.stockage_parcels where agency=''KLZ'' and tracking_code=v_code and version=v_parcel.version');
  select pg_get_functiondef('public.record_forwarding_arrival(text,text,date,uuid,uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,
    'insert into public.stockage_parcels(tracking_code,agency,canonical_weight_kg,weight_source,weight_source_reference,forwarding_id) values(v_forwarding.original_tracking_code,v_forwarding.destination_agency,v_forwarding.canonical_weight_kg,''PHYSICAL_ARRIVAL'',''forwarding:''||v_forwarding.forwarding_id,v_forwarding.forwarding_id)',
    'insert into public.stockage_parcels(tracking_code,agency,canonical_weight_kg,weight_source,weight_source_reference) values(v_forwarding.forwarding_reference,v_forwarding.destination_agency,v_forwarding.canonical_weight_kg,''PHYSICAL_ARRIVAL'',''forwarding:''||v_forwarding.forwarding_id)');
  execute v_def;
  select pg_get_functiondef('public.confirm_forwarding_delivery(text,text,boolean,date,uuid,uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,'where forwarding_id=v_forwarding.forwarding_id for update','where agency=v_forwarding.destination_agency and tracking_code=v_forwarding.forwarding_reference for update');
  v_def:=replace(v_def,'where parcel_id=v_parcel.parcel_id and version=v_parcel.version','where agency=v_forwarding.destination_agency and tracking_code=v_forwarding.forwarding_reference and version=v_parcel.version');
  v_def:=replace(v_def,'''forwardingReference'',v_forwarding.forwarding_reference,''forwardingId'',v_forwarding.forwarding_id','''forwardingReference'',v_forwarding.forwarding_reference');
  execute v_def;
end $$;

drop index public.stockage_parcels_forwarding_identity_unique;
drop index public.stockage_parcels_native_identity_unique;
alter table public.stockage_parcels drop constraint stockage_parcels_forwarding_fk;
alter table public.stockage_parcels drop constraint stockage_parcels_pkey;
alter table public.stockage_parcels add constraint stockage_parcels_pkey primary key(agency,tracking_code);
alter table public.stockage_parcels drop column forwarding_id;
alter table public.stockage_parcels drop column parcel_id;
commit;
