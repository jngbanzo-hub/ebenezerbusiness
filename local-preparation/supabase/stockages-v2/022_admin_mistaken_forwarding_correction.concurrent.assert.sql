-- Isolated test only, after two simultaneous calls with distinct request IDs.
do $$
declare c public.fixture_case%rowtype;
begin
  select * into c from public.fixture_case;
  if (select count(*) from public.stockage_events where event_type='CORRECTION_COMPENSATOIRE_ADMIN')<>2
    or (select count(*) from public.stockage_forwarding_events where event_type='FORWARDING_CANCELLED_BY_COMPENSATION')<>1
    or (select count(*) from public.stockage_admin_audit)<>1
    or (select count(*) from public.stockage_accounts where agency='KLZ' and current_parcel_count=1 and current_weight_kg=3)<>1
    or (select count(*) from public.stockage_accounts where agency='LSHI' and current_parcel_count=0 and current_weight_kg=0)<>1
    or (select count(*) from public.stockage_parcels where parcel_id=c.parcel_id and agency='KLZ' and forwarding_id is null)<>1 then
    raise exception 'CONCURRENT_DOUBLE_MOVEMENT_OR_PARTIAL_STATE';
  end if;
end $$;
drop trigger fixture_pause_late on public.stockage_forwarding_events;
drop function public.fixture_pause_late();
