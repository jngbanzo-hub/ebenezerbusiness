-- READ-ONLY structural validation. It never creates or changes data.
select table_name, count(*) as column_count
from information_schema.columns
where table_schema = 'public' and table_name in (
  'stockage_accounts', 'stockage_events', 'stockage_parcels',
  'stockage_admin_audit', 'stockage_anomalies'
)
group by table_name order by table_name;

select conrelid::regclass::text as relation, conname, pg_get_constraintdef(oid) as definition
from pg_catalog.pg_constraint
where connamespace = 'public'::regnamespace and conrelid::regclass::text like 'stockage_%'
order by relation, conname;

select schemaname, tablename, indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public' and tablename like 'stockage_%'
order by tablename, indexname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public' and tablename like 'stockage_%'
order by tablename, policyname;

select 'stockage_accounts' as relation, count(*) from public.stockage_accounts
union all select 'stockage_events', count(*) from public.stockage_events
union all select 'stockage_parcels', count(*) from public.stockage_parcels
union all select 'stockage_admin_audit', count(*) from public.stockage_admin_audit
union all select 'stockage_anomalies', count(*) from public.stockage_anomalies;
