-- PREPARATORY ROLLBACK ONLY. NEVER RUN AUTOMATICALLY.
-- Take and verify a database backup before any rollback.
begin;

revoke all on table public.logistics_events from anon;
revoke all on table public.logistics_events from authenticated;
revoke insert on table public.logistics_events from service_role;

drop policy if exists logistics_events_agent_read
  on public.logistics_events;

drop trigger if exists logistics_events_reject_mutation
  on public.logistics_events;

drop function if exists public.reject_logistics_event_mutation();

drop index if exists public.logistics_events_agency_scope_idx;

alter table public.logistics_events disable row level security;

commit;

-- LAST RESORT ONLY, after an independently verified backup and explicit approval:
-- drop table if exists public.logistics_events;
