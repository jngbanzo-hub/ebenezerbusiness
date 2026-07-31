begin;
revoke all on function public.record_cash_expense_debit(
  text, text, text, boolean, numeric, date, timestamptz, uuid, text, text, text, jsonb
) from public, anon, authenticated, service_role;
drop function if exists public.record_cash_expense_debit(
  text, text, text, boolean, numeric, date, timestamptz, uuid, text, text, text, jsonb
);
commit;
