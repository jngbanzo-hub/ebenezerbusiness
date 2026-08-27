-- LOCAL PREPARATION ONLY. Refuses rollback once an LSHI-origin forwarding exists.
begin;
do $$ begin
  if exists(select 1 from public.stockage_forwardings where origin_agency='LSHI')
  then raise exception 'ROLLBACK_BLOCKED: LSHI_FORWARDING_ALREADY_USED'; end if;
end $$;
drop function if exists public.confirm_storage_forwarding_departure(text,text,numeric,text,numeric,numeric,text,date,uuid,text,uuid);
commit;
