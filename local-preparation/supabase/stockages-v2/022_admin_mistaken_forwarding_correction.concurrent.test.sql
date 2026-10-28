-- Isolated test only. Run the setup, launch the same RPC twice concurrently,
-- then run the assertions. No production database access.
select public.seed_fixture('KLZ','LSHI','CONCURRENT126',3,33,39);

create function public.fixture_pause_late() returns trigger language plpgsql as $$
begin
  perform pg_sleep(2);
  return new;
end $$;
create trigger fixture_pause_late before insert on public.stockage_forwarding_events
  for each row execute function public.fixture_pause_late();
