-- LOCAL/CONTROLLED DATABASE ONLY. All test data is rolled back.
begin;

do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from (values
    ('stockage_accounts'), ('stockage_events'), ('stockage_parcels'),
    ('stockage_admin_audit'), ('stockage_anomalies')
  ) expected(name)
  where to_regclass('public.' || expected.name) is null;
  if v_missing <> 0 then raise exception 'STOCKAGE_TABLES_MISSING'; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name like 'stockage_%'
      and column_name ~* '(amount|currency|payment_status)'
  ) then raise exception 'FINANCIAL_COLUMN_FORBIDDEN'; end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'stockage_events_delivery_unique'
  ) then raise exception 'DELIVERY_UNIQUENESS_MISSING'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'stockage_%'
      and grantee in ('anon', 'PUBLIC')
  ) then raise exception 'ANON_OR_PUBLIC_PRIVILEGE_FOUND'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'stockage_%'
      and grantee = 'authenticated' and privilege_type <> 'SELECT'
  ) then raise exception 'AUTHENTICATED_WRITE_PRIVILEGE_FOUND'; end if;
end;
$$;

rollback;
