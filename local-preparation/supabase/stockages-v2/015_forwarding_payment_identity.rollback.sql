-- Rollback is allowed only before a native/forwarding homonym has produced two legitimate exits.
begin;
do $$ begin
 if exists(select 1 from public.stockage_payment_orchestrations where forwarding_id is not null) then
   raise exception 'ROLLBACK_BLOCKED: FORWARDING_PAYMENT_IDENTITY_ALREADY_USED';
 end if;
 if exists(
   select 1 from public.stockage_events
   where event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT')
   group by agency,tracking_code having count(*)>1
 ) then raise exception 'ROLLBACK_BLOCKED: NATIVE_FORWARDING_COLLISION_ALREADY_USED'; end if;
end $$;
drop function if exists public.finalize_forwarding_destination_payment(uuid,text,date,text,text,text);
drop function if exists public.begin_forwarding_destination_payment(uuid,text,uuid,uuid,text,numeric,numeric,uuid);
drop index if exists public.stockage_payment_forwarding_request_unique;
drop index if exists public.stockage_events_forwarding_delivery_unique;
drop index if exists public.stockage_events_native_delivery_unique;
create unique index stockage_events_delivery_unique on public.stockage_events(agency,tracking_code)
 where event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT');
alter table public.stockage_payment_orchestrations drop constraint stockage_payment_forwarding_identity_check;
alter table public.stockage_payment_orchestrations drop column forwarding_id,drop column parcel_id;
commit;
