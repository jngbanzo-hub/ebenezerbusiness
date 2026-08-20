-- Read-only recent initial QR assignments for the trusted COO server route.
begin;

create or replace function public.read_qr_assignment_history_server(
  p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', history.event_id,
    'qrId', history.qr_id,
    'displayNumber', history.display_number,
    'agency', history.agency,
    'trackingCode', history.tracking_code,
    'assignedAt', history.occurred_at,
    'actorId', history.actor_id,
    'actorName', history.actor_name,
    'actorRole', history.actor_role,
    'status', history.status
  ) order by history.occurred_at desc, history.event_id desc), '[]'::jsonb)
  from (
    select
      audit.event_id,
      audit.qr_id,
      label.display_number,
      coalesce(audit.new_agency, label.agency) as agency,
      coalesce(audit.new_tracking_code, label.tracking_code) as tracking_code,
      audit.occurred_at,
      audit.actor_id,
      nullif(btrim(agent.nom), '') as actor_name,
      audit.actor_role,
      label.status
    from public.qr_audit_events audit
    join public.qr_labels label on label.qr_id = audit.qr_id
    left join public.agents agent on agent.id = audit.actor_id
    where audit.action = 'INITIAL_ASSIGNMENT'
    order by audit.occurred_at desc, audit.event_id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) history;
$$;

revoke all on function public.read_qr_assignment_history_server(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.read_qr_assignment_history_server(integer)
  to service_role;

commit;
