-- READ-ONLY VALIDATION. This file never changes privileges, schema or data.
begin;
set transaction read only;

with expected(relation_name, grantee, expected_privileges) as (
  values
    ('cash_current_balances', 'authenticated', array['SELECT']::text[]),
    ('cash_current_day', 'authenticated', array['SELECT']::text[]),
    ('cash_daily_history', 'authenticated', array['SELECT']::text[]),
    ('cash_agent_payment_details', 'authenticated', array['SELECT']::text[]),
    ('cash_agency_totals', 'authenticated', array['SELECT']::text[]),
    ('cash_anomalies', 'authenticated', array['SELECT']::text[]),
    ('cash_coo_revenue_outside_cash', 'authenticated', array['SELECT']::text[]),
    ('cash_current_balances', 'service_role', array['SELECT']::text[]),
    ('cash_current_day', 'service_role', array['SELECT']::text[]),
    ('cash_daily_history', 'service_role', array['SELECT']::text[]),
    ('cash_agent_payment_details', 'service_role', array['SELECT']::text[]),
    ('cash_agency_totals', 'service_role', array['SELECT']::text[]),
    ('cash_anomalies', 'service_role', array['SELECT']::text[]),
    ('cash_coo_revenue_outside_cash', 'service_role', array['SELECT']::text[]),
    ('cash_accounts', 'service_role', array['INSERT', 'SELECT', 'UPDATE']::text[]),
    ('cash_events', 'service_role', array['INSERT', 'SELECT']::text[]),
    ('cash_daily_closures', 'service_role', array['INSERT', 'SELECT']::text[]),
    ('cash_admin_audit', 'service_role', array['INSERT', 'SELECT']::text[])
), actual as (
  select table_name as relation_name, grantee,
    array_agg(privilege_type order by privilege_type)::text[] as actual_privileges
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'cash_%'
    and grantee in ('authenticated', 'service_role')
  group by table_name, grantee
), conformance as (
  select e.relation_name, e.grantee, e.expected_privileges,
    coalesce(a.actual_privileges, array[]::text[]) as actual_privileges,
    e.expected_privileges = coalesce(a.actual_privileges, array[]::text[]) as is_conform
  from expected e left join actual a using (relation_name, grantee)
), forbidden_grants as (
  select grantee, table_name, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'cash_accounts', 'cash_events', 'cash_daily_closures', 'cash_admin_audit',
      'cash_current_balances', 'cash_current_day', 'cash_daily_history',
      'cash_agent_payment_details', 'cash_agency_totals', 'cash_anomalies',
      'cash_coo_revenue_outside_cash'
    )
    and grantee in ('anon', 'PUBLIC')
)
select jsonb_pretty(jsonb_build_object(
  'all_privileges_conform', (select bool_and(is_conform) from conformance),
  'privileges', (select jsonb_agg(to_jsonb(c) order by relation_name, grantee) from conformance c),
  'anon_public_grants', (select coalesce(jsonb_agg(to_jsonb(f) order by grantee, table_name, privilege_type), '[]'::jsonb) from forbidden_grants f),
  'row_counts', jsonb_build_object(
    'cash_accounts', (select count(*) from public.cash_accounts),
    'cash_events', (select count(*) from public.cash_events),
    'cash_daily_closures', (select count(*) from public.cash_daily_closures),
    'cash_admin_audit', (select count(*) from public.cash_admin_audit)
  )
)) as validation;

commit;
