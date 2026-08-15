begin;

create or replace function public.read_qr_admin_server(
  p_actor_id uuid,
  p_selector text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_selector text := upper(btrim(coalesce(p_selector, '')));
  v_label public.qr_labels%rowtype;
  v_audit jsonb;
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

  if v_selector ~ '^[0-9]+$' then
    select * into v_label
    from public.qr_labels
    where display_number = v_selector::bigint;
  else
    select * into v_label
    from public.qr_labels
    where qr_id = v_selector;
  end if;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.occurred_at, a.event_id), '[]'::jsonb)
  into v_audit
  from public.qr_audit_events a
  where a.qr_id = v_label.qr_id;

  return jsonb_build_object(
    'label', jsonb_build_object(
      'qr_id', v_label.qr_id,
      'display_number', v_label.display_number,
      'status', v_label.status,
      'agency', v_label.agency,
      'tracking_code', v_label.tracking_code,
      'version', v_label.version,
      'created_at', v_label.created_at,
      'created_by', v_label.created_by,
      'assigned_at', v_label.assigned_at,
      'assigned_by', v_label.assigned_by,
      'revoked_at', v_label.revoked_at,
      'revoked_by', v_label.revoked_by
    ),
    'audit', v_audit
  );
end;
$$;

revoke all on function public.read_qr_admin_server(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_qr_admin_server(uuid, text)
  to service_role;

commit;
