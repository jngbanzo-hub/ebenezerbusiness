begin;
do $$ begin
 if exists(select 1 from public.stockage_forwarding_events where event_type='FORWARDING_DEPARTED')
 or exists(select 1 from public.stockage_events where event_type='SORTIE_POUR_ACHEMINEMENT') then
   raise exception 'ROLLBACK_BLOCKED: KLZ_LSHI_DEPARTURE_ALREADY_USED';
 end if;
end $$;
drop function if exists public.confirm_klz_lshi_departure(text,numeric,text,date,uuid,uuid);
commit;
