-- READ ONLY. Run before 015_forwarding_payment_identity.sql.
do $$
declare v_index text;
begin
  if to_regclass('public.stockage_events') is null
    or to_regclass('public.stockage_parcels') is null
    or to_regclass('public.stockage_forwardings') is null
    or to_regclass('public.stockage_payment_orchestrations') is null then
    raise exception 'FORWARDING_PAYMENT_IDENTITY_PREREQUISITES_MISSING';
  end if;

  select indexdef into v_index from pg_indexes
  where schemaname='public' and indexname='stockage_events_delivery_unique';
  if v_index is null
    or position('(agency, tracking_code)' in lower(v_index))=0 then
    raise exception 'STOCKAGE_EVENTS_DELIVERY_INDEX_DRIFT';
  end if;

  if exists (
    select 1 from public.stockage_events
    where source_type='INTER_AGENCY_FORWARDING'
      and event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT')
      and (source_request_id is null or source_request_id !~* '^[0-9a-f-]{36}$')
  ) then raise exception 'INVALID_FORWARDING_EVENT_IDENTITY'; end if;

  if exists (
    select 1 from public.stockage_events
    where source_type='INTER_AGENCY_FORWARDING'
      and event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT')
    group by source_request_id having count(*)>1
  ) then raise exception 'DUPLICATE_FORWARDING_DELIVERY_IDENTITY'; end if;
end $$;
