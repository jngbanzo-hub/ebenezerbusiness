-- READ-ONLY VALIDATION. SAFE AFTER A SEPARATELY AUTHORIZED MIGRATION.
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege(
    'service_role',
    'public.record_cash_payment_credit(text,text,text,numeric,date,timestamptz,uuid,text,text,jsonb)',
    'EXECUTE'
  ) as service_role_can_execute,
  has_function_privilege(
    'authenticated',
    'public.record_cash_payment_credit(text,text,text,numeric,date,timestamptz,uuid,text,text,jsonb)',
    'EXECUTE'
  ) as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'record_cash_payment_credit';
