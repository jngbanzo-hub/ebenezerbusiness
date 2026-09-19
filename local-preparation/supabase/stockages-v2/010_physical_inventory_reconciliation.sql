-- Apply only after an explicit physical-inventory reconciliation authorization.
begin;

alter table public.stockage_parcels drop constraint stockage_parcels_source_check;
alter table public.stockage_parcels add constraint stockage_parcels_source_check check (
  weight_source in (
    'SHIPPING_MANIFEST',
    'PAYMENT_SNAPSHOT_CONTROL',
    'PHYSICAL_INVENTORY_RECONCILIATION'
  ) and btrim(weight_source_reference) <> ''
);

create or replace function public.reconcile_initial_physical_inventory(
  p_agency text,
  p_parcels jsonb,
  p_business_date date,
  p_reason text,
  p_request_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_admin public.agents%rowtype;
  v_account public.stockage_accounts%rowtype;
  v_opening public.stockage_events%rowtype;
  v_existing public.stockage_admin_audit%rowtype;
  v_item jsonb;
  v_codes jsonb;
  v_count integer;
  v_weight numeric(18,3);
  v_count_delta integer;
  v_weight_delta numeric(18,3);
  v_hash text;
  v_event_id text;
  v_agency text := upper(btrim(p_agency));
  v_code text;
  v_item_weight numeric(18,3);
begin
  select * into v_admin from public.agents where id = p_actor_id;
  if not found or v_admin.actif is not true or upper(btrim(v_admin.role)) <> 'ADMIN' then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if v_agency not in ('FIH', 'LSHI', 'KLZ') or p_business_date is null
     or p_request_id is null or btrim(coalesce(p_reason, '')) = ''
     or jsonb_typeof(p_parcels) <> 'array' or jsonb_array_length(p_parcels) = 0 then
    raise exception 'INVALID_INVENTORY_RECONCILIATION';
  end if;

  select count(*), sum((item->>'weightKg')::numeric)
    into v_count, v_weight
  from jsonb_array_elements(p_parcels) item;
  if v_count > 500 or v_weight <= 0
     or (select count(distinct upper(btrim(item->>'trackingCode')))
         from jsonb_array_elements(p_parcels) item) <> v_count then
    raise exception 'INVALID_INVENTORY_RECONCILIATION';
  end if;

  v_codes := (select jsonb_agg(jsonb_build_object(
    'trackingCode', upper(btrim(item->>'trackingCode')),
    'weightKg', (item->>'weightKg')::numeric
  ) order by upper(btrim(item->>'trackingCode'))) from jsonb_array_elements(p_parcels) item);
  v_hash := encode(extensions.digest(jsonb_build_object(
    'type', 'PHYSICAL_INVENTORY_RECONCILED', 'agency', v_agency,
    'parcels', v_codes, 'businessDate', p_business_date,
    'reason', btrim(p_reason), 'actorId', p_actor_id
  )::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('stockage-inventory:' || v_agency, 0));
  select * into v_existing from public.stockage_admin_audit where request_id = p_request_id;
  if found then
    if v_existing.metadata->>'commandFingerprint' <> v_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('state', 'SUCCESS', 'replayed', true,
      'eventId', v_existing.target_event_id, 'parcelCount', v_count, 'weightKg', v_weight);
  end if;

  select * into v_account from public.stockage_accounts where agency = v_agency for update;
  if not found or v_account.status <> 'ACTIVE' then raise exception 'STORAGE_ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_opening from public.stockage_events
    where account_id = v_account.id and event_type = 'OPENING_STOCK_RECORDED' for update;
  if not found or (select count(*) from public.stockage_events where account_id = v_account.id) <> 1
     or v_account.current_parcel_count <> v_opening.parcel_count_delta
     or v_account.current_weight_kg <> v_opening.weight_kg_delta then
    raise exception 'INVENTORY_HISTORY_NOT_RECONCILABLE';
  end if;
  if exists (select 1 from public.stockage_parcels where agency = v_agency) then
    raise exception 'INVENTORY_ALREADY_MATERIALIZED';
  end if;

  for v_item in select value from jsonb_array_elements(p_parcels) loop
    v_code := upper(btrim(v_item->>'trackingCode'));
    v_item_weight := (v_item->>'weightKg')::numeric;
    if v_code !~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$' or v_item_weight <= 0
       or exists (select 1 from public.stockage_parcels where tracking_code = v_code) then
      raise exception 'INVENTORY_PARCEL_CONFLICT';
    end if;
  end loop;

  v_count_delta := v_count - v_account.current_parcel_count;
  v_weight_delta := v_weight - v_account.current_weight_kg;
  if v_count_delta = 0 and v_weight_delta = 0 then
    raise exception 'INVENTORY_RECONCILIATION_HAS_NO_EFFECT';
  end if;
  v_event_id := 'stockage-inventory-reconciliation-' ||
    encode(extensions.digest(p_request_id::text, 'sha256'), 'hex');

  insert into public.stockage_events(
    event_id, account_id, request_id, event_type, agency, parcel_count_delta,
    weight_kg_delta, actor_id, actor_name, actor_role, business_date, occurred_at,
    payload_hash, account_version_before, account_version_after, source_type,
    target_event_id, reason, metadata
  ) values (
    v_event_id, v_account.id, p_request_id, 'STOCK_CORRECTION_RECORDED', v_agency,
    v_count_delta, v_weight_delta, p_actor_id, btrim(v_admin.nom), 'ADMIN',
    p_business_date, clock_timestamp(), v_hash, v_account.version,
    v_account.version + 1, 'ADMIN_PHYSICAL_INVENTORY_RECONCILIATION',
    v_opening.event_id, btrim(p_reason), jsonb_build_object(
      'correctedParcelDelta', v_count, 'correctedWeightDelta', v_weight,
      'physicalInventory', v_codes
    )
  );

  for v_item in select value from jsonb_array_elements(p_parcels) loop
    insert into public.stockage_parcels(
      tracking_code, agency, canonical_weight_kg, weight_source, weight_source_reference
    ) values (
      upper(btrim(v_item->>'trackingCode')), v_agency, (v_item->>'weightKg')::numeric,
      'PHYSICAL_INVENTORY_RECONCILIATION', 'inventory:' || p_request_id::text
    );
  end loop;

  update public.stockage_accounts set current_parcel_count = v_count,
    current_weight_kg = v_weight, version = version + 1,
    updated_at = clock_timestamp()
  where id = v_account.id and version = v_account.version;
  if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;

  insert into public.stockage_admin_audit(
    audit_id, action, agency, request_id, admin_id, admin_name, old_value,
    new_value, reason, target_event_id, occurred_at, metadata
  ) values (
    'audit-' || encode(extensions.digest(p_request_id::text, 'sha256'), 'hex'),
    'PHYSICAL_INVENTORY_RECONCILED', v_agency, p_request_id, p_actor_id,
    btrim(v_admin.nom), jsonb_build_object(
      'parcelCount', v_account.current_parcel_count,
      'weightKg', v_account.current_weight_kg
    ), jsonb_build_object(
      'parcelCount', v_count, 'weightKg', v_weight, 'parcels', v_codes
    ), btrim(p_reason), v_event_id, clock_timestamp(),
    jsonb_build_object('commandFingerprint', v_hash)
  );

  return jsonb_build_object('state', 'SUCCESS', 'replayed', false,
    'eventId', v_event_id, 'parcelCount', v_count, 'weightKg', v_weight);
end;
$$;

revoke all on function public.reconcile_initial_physical_inventory(text,jsonb,date,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_initial_physical_inventory(text,jsonb,date,text,uuid,uuid)
  to service_role;

commit;
