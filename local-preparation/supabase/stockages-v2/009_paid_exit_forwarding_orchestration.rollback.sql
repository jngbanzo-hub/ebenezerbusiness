-- PREPARATORY MANUAL ROLLBACK. Review backups before execution.
begin;
drop function if exists public.confirm_forwarding_delivery(text,text,boolean,date,uuid,uuid);
drop function if exists public.record_forwarding_arrival(text,text,date,uuid,uuid);
drop function if exists public.finalize_inter_agency_forwarding(uuid,text);
drop function if exists public.checkpoint_inter_agency_payment(uuid,text,jsonb);
drop function if exists public.begin_inter_agency_forwarding(text,text,text,numeric,numeric,text,text,text,uuid,text,uuid);
drop function if exists public.finalize_paid_destination_orchestration(uuid,text,date,text,text,text);
drop function if exists public.checkpoint_paid_destination_payment(uuid,text,jsonb);
drop function if exists public.begin_paid_destination_orchestration(uuid,text,text,text,numeric,numeric,uuid);
drop table if exists public.stockage_forwarding_events;
drop table if exists public.stockage_forwarding_anomalies;
drop table if exists public.stockage_forwarding_orchestrations;
drop table if exists public.stockage_forwardings;
drop table if exists public.stockage_payment_orchestrations;
alter table public.stockage_events drop constraint stockage_events_type_check;
alter table public.stockage_events add constraint stockage_events_type_check check(event_type in ('OPENING_STOCK_RECORDED','MANUAL_ARRIVAL_RECORDED','CONFIRMED_DELIVERY_RECORDED','ADMIN_STOCK_ADJUSTMENT_RECORDED','STOCK_CORRECTION_RECORDED'));
alter table public.stockage_events drop constraint stockage_events_semantics_check;
alter table public.stockage_events add constraint stockage_events_semantics_check check (
 (event_type='OPENING_STOCK_RECORDED' and parcel_count_delta>=0 and weight_kg_delta>=0 and tracking_code is null and target_event_id is null and actor_role='ADMIN') or
 (event_type='MANUAL_ARRIVAL_RECORDED' and parcel_count_delta>0 and weight_kg_delta>0 and tracking_code is null and target_event_id is null and actor_role='AGENT') or
 (event_type='CONFIRMED_DELIVERY_RECORDED' and parcel_count_delta=-1 and weight_kg_delta<0 and tracking_code is not null and target_event_id is null and actor_role='AGENT') or
 (event_type='ADMIN_STOCK_ADJUSTMENT_RECORDED' and actor_role='ADMIN' and (parcel_count_delta<>0 or weight_kg_delta<>0) and target_event_id is null and reason is not null and btrim(reason)<>'') or
 (event_type='STOCK_CORRECTION_RECORDED' and actor_role='ADMIN' and (parcel_count_delta<>0 or weight_kg_delta<>0) and target_event_id is not null and reason is not null and btrim(reason)<>'')
);
drop index if exists stockage_events_delivery_unique;
create unique index stockage_events_delivery_unique on public.stockage_events(tracking_code) where event_type='CONFIRMED_DELIVERY_RECORDED';
alter table public.stockage_anomalies drop constraint stockage_anomalies_type_check;
alter table public.stockage_anomalies add constraint stockage_anomalies_type_check check(anomaly_type in ('WEIGHT_MISSING','WEIGHT_AMBIGUOUS','WEIGHT_CONFLICT','AGENCY_MISMATCH','INSUFFICIENT_STOCK','PARCEL_NOT_FOUND','DUPLICATE_DELIVERY_ATTEMPT','IDEMPOTENCY_CONFLICT','VERSION_CONFLICT'));
commit;
