-- Phase 4D: minimal, read-only server resolver for permanent public QR URLs.
begin;

create or replace function public.resolve_qr_public(p_qr_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_label public.qr_labels%rowtype;
begin
  if p_qr_id is null or p_qr_id !~ '^EEBQR[0-9]{6,}$' then
    return jsonb_build_object('status', 'UNKNOWN');
  end if;

  select * into v_label from public.qr_labels where qr_id = p_qr_id;
  if not found then return jsonb_build_object('status', 'UNKNOWN'); end if;

  if v_label.status = 'ASSIGNED' then
    return jsonb_build_object(
      'qrId', v_label.qr_id,
      'status', v_label.status,
      'agency', v_label.agency,
      'trackingCode', v_label.tracking_code
    );
  end if;

  return jsonb_build_object('qrId', v_label.qr_id, 'status', v_label.status);
end;
$$;

revoke all on function public.resolve_qr_public(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_qr_public(text) to service_role;

commit;
