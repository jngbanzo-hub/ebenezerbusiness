-- READ-ONLY POST-MIGRATION VERIFICATION. This script changes nothing.

select
  'table_presence' as check_name,
  to_regclass('public.logistics_events') is not null as passed;

with expected(column_name, data_type) as (
  values
    ('id', 'text'),
    ('parcel_id', 'text'),
    ('tracking_code', 'text'),
    ('event_type', 'text'),
    ('version_before', 'integer'),
    ('version_after', 'integer'),
    ('occurred_at', 'timestamp with time zone'),
    ('source', 'text'),
    ('payload', 'jsonb'),
    ('agency_scope', 'ARRAY'),
    ('created_at', 'timestamp with time zone')
),
actual as (
  select column_name, data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'logistics_events'
)
select
  'expected_columns' as check_name,
  expected.column_name,
  actual.data_type,
  actual.column_name is not null as column_exists,
  actual.data_type = expected.data_type as type_valid
from expected
left join actual using (column_name)
order by expected.column_name;

select
  'constraints' as check_name,
  constraint_name,
  constraint_type
from information_schema.table_constraints
where table_schema = 'public'
  and table_name = 'logistics_events'
order by constraint_name;

select
  'indexes' as check_name,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'logistics_events'
order by indexname;

select
  'rls_status' as check_name,
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where oid = 'public.logistics_events'::regclass;

select
  'policies' as check_name,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'logistics_events'
order by policyname;

select
  'role_privileges' as check_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'logistics_events'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

select
  'expected_privileges' as check_name,
  not has_table_privilege('anon', 'public.logistics_events', 'SELECT')
    as anon_select_denied,
  not has_table_privilege('anon', 'public.logistics_events', 'INSERT')
    as anon_insert_denied,
  has_table_privilege('authenticated', 'public.logistics_events', 'SELECT')
    as authenticated_select_allowed,
  not has_table_privilege('authenticated', 'public.logistics_events', 'INSERT')
    as authenticated_insert_denied,
  not has_table_privilege('authenticated', 'public.logistics_events', 'UPDATE')
    as authenticated_update_denied,
  not has_table_privilege('authenticated', 'public.logistics_events', 'DELETE')
    as authenticated_delete_denied,
  has_table_privilege('service_role', 'public.logistics_events', 'INSERT')
    as service_insert_allowed,
  not has_table_privilege('service_role', 'public.logistics_events', 'UPDATE')
    as service_update_denied,
  not has_table_privilege('service_role', 'public.logistics_events', 'DELETE')
    as service_delete_denied;

select
  'financial_columns_absent' as check_name,
  count(*) = 0 as passed
from information_schema.columns
where table_schema = 'public'
  and table_name = 'logistics_events'
  and lower(column_name) in (
    'amount',
    'currency',
    'payment',
    'payment_status',
    'fee',
    'fees',
    'montant',
    'devise',
    'frais'
  );

select
  'immutability_trigger' as check_name,
  count(*) = 1 as passed
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'logistics_events'
  and trigger_name = 'logistics_events_reject_mutation';
