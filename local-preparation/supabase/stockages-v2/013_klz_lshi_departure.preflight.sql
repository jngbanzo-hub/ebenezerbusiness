-- READ-ONLY PREFLIGHT for the isolated KLZ -> LSHI departure RPC.
do $$ begin
 if to_regprocedure('public.confirm_klz_lshi_departure(text,numeric,text,date,uuid,uuid)') is not null then
   raise exception 'PREFLIGHT_DRIFT: confirm_klz_lshi_departure already exists';
 end if;
 if position('IN_TRANSIT' in pg_get_constraintdef((select oid from pg_constraint where conrelid='public.stockage_forwardings'::regclass and conname='stockage_forwardings_status_check'),true))=0
 or position('IN_TRANSIT' in pg_get_constraintdef((select oid from pg_constraint where conrelid='public.stockage_forwarding_orchestrations'::regclass and conname='stockage_forwarding_orchestrations_state_check'),true))=0
 or position('FORWARDING_DEPARTED' in pg_get_constraintdef((select oid from pg_constraint where conrelid='public.stockage_forwarding_events'::regclass and conname='stockage_forwarding_events_event_type_check'),true))=0
 or position('SORTIE_POUR_ACHEMINEMENT' in pg_get_constraintdef((select oid from pg_constraint where conrelid='public.stockage_events'::regclass and conname='stockage_events_type_check'),true))=0 then
   raise exception 'PREFLIGHT_MISSING: KLZ_LSHI_TRANSIT_CONSTRAINTS';
 end if;
end $$;
