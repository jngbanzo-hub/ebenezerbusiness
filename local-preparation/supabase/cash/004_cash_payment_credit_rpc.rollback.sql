-- PREPARATORY ROLLBACK ONLY. DO NOT APPLY DURING PHASE CAISSE 9.
begin;
revoke all on function public.record_cash_payment_credit(
  text, text, text, numeric, date, timestamptz, uuid, text, text, jsonb
) from service_role;
drop function if exists public.record_cash_payment_credit(
  text, text, text, numeric, date, timestamptz, uuid, text, text, jsonb
);
commit;
