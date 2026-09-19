-- Authorised business rule: a physical parcel is identified by agency + tracking code.
begin;

do $$
declare v_definition text;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stockage_parcels'::regclass
      and conname = 'stockage_parcels_pkey'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (tracking_code)'
  ) then raise exception 'UNEXPECTED_STOCKAGE_PARCELS_PRIMARY_KEY'; end if;

  alter table public.stockage_parcels drop constraint stockage_parcels_pkey;
  alter table public.stockage_parcels add constraint stockage_parcels_pkey
    primary key (agency, tracking_code);

  drop index if exists public.stockage_events_delivery_unique;
  create unique index stockage_events_delivery_unique
    on public.stockage_events(agency, tracking_code)
    where event_type in (
      'CONFIRMED_DELIVERY_RECORDED',
      'SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION',
      'SORTIE_APRES_REMISE_COLIS_PAYE_COO',
      'SORTIE_APRES_REMISE_ACHEMINEMENT'
    );

  select pg_get_functiondef('public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid)'::regprocedure)
    into v_definition;
  if position('on conflict (tracking_code) do nothing' in v_definition) = 0
     or position('from public.stockage_parcels where tracking_code=v_code for update' in v_definition) = 0 then
    raise exception 'UNEXPECTED_CONFIRM_PARCEL_DELIVERY_DEFINITION';
  end if;
  v_definition := replace(v_definition,
    'on conflict (tracking_code) do nothing',
    'on conflict (agency, tracking_code) do nothing');
  v_definition := replace(v_definition,
    'from public.stockage_parcels where tracking_code=v_code for update',
    'from public.stockage_parcels where agency=v_agency and tracking_code=v_code for update');
  v_definition := replace(v_definition,
    'where tracking_code=v_code and version=v_parcel.version and delivery_status=''AVAILABLE''',
    'where agency=v_agency and tracking_code=v_code and version=v_parcel.version and delivery_status=''AVAILABLE''');
  execute v_definition;

  select pg_get_functiondef('public.reconcile_initial_physical_inventory(text,jsonb,date,text,uuid,uuid)'::regprocedure)
    into v_definition;
  if position('exists (select 1 from public.stockage_parcels where tracking_code = v_code)' in v_definition) = 0 then
    raise exception 'UNEXPECTED_INVENTORY_RECONCILIATION_DEFINITION';
  end if;
  v_definition := replace(v_definition,
    'exists (select 1 from public.stockage_parcels where tracking_code = v_code)',
    'exists (select 1 from public.stockage_parcels where agency = v_agency and tracking_code = v_code)');
  execute v_definition;

  select pg_get_functiondef('public.finalize_paid_destination_orchestration(uuid,text,date,text,text,text)'::regprocedure)
    into v_definition;
  if position('from public.stockage_parcels where tracking_code=v_row.tracking_code for update' in v_definition) = 0 then
    raise exception 'UNEXPECTED_PAID_DESTINATION_DEFINITION';
  end if;
  v_definition := replace(v_definition,
    'from public.stockage_parcels where tracking_code=v_row.tracking_code for update',
    'from public.stockage_parcels where agency=v_row.agency and tracking_code=v_row.tracking_code for update');
  v_definition := replace(v_definition,
    'where tracking_code=v_row.tracking_code and version=v_parcel.version and delivery_status=''AVAILABLE''',
    'where agency=v_row.agency and tracking_code=v_row.tracking_code and version=v_parcel.version and delivery_status=''AVAILABLE''');
  execute v_definition;

  select pg_get_functiondef('public.confirm_forwarding_delivery(text,text,boolean,date,uuid,uuid)'::regprocedure)
    into v_definition;
  if position('from public.stockage_parcels where tracking_code=v_forwarding.forwarding_reference for update' in v_definition) = 0 then
    raise exception 'UNEXPECTED_FORWARDING_DELIVERY_DEFINITION';
  end if;
  v_definition := replace(v_definition,
    'from public.stockage_parcels where tracking_code=v_forwarding.forwarding_reference for update',
    'from public.stockage_parcels where agency=v_forwarding.destination_agency and tracking_code=v_forwarding.forwarding_reference for update');
  v_definition := replace(v_definition,
    'where tracking_code=v_forwarding.forwarding_reference and version=v_parcel.version',
    'where agency=v_forwarding.destination_agency and tracking_code=v_forwarding.forwarding_reference and version=v_parcel.version');
  execute v_definition;
end $$;

commit;
