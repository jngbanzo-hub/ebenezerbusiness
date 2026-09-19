begin;

create or replace function public.read_qr_stock_summary_server()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'total', count(*),
    'unassigned', count(*) filter (where status = 'UNASSIGNED'),
    'assigned', count(*) filter (where status = 'ASSIGNED'),
    'revoked', count(*) filter (where status = 'REVOKED')
  )
  from public.qr_labels;
$$;

revoke all on function public.read_qr_stock_summary_server()
  from public, anon, authenticated, service_role;
grant execute on function public.read_qr_stock_summary_server()
  to service_role;

commit;
