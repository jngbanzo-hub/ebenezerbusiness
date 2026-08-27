-- LOCAL PREPARATION ONLY. A separate Production preflight and approval are mandatory.
begin;

do $$
begin
  if to_regclass('public.stockage_parcels') is null or to_regclass('public.stockage_forwardings') is null then
    raise exception 'IDENTITY_MIGRATION_PREREQUISITES_MISSING';
  end if;
  if exists (select 1 from public.stockage_parcels where agency is null or tracking_code is null) then
    raise exception 'INVALID_EXISTING_PARCEL_IDENTITY';
  end if;
  if exists (select 1 from public.stockage_parcels group by agency,tracking_code having count(*) > 1) then
    raise exception 'EXISTING_NATIVE_IDENTITY_COLLISION';
  end if;
end $$;

alter table public.stockage_parcels add column parcel_id uuid;
update public.stockage_parcels set parcel_id=gen_random_uuid() where parcel_id is null;
alter table public.stockage_parcels alter column parcel_id set default gen_random_uuid();
alter table public.stockage_parcels alter column parcel_id set not null;
alter table public.stockage_parcels add column forwarding_id uuid null;
alter table public.stockage_parcels add constraint stockage_parcels_forwarding_fk
  foreign key(forwarding_id) references public.stockage_forwardings(forwarding_id) on delete restrict;
alter table public.stockage_parcels drop constraint stockage_parcels_pkey;
alter table public.stockage_parcels add constraint stockage_parcels_pkey primary key(parcel_id);
create unique index stockage_parcels_native_identity_unique
  on public.stockage_parcels(agency,tracking_code) where forwarding_id is null;
create unique index stockage_parcels_forwarding_identity_unique
  on public.stockage_parcels(forwarding_id) where forwarding_id is not null;

-- Preserve every public signature and body; change only parcel resolution predicates.
do $$
declare v_def text; v_normalized text;
begin
  select pg_get_functiondef('public.begin_paid_destination_orchestration(uuid,text,text,text,numeric,numeric,uuid)'::regprocedure) into v_def;
  v_normalized:=regexp_replace(lower(v_def),'[[:space:]]','','g');
  if position('wheretracking_code=v_codeandagency=v_agencyforupdate' in v_normalized)=0 then raise exception 'BEGIN_PAID_DEFINITION_DRIFT'; end if;
  v_def:=regexp_replace(v_def,'where[[:space:]]+tracking_code[[:space:]]*=[[:space:]]*v_code[[:space:]]+and[[:space:]]+agency[[:space:]]*=[[:space:]]*v_agency[[:space:]]+for[[:space:]]+update','where tracking_code=v_code and agency=v_agency and forwarding_id is null for update','i');
  execute v_def;

  select pg_get_functiondef('public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid)'::regprocedure) into v_def;
  v_normalized:=regexp_replace(lower(v_def),'[[:space:]]','','g');
  if position('onconflict(agency,tracking_code)donothing' in v_normalized)=0 or position('whereagency=v_agencyandtracking_code=v_codeforupdate' in v_normalized)=0 then raise exception 'CONFIRM_DELIVERY_DEFINITION_DRIFT'; end if;
  v_def:=regexp_replace(v_def,'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*agency[[:space:]]*,[[:space:]]*tracking_code[[:space:]]*\)[[:space:]]+do[[:space:]]+nothing','on conflict (agency,tracking_code) where forwarding_id is null do nothing','i');
  v_def:=regexp_replace(v_def,'where[[:space:]]+agency[[:space:]]*=[[:space:]]*v_agency[[:space:]]+and[[:space:]]+tracking_code[[:space:]]*=[[:space:]]*v_code[[:space:]]+for[[:space:]]+update','where agency=v_agency and tracking_code=v_code and forwarding_id is null for update','i');
  v_def:=regexp_replace(v_def,'where[[:space:]]+tracking_code[[:space:]]*=[[:space:]]*v_code[[:space:]]+and[[:space:]]+version[[:space:]]*=[[:space:]]*v_parcel\.version[[:space:]]+and[[:space:]]+delivery_status[[:space:]]*=[[:space:]]*''AVAILABLE''','where parcel_id=v_parcel.parcel_id and version=v_parcel.version and delivery_status=''AVAILABLE''','i');
  execute v_def;

  select pg_get_functiondef('public.finalize_paid_destination_orchestration(uuid,text,date,text,text,text)'::regprocedure) into v_def;
  v_normalized:=regexp_replace(lower(v_def),'[[:space:]]','','g');
  if position('whereagency=v_row.agencyandtracking_code=v_row.tracking_codeforupdate' in v_normalized)=0 then raise exception 'FINALIZE_PAID_DEFINITION_DRIFT'; end if;
  v_def:=regexp_replace(v_def,'where[[:space:]]+agency[[:space:]]*=[[:space:]]*v_row\.agency[[:space:]]+and[[:space:]]+tracking_code[[:space:]]*=[[:space:]]*v_row\.tracking_code[[:space:]]+for[[:space:]]+update','where agency=v_row.agency and tracking_code=v_row.tracking_code and forwarding_id is null for update','i');
  v_def:=regexp_replace(v_def,'where[[:space:]]+tracking_code[[:space:]]*=[[:space:]]*v_row\.tracking_code[[:space:]]+and[[:space:]]+version[[:space:]]*=[[:space:]]*v_parcel\.version[[:space:]]+and[[:space:]]+delivery_status[[:space:]]*=[[:space:]]*''AVAILABLE''','where parcel_id=v_parcel.parcel_id and version=v_parcel.version and delivery_status=''AVAILABLE''','i');
  execute v_def;

  select pg_get_functiondef('public.reconcile_initial_physical_inventory(text,jsonb,date,text,uuid,uuid)'::regprocedure) into v_def;
  v_def:=replace(v_def,'where agency = v_agency)', 'where agency = v_agency and forwarding_id is null)');
  v_def:=replace(v_def,'where agency = v_agency and tracking_code = v_code)', 'where agency = v_agency and tracking_code = v_code and forwarding_id is null)');
  execute v_def;

  select pg_get_functiondef('public.confirm_klz_lshi_departure(text,numeric,text,date,uuid,uuid)'::regprocedure) into v_def;
  v_normalized:=regexp_replace(lower(v_def),'[[:space:]]','','g');
  if position('whereagency=''klz''andtracking_code=v_code' in v_normalized)=0 then raise exception 'KLZ_DEPARTURE_DEFINITION_DRIFT'; end if;
  v_def:=replace(v_def,'where agency=''KLZ'' and tracking_code=v_code', 'where agency=''KLZ'' and tracking_code=v_code and forwarding_id is null');
  v_def:=replace(v_def,'delete from public.stockage_parcels where agency=''KLZ'' and tracking_code=v_code and version=v_parcel.version', 'delete from public.stockage_parcels where parcel_id=v_parcel.parcel_id and version=v_parcel.version');
  execute v_def;

  -- record_detailed_arrival remains byte-for-byte unchanged: omitted forwarding_id means native NULL.
  perform 'public.record_detailed_arrival(jsonb,date,text,text,uuid,uuid)'::regprocedure;
