-- PREPARATORY ONLY. REVIEW, BACK UP, AND APPROVE SEPARATELY BEFORE APPLYING.
-- This file has not been executed against any Supabase project.
begin;

create table if not exists public.logistics_events (
  id text primary key,
  parcel_id text not null,
  tracking_code text not null,
  event_type text not null,
  version_before integer not null check (version_before >= 0),
  version_after integer not null check (version_after = version_before + 1),
  occurred_at timestamptz not null,
  source text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  agency_scope text[] not null,
  created_at timestamptz not null default now(),
  constraint logistics_events_parcel_version_unique
    unique (parcel_id, version_after),
  constraint logistics_events_agency_scope_not_empty
    check (cardinality(agency_scope) > 0),
  constraint logistics_events_agency_scope_canonical
    check (agency_scope <@ array['COO', 'FIH', 'LSHI', 'KLZ']::text[])
);

alter table public.logistics_events
  add column if not exists agency_scope text[];

-- Required only when upgrading a table previously created from 001:
-- backfill agency_scope in a reviewed server-side transaction before enforcing
-- NOT NULL and the two agency_scope constraints. Never derive it from browser input.
do $$
begin
  if exists (
    select 1
    from public.logistics_events
    where agency_scope is null
  ) then
    raise exception 'LOGISTICS_AGENCY_SCOPE_BACKFILL_REQUIRED';
  end if;
end;
$$;

alter table public.logistics_events
  alter column agency_scope set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'logistics_events_version_before_nonnegative'
      and conrelid = 'public.logistics_events'::regclass
  ) then
    alter table public.logistics_events
      add constraint logistics_events_version_before_nonnegative
      check (version_before >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'logistics_events_version_transition'
      and conrelid = 'public.logistics_events'::regclass
  ) then
    alter table public.logistics_events
      add constraint logistics_events_version_transition
      check (version_after = version_before + 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'logistics_events_payload_object'
      and conrelid = 'public.logistics_events'::regclass
  ) then
    alter table public.logistics_events
      add constraint logistics_events_payload_object
      check (jsonb_typeof(payload) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'logistics_events_agency_scope_not_empty'
      and conrelid = 'public.logistics_events'::regclass
  ) then
    alter table public.logistics_events
      add constraint logistics_events_agency_scope_not_empty
      check (cardinality(agency_scope) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'logistics_events_agency_scope_canonical'
      and conrelid = 'public.logistics_events'::regclass
  ) then
    alter table public.logistics_events
      add constraint logistics_events_agency_scope_canonical
      check (agency_scope <@ array['COO', 'FIH', 'LSHI', 'KLZ']::text[]);
  end if;
end;
$$;

create unique index if not exists logistics_events_event_id_uidx
  on public.logistics_events (id);

create unique index if not exists logistics_events_parcel_version_uidx
  on public.logistics_events (parcel_id, version_after);

create index if not exists logistics_events_tracking_code_idx
  on public.logistics_events (tracking_code);

create index if not exists logistics_events_parcel_id_idx
  on public.logistics_events (parcel_id);

create index if not exists logistics_events_occurred_at_idx
  on public.logistics_events (occurred_at, id);

create index if not exists logistics_events_agency_scope_idx
  on public.logistics_events using gin (agency_scope);

alter table public.logistics_events enable row level security;
alter table public.logistics_events force row level security;

revoke all on table public.logistics_events from public;
revoke all on table public.logistics_events from anon;
revoke all on table public.logistics_events from authenticated;
revoke update, delete on table public.logistics_events from service_role;

grant select on table public.logistics_events to authenticated;
grant select, insert on table public.logistics_events to service_role;

drop policy if exists logistics_events_agent_read on public.logistics_events;
create policy logistics_events_agent_read
  on public.logistics_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agents as agent_profile
      where agent_profile.id::text = auth.uid()::text
        and agent_profile.actif is true
        and upper(trim(agent_profile.role)) = 'AGENT'
        and (
          case upper(trim(agent_profile.agence))
            when 'COTONOU' then 'COO'
            else upper(trim(agent_profile.agence))
          end
        ) = any (logistics_events.agency_scope)
    )
  );

create or replace function public.reject_logistics_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'LOGISTICS_EVENT_IMMUTABLE';
end;
$$;

revoke all on function public.reject_logistics_event_mutation() from public;
revoke all on function public.reject_logistics_event_mutation() from anon;
revoke all on function public.reject_logistics_event_mutation() from authenticated;

drop trigger if exists logistics_events_reject_mutation
  on public.logistics_events;
create trigger logistics_events_reject_mutation
  before update or delete on public.logistics_events
  for each row execute function public.reject_logistics_event_mutation();

commit;
