-- PREPARATORY ROLLBACK. Apply only if the matching migration was installed.
begin;
drop function if exists public.open_cash_account(text,numeric,date,text,text,uuid);
commit;
