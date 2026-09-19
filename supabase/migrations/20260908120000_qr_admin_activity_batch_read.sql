begin;

create or replace function public.read_qr_admin_activity_batch_server(
  p_actor_id uuid,
  p_since timestamptz
) returns table (
  event_id uuid,
  qr_id text,
  action text,
  new_agency text,
  new_tracking_code text,
  actor_agency text,
  actor_role text,
  actor_id uuid,
  occurred_at timestamptz,
  new_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.agents
    where id = p_actor_id
      and actif is true
      and upper(btrim(role)) = 'ADMIN'
  ) then
    raise exception 'QR_ADMIN_REQUIRED';
  end if;

  if p_since is null then
    raise exception 'QR_ACTIVITY_SINCE_REQUIRED';
  end if;

  return query
  select
    audit.event_id,
    audit.qr_id,
    audit.action,
    audit.new_agency,
    audit.new_tracking_code,
    audit.actor_agency,
    audit.actor_role,
    audit.actor_id,
    audit.occurred_at,
    audit.new_status
  from public.qr_audit_events audit
  join public.qr_labels label on label.qr_id = audit.qr_id
  where label.status = 'ASSIGNED'
    and audit.occurred_at >= p_since
  order by audit.occurred_at desc, audit.event_id desc;
end;
$$;

revoke all on function public.read_qr_admin_activity_batch_server(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.read_qr_admin_activity_batch_server(uuid, timestamptz)
  to service_role;

commit;
