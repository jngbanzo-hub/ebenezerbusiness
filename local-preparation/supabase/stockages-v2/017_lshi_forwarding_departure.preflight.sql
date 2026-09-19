-- READ-ONLY PREFLIGHT. Does not install migration 017.
begin transaction read only;
select
  to_regclass('public.stockage_parcels_native_identity_unique') is not null as native_identity_index_present,
  to_regclass('public.stockage_parcels_forwarding_identity_unique') is not null as forwarding_identity_index_present,
  to_regclass('public.stockage_payment_forwarding_request_unique') is not null as payment_forwarding_index_present,
  to_regprocedure('public.begin_forwarding_destination_payment(uuid,text,uuid,uuid,text,numeric,numeric,uuid)') is not null as migration_015_payment_begin_present,
  to_regprocedure('public.confirm_klz_forwarding_departure(text,text,numeric,text,numeric,numeric,text,date,uuid,text,uuid)') is not null as migration_016_departure_present,
  to_regprocedure('public.record_forwarding_arrival(text,text,date,uuid,uuid)') is not null as arrival_present,
  to_regprocedure('public.finalize_forwarding_destination_payment(uuid,text,date,text,text,text)') is not null as destination_payment_present,
  (select count(*) from public.stockage_forwardings where origin_agency='LSHI') as existing_lshi_forwardings,
  (select count(*) from public.stockage_forwardings where original_tracking_code='JL27226') as jl27226_forwardings;
rollback;
