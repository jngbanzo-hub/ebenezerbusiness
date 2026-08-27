-- READ-ONLY PREFLIGHT. Aborts if Production constraints drifted.
do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid, true) into v_definition from pg_constraint
  where conrelid='public.stockage_forwarding_orchestrations'::regclass and conname='stockage_forwarding_orchestrations_state_check';
  if v_definition is distinct from 'CHECK (state = ANY (ARRAY[''QUOTE_READY''::text, ''PAYMENT_IN_PROGRESS''::text, ''PAID_AWAITING_ARRIVAL''::text, ''ARRIVAL_CONFIRMED''::text, ''READY_FOR_DELIVERY''::text, ''DELIVERED''::text, ''CANCELLED_BY_COMPENSATION''::text, ''ANOMALY_REQUIRES_ADMIN''::text]))' then raise exception 'PREFLIGHT_DRIFT: stockage_forwarding_orchestrations_state_check'; end if;

  select pg_get_constraintdef(oid, true) into v_definition from pg_constraint
  where conrelid='public.stockage_forwardings'::regclass and conname='stockage_forwardings_status_check';
  if v_definition is distinct from 'CHECK (status = ANY (ARRAY[''PAID_AWAITING_ARRIVAL''::text, ''ARRIVAL_CONFIRMED''::text, ''READY_FOR_DELIVERY''::text, ''DELIVERED''::text, ''CANCELLED_BY_COMPENSATION''::text, ''ANOMALY_REQUIRES_ADMIN''::text]))' then raise exception 'PREFLIGHT_DRIFT: stockage_forwardings_status_check'; end if;

  select pg_get_constraintdef(oid, true) into v_definition from pg_constraint
  where conrelid='public.stockage_forwarding_events'::regclass and conname='stockage_forwarding_events_event_type_check';
  if v_definition is distinct from 'CHECK (event_type = ANY (ARRAY[''PAYMENT_CONFIRMED''::text, ''FORWARDING_CREATED''::text, ''FORWARDING_ARRIVED''::text, ''FORWARDING_READY_FOR_DELIVERY''::text, ''FORWARDING_DELIVERED''::text, ''FORWARDING_ANOMALY_RECORDED''::text, ''FORWARDING_CANCELLED_BY_COMPENSATION''::text]))' then raise exception 'PREFLIGHT_DRIFT: stockage_forwarding_events_event_type_check'; end if;

  select pg_get_constraintdef(oid, true) into v_definition from pg_constraint
  where conrelid='public.stockage_events'::regclass and conname='stockage_events_type_check';
  if v_definition is distinct from 'CHECK (event_type = ANY (ARRAY[''OPENING_STOCK_RECORDED''::text, ''MANUAL_ARRIVAL_RECORDED''::text, ''CONFIRMED_DELIVERY_RECORDED''::text, ''ADMIN_STOCK_ADJUSTMENT_RECORDED''::text, ''STOCK_CORRECTION_RECORDED''::text, ''SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION''::text, ''SORTIE_APRES_REMISE_COLIS_PAYE_COO''::text, ''SORTIE_APRES_REMISE_ACHEMINEMENT''::text, ''ARRIVAGE_ACHEMINEMENT''::text, ''CORRECTION_COMPENSATOIRE_ADMIN''::text]))' then raise exception 'PREFLIGHT_DRIFT: stockage_events_type_check'; end if;

  select pg_get_constraintdef(oid, true) into v_definition from pg_constraint
  where conrelid='public.stockage_events'::regclass and conname='stockage_events_semantics_check';
  if v_definition is distinct from 'CHECK (event_type = ''OPENING_STOCK_RECORDED''::text AND parcel_count_delta >= 0 AND weight_kg_delta >= 0::numeric AND actor_role = ''ADMIN''::text OR (event_type = ANY (ARRAY[''MANUAL_ARRIVAL_RECORDED''::text, ''ARRIVAGE_ACHEMINEMENT''::text])) AND parcel_count_delta > 0 AND weight_kg_delta > 0::numeric AND actor_role = ''AGENT''::text OR (event_type = ANY (ARRAY[''CONFIRMED_DELIVERY_RECORDED''::text, ''SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION''::text, ''SORTIE_APRES_REMISE_COLIS_PAYE_COO''::text, ''SORTIE_APRES_REMISE_ACHEMINEMENT''::text])) AND parcel_count_delta = ''-1''::integer AND weight_kg_delta < 0::numeric AND tracking_code IS NOT NULL AND actor_role = ''AGENT''::text OR (event_type = ANY (ARRAY[''ADMIN_STOCK_ADJUSTMENT_RECORDED''::text, ''STOCK_CORRECTION_RECORDED''::text, ''CORRECTION_COMPENSATOIRE_ADMIN''::text])) AND actor_role = ''ADMIN''::text AND (parcel_count_delta <> 0 OR weight_kg_delta <> 0::numeric) AND reason IS NOT NULL AND btrim(reason) <> ''''::text)' then raise exception 'PREFLIGHT_DRIFT: stockage_events_semantics_check'; end if;
end $$;
