-- READ-ONLY validation. Run only after scripts 001-007 in an authorized environment.
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'stockage_%'
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
group by grantee, table_name
order by table_name, grantee;

select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where specific_schema = 'public'
  and routine_name in (
    'record_opening_stock', 'record_manual_arrival', 'confirm_parcel_delivery',
    'record_admin_stock_adjustment', 'record_stock_correction', 'record_stockage_anomaly'
  )
order by routine_name, grantee;

select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'stockage_accounts', 'stockage_events', 'stockage_parcels',
  'stockage_admin_audit', 'stockage_anomalies'
)
order by c.relname;
