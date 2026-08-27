-- Safe only while none of the newly authorized values has been used.
begin;

do $$ begin
 if exists(select 1 from public.stockage_forwarding_orchestrations where state='IN_TRANSIT')
 or exists(select 1 from public.stockage_forwardings where status='IN_TRANSIT')
 or exists(select 1 from public.stockage_forwarding_events where event_type='FORWARDING_DEPARTED')
 or exists(select 1 from public.stockage_events where event_type='SORTIE_POUR_ACHEMINEMENT') then
   raise exception 'ROLLBACK_BLOCKED: KLZ_LSHI_TRANSIT_VALUES_ALREADY_USED';
 end if;
end $$;

alter table public.stockage_forwarding_orchestrations drop constraint stockage_forwarding_orchestrations_state_check;
alter table public.stockage_forwarding_orchestrations add constraint stockage_forwarding_orchestrations_state_check check(state in ('QUOTE_READY','PAYMENT_IN_PROGRESS','PAID_AWAITING_ARRIVAL','ARRIVAL_CONFIRMED','READY_FOR_DELIVERY','DELIVERED','CANCELLED_BY_COMPENSATION','ANOMALY_REQUIRES_ADMIN'));

alter table public.stockage_forwardings drop constraint stockage_forwardings_status_check;
alter table public.stockage_forwardings add constraint stockage_forwardings_status_check check(status in ('PAID_AWAITING_ARRIVAL','ARRIVAL_CONFIRMED','READY_FOR_DELIVERY','DELIVERED','CANCELLED_BY_COMPENSATION','ANOMALY_REQUIRES_ADMIN'));

alter table public.stockage_forwarding_events drop constraint stockage_forwarding_events_event_type_check;
alter table public.stockage_forwarding_events add constraint stockage_forwarding_events_event_type_check check(event_type in ('PAYMENT_CONFIRMED','FORWARDING_CREATED','FORWARDING_ARRIVED','FORWARDING_READY_FOR_DELIVERY','FORWARDING_DELIVERED','FORWARDING_ANOMALY_RECORDED','FORWARDING_CANCELLED_BY_COMPENSATION'));

alter table public.stockage_events drop constraint stockage_events_type_check;
alter table public.stockage_events add constraint stockage_events_type_check check(event_type in ('OPENING_STOCK_RECORDED','MANUAL_ARRIVAL_RECORDED','CONFIRMED_DELIVERY_RECORDED','ADMIN_STOCK_ADJUSTMENT_RECORDED','STOCK_CORRECTION_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT','ARRIVAGE_ACHEMINEMENT','CORRECTION_COMPENSATOIRE_ADMIN'));

alter table public.stockage_events drop constraint stockage_events_semantics_check;
alter table public.stockage_events add constraint stockage_events_semantics_check check (
 (event_type='OPENING_STOCK_RECORDED' and parcel_count_delta>=0 and weight_kg_delta>=0 and actor_role='ADMIN') or
 (event_type in ('MANUAL_ARRIVAL_RECORDED','ARRIVAGE_ACHEMINEMENT') and parcel_count_delta>0 and weight_kg_delta>0 and actor_role='AGENT') or
 (event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT') and parcel_count_delta=-1 and weight_kg_delta<0 and tracking_code is not null and actor_role='AGENT') or
 (event_type in ('ADMIN_STOCK_ADJUSTMENT_RECORDED','STOCK_CORRECTION_RECORDED','CORRECTION_COMPENSATOIRE_ADMIN') and actor_role='ADMIN' and (parcel_count_delta<>0 or weight_kg_delta<>0) and reason is not null and btrim(reason)<>'')
);

commit;
