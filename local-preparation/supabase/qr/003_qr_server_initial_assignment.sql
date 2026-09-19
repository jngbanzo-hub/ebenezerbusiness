-- Phase 5A: narrow server-only initial assignment entry point.
-- This function performs no payment, cash, stock or operational mutation.
begin;

create or replace function public.assign_qr_label_server(
  p_actor_id uuid,
  p_qr_id text,
  p_display_number bigint,
  p_agency text,
  p_tracking_code text,
  p_expected_version bigint,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor record;
  v_label public.qr_labels%rowtype;
  v_replay public.qr_audit_events%rowtype;
  v_id text := upper(btrim(coalesce(p_qr_id, '')));
  v_agency text := upper(btrim(coalesce(p_agency, '')));
  v_code text;
begin
  select
    a.id as actor_id,
    upper(btrim(a.role)) as actor_role,
    case upper(btrim(a.agence))
      when 'COTONOU' then 'COO'
      else upper(btrim(a.agence))
    end as actor_agency
  into v_actor
  from public.agents a
  where a.id = p_actor_id
    and a.actif is true
    and upper(btrim(a.role)) in ('AGENT', 'ADMIN')
  limit 1;
  if not found then raise exception 'QR_ACCESS_DENIED'; end if;

  if (v_id = '') = (p_display_number is null) then
    raise exception 'INVALID_QR_COMMAND';
  end if;
  if v_id <> '' and v_id !~ '^EEBQR[0-9]{6,}$' then raise exception 'INVALID_QR_ID'; end if;
  if p_display_number is not null and p_display_number <= 0 then
    raise exception 'INVALID_QR_DISPLAY_NUMBER';
  end if;
  if p_expected_version is null or p_request_id is null then
    raise exception 'INVALID_QR_COMMAND';
  end if;

  v_code := public.normalize_qr_tracking_code(v_agency, p_tracking_code, 'BUSINESS');
  if v_actor.actor_role = 'AGENT'
     and v_actor.actor_agency not in ('COO', v_agency) then
    raise exception 'QR_AGENCY_ACCESS_DENIED';
  end if;

  select * into v_replay from public.qr_audit_events where request_id = p_request_id;
  if found then
    if v_replay.action <> 'INITIAL_ASSIGNMENT'
       or v_replay.actor_id <> p_actor_id
       or (v_id <> '' and v_replay.qr_id <> v_id)
       or v_replay.new_agency <> v_agency
       or v_replay.new_tracking_code <> v_code then
      raise exception 'QR_IDEMPOTENCY_CONFLICT';
    end if;
    select * into v_label from public.qr_labels where qr_id = v_replay.qr_id;
    if p_display_number is not null and v_label.display_number <> p_display_number then
      raise exception 'QR_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'qrId', v_label.qr_id, 'displayNumber', v_label.display_number,
      'status', 'ASSIGNED', 'agency', v_agency, 'trackingCode', v_code,
      'version', v_replay.version_after, 'replayed', true
    );
  end if;

  if v_id <> '' then
    select * into v_label from public.qr_labels where qr_id = v_id for update;
  else
    select * into v_label from public.qr_labels
      where display_number = p_display_number for update;
  end if;
  if not found then raise exception 'QR_NOT_FOUND'; end if;
  v_id := v_label.qr_id;
  if v_label.status <> 'UNASSIGNED' then raise exception 'QR_NOT_UNASSIGNED'; end if;
  if v_label.version <> p_expected_version then raise exception 'QR_VERSION_CONFLICT'; end if;
  if exists (
    select 1 from public.qr_labels
    where agency = v_agency and tracking_code = v_code and status = 'ASSIGNED'
  ) then raise exception 'QR_PARCEL_ALREADY_ASSIGNED'; end if;

  insert into public.qr_audit_events(
    qr_id, action, old_agency, old_tracking_code, new_agency, new_tracking_code,
    old_status, new_status, reason, actor_id, actor_role, actor_agency,
    request_id, version_before, version_after
  ) values (
    v_id, 'INITIAL_ASSIGNMENT', null, null, v_agency, v_code,
    'UNASSIGNED', 'ASSIGNED', 'Initial assignment', p_actor_id,
    v_actor.actor_role, v_actor.actor_agency, p_request_id,
    v_label.version, v_label.version + 1
  );

  update public.qr_labels set
    status = 'ASSIGNED', agency = v_agency, tracking_code = v_code,
    assigned_at = clock_timestamp(), assigned_by = p_actor_id, version = version + 1
  where qr_id = v_id and version = p_expected_version and status = 'UNASSIGNED';
  if not found then raise exception 'QR_VERSION_CONFLICT'; end if;

  return jsonb_build_object(
    'qrId', v_id, 'displayNumber', v_label.display_number,
    'status', 'ASSIGNED', 'agency', v_agency, 'trackingCode', v_code,
    'version', v_label.version + 1, 'replayed', false
  );
end;
$$;

revoke all on function public.assign_qr_label_server(uuid, text, bigint, text, text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_qr_label_server(uuid, text, bigint, text, text, bigint, uuid)
  to service_role;

commit;
