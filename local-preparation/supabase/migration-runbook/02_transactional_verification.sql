-- NON-DESTRUCTIVE TRANSACTIONAL CHECK. No row is inserted or changed.
begin;
set local transaction read only;

select
  'structure' as check_name,
  to_regclass('public.logistics_events') is not null as table_exists;

select
  'rls' as check_name,
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where oid = 'public.logistics_events'::regclass;

select
  'agent_policy' as check_name,
  count(*) = 1 as policy_exists
from pg_policies
where schemaname = 'public'
  and tablename = 'logistics_events'
  and policyname = 'logistics_events_agent_read'
  and cmd = 'SELECT';

select
  'client_write_denial' as check_name,
  not has_table_privilege('authenticated', 'public.logistics_events', 'INSERT')
    as insert_denied,
  not has_table_privilege('authenticated', 'public.logistics_events', 'UPDATE')
    as update_denied,
  not has_table_privilege('authenticated', 'public.logistics_events', 'DELETE')
    as delete_denied;

select
  'anonymous_denial' as check_name,
  not has_table_privilege('anon', 'public.logistics_events', 'SELECT')
    as select_denied,
  not has_table_privilege('anon', 'public.logistics_events', 'INSERT')
    as insert_denied;

rollback;
