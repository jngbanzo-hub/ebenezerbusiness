-- Safe only while no tracking code exists in more than one agency.
begin;
do $$
declare v_definition text;
begin
  if exists (
    select 1 from public.stockage_parcels group by tracking_code having count(*) > 1
  ) then raise exception 'ROLLBACK_BLOCKED_BY_CROSS_AGENCY_CODES'; end if;

  select pg_get_functiondef('public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid)'::regprocedure) into v_definition;
  v_definition := replace(v_definition, 'on conflict (agency, tracking_code) do nothing', 'on conflict (tracking_code) do nothing');
  v_definition := replace(v_definition, 'from public.stockage_parcels where agency=v_agency and tracking_code=v_code for update', 'from public.stockage_parcels where tracking_code=v_code for update');
  v_definition := replace(v_definition, 'where agency=v_agency and tracking_code=v_code and version=v_parcel.version and delivery_status=''AVAILABLE''', 'where tracking_code=v_code and version=v_parcel.version and delivery_status=''AVAILABLE''');
  execute v_definition;

  select pg_get_functiondef('public.reconcile_initial_physical_inventory(text,jsonb,date,text,uuid,uuid)'::regprocedure) into v_definition;
  v_definition := replace(v_definition, 'exists (select 1 from public.stockage_parcels where agency = v_agency and tracking_code = v_code)', 'exists (select 1 from public.stockage_parcels where tracking_code = v_code)');
  execute v_definition;

  select pg_get_functiondef('public.finalize_paid_destination_orchestration(uuid,text,date,text,text,text)'::regprocedure) into v_definition;
  v_definition := replace(v_definition, 'from public.stockage_parcels where agency=v_row.agency and tracking_code=v_row.tracking_code for update', 'from public.stockage_parcels where tracking_code=v_row.tracking_code for update');
  v_definition := replace(v_definition, 'where agency=v_row.agency and tracking_code=v_row.tracking_code and version=v_parcel.version and delivery_status=''AVAILABLE''', 'where tracking_code=v_row.tracking_code and version=v_parcel.version and delivery_status=''AVAILABLE''');
  execute v_definition;

  select pg_get_functiondef('public.confirm_forwarding_delivery(text,text,boolean,date,uuid,uuid)'::regprocedure) into v_definition;
  v_definition := replace(v_definition, 'from public.stockage_parcels where agency=v_forwarding.destination_agency and tracking_code=v_forwarding.forwarding_reference for update', 'from public.stockage_parcels where tracking_code=v_forwarding.forwarding_reference for update');
  v_definition := replace(v_definition, 'where agency=v_forwarding.destination_agency and tracking_code=v_forwarding.forwarding_reference and version=v_parcel.version', 'where tracking_code=v_forwarding.forwarding_reference and version=v_parcel.version');
  execute v_definition;
end $$;
drop index if exists public.stockage_events_delivery_unique;
create unique index stockage_events_delivery_unique on public.stockage_events(tracking_code)
where event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT');
alter table public.stockage_parcels drop constraint stockage_parcels_pkey;
alter table public.stockage_parcels add constraint stockage_parcels_pkey primary key (tracking_code);
commit;