end $$;

-- Forwarding arrival keeps the canonical code and binds the physical row to the certified forwarding UUID.
do $$
declare v_def text; v_normalized text;
begin
  select pg_get_functiondef('public.record_forwarding_arrival(text,text,date,uuid,uuid)'::regprocedure) into v_def;
  v_normalized:=regexp_replace(lower(v_def),'[[:space:]]','','g');
  if position('values(v_forwarding.forwarding_reference,v_forwarding.destination_agency' in v_normalized)=0 then raise exception 'FORWARDING_ARRIVAL_DEFINITION_DRIFT'; end if;
  v_def:=replace(v_def,
    'insert into public.stockage_parcels(tracking_code,agency,canonical_weight_kg,weight_source,weight_source_reference) values(v_forwarding.forwarding_reference,v_forwarding.destination_agency,v_forwarding.canonical_weight_kg,''PHYSICAL_ARRIVAL'',''forwarding:''||v_forwarding.forwarding_id)',
    'insert into public.stockage_parcels(tracking_code,agency,canonical_weight_kg,weight_source,weight_source_reference,forwarding_id) values(v_forwarding.original_tracking_code,v_forwarding.destination_agency,v_forwarding.canonical_weight_kg,''PHYSICAL_ARRIVAL'',''forwarding:''||v_forwarding.forwarding_id,v_forwarding.forwarding_id)');
  execute v_def;

  select pg_get_functiondef('public.confirm_forwarding_delivery(text,text,boolean,date,uuid,uuid)'::regprocedure) into v_def;
  v_normalized:=regexp_replace(lower(v_def),'[[:space:]]','','g');
  if position('whereagency=v_forwarding.destination_agencyandtracking_code=v_forwarding.forwarding_referenceforupdate' in v_normalized)=0 then raise exception 'FORWARDING_DELIVERY_DEFINITION_DRIFT'; end if;
  v_def:=replace(v_def,'where agency=v_forwarding.destination_agency and tracking_code=v_forwarding.forwarding_reference for update','where forwarding_id=v_forwarding.forwarding_id for update');
  v_def:=replace(v_def,'where agency=v_forwarding.destination_agency and tracking_code=v_forwarding.forwarding_reference and version=v_parcel.version','where parcel_id=v_parcel.parcel_id and version=v_parcel.version');
  v_def:=replace(v_def,'''forwardingReference'',v_forwarding.forwarding_reference','''forwardingReference'',v_forwarding.forwarding_reference,''forwardingId'',v_forwarding.forwarding_id');
  execute v_def;
end $$;

commit;
