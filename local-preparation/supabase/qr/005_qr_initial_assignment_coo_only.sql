-- Initial QR association is an origin operation: active COO Agents only.
-- Admin correction/revocation commands remain separate and unchanged.
begin;

create or replace function public.enforce_qr_initial_assignment_coo()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_agency text;
begin
  if old.status = 'UNASSIGNED' and new.status = 'ASSIGNED' then
    select upper(btrim(a.role)),
      case upper(btrim(a.agence)) when 'COTONOU' then 'COO' else upper(btrim(a.agence)) end
    into v_role, v_agency
    from public.agents a
    where a.id = new.assigned_by and a.actif is true;

    if not found then raise exception 'QR_ACCESS_DENIED'; end if;
    if v_role = 'AGENT' and v_agency <> 'COO' then
      raise exception 'QR_AGENCY_ACCESS_DENIED';
    end if;
    if v_role not in ('AGENT', 'ADMIN') then raise exception 'QR_ACCESS_DENIED'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists qr_labels_enforce_initial_assignment_coo on public.qr_labels;
create trigger qr_labels_enforce_initial_assignment_coo
  before update on public.qr_labels
  for each row execute function public.enforce_qr_initial_assignment_coo();

revoke all on function public.enforce_qr_initial_assignment_coo()
  from public, anon, authenticated, service_role;

commit;
