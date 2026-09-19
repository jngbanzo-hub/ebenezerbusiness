-- Phase 5A.1: authenticated read-only QR prevalidation.
begin;

create or replace function public.resolve_qr_display_number(p_display_number bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor record;
  v_label public.qr_labels%rowtype;
begin
  select * into v_actor from public.qr_current_actor();
  if not found then raise exception 'QR_ACCESS_DENIED'; end if;
  if p_display_number is null or p_display_number <= 0 then
    raise exception 'INVALID_QR_DISPLAY_NUMBER';
  end if;
  select * into v_label from public.qr_labels where display_number = p_display_number;
  if not found then return jsonb_build_object('status', 'UNKNOWN'); end if;
  if v_label.status <> 'ASSIGNED' then
    return jsonb_build_object(
      'qrId', v_label.qr_id, 'displayNumber', v_label.display_number,
      'status', v_label.status, 'version', v_label.version
    );
  end if;
  return jsonb_build_object(
    'qrId', v_label.qr_id, 'displayNumber', v_label.display_number,
    'status', v_label.status, 'agency', v_label.agency,
    'trackingCode', v_label.tracking_code, 'version', v_label.version
  );
end;
$$;

revoke all on function public.resolve_qr_display_number(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_qr_display_number(bigint) to authenticated;

commit;
