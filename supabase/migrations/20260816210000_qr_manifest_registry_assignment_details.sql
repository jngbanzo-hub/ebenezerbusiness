-- Expose current assignment identity to trusted server readers only.
begin;

create or replace function public.read_qr_manifest_registry_server(
  p_display_numbers bigint[] default '{}'::bigint[]
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'registry', coalesce((
      select jsonb_agg(jsonb_build_object(
        'qrId', q.qr_id,
        'displayNumber', q.display_number,
        'status', q.status,
        'version', q.version,
        'agency', q.agency,
        'trackingCode', q.tracking_code
      ) order by q.display_number)
      from public.qr_labels q
      where q.display_number = any(coalesce(p_display_numbers, '{}'::bigint[]))
    ), '[]'::jsonb),
    'activeAssignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'qrId', q.qr_id,
        'agency', q.agency,
        'trackingCode', q.tracking_code
      ) order by q.display_number)
      from public.qr_labels q
      where q.status = 'ASSIGNED'
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.read_qr_manifest_registry_server(bigint[])
  from public, anon, authenticated, service_role;
grant execute on function public.read_qr_manifest_registry_server(bigint[])
  to service_role;

commit;
