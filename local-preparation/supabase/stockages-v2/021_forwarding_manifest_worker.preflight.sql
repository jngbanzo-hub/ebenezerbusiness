begin;
do $$ begin
  if to_regclass('public.stockage_forwarding_manifest_registry') is null then raise exception 'MIGRATION_019_REQUIRED'; end if;
  if to_regprocedure('public.reconcile_forwarding_manifest_registry(uuid)') is null then raise exception 'MIGRATION_020_REQUIRED'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='stockage_forwarding_manifest_registry' and column_name in ('claimed_at','claimed_by','lease_until')) then raise exception 'MIGRATION_021_ALREADY_OR_PARTIALLY_APPLIED'; end if;
end $$;
rollback;
