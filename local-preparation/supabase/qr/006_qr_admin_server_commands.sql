begin;

create or replace function public.correct_qr_assignment_server(
  p_actor_id uuid, p_qr_id text, p_new_agency text, p_new_tracking_code text,
  p_reason text, p_expected_version bigint, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.agents where id=p_actor_id and actif is true and upper(btrim(role))='ADMIN') then raise exception 'QR_ADMIN_REQUIRED'; end if;
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  return public.correct_qr_assignment(p_qr_id,p_new_agency,p_new_tracking_code,'BUSINESS',p_reason,p_expected_version,p_request_id);
end; $$;

create or replace function public.revoke_qr_label_server(
  p_actor_id uuid, p_qr_id text, p_reason text, p_expected_version bigint, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.agents where id=p_actor_id and actif is true and upper(btrim(role))='ADMIN') then raise exception 'QR_ADMIN_REQUIRED'; end if;
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  return public.revoke_qr_label(p_qr_id,p_reason,p_expected_version,p_request_id);
end; $$;

revoke all on function public.correct_qr_assignment_server(uuid,text,text,text,text,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function public.revoke_qr_label_server(uuid,text,text,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.correct_qr_assignment_server(uuid,text,text,text,text,bigint,uuid) to service_role;
grant execute on function public.revoke_qr_label_server(uuid,text,text,bigint,uuid) to service_role;
revoke execute on function public.revoke_qr_label(text,text,bigint,uuid) from authenticated;

commit;
