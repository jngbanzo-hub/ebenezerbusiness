-- PREPARATORY ONLY: do not apply without a separately approved migration phase.
create table if not exists public.logistics_events (
  id text primary key,
  parcel_id text not null,
  tracking_code text not null,
  event_type text not null,
  version_before integer not null check (version_before >= 0),
  version_after integer not null check (version_after = version_before + 1),
  occurred_at timestamptz not null,
  source text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint logistics_events_parcel_version_unique
    unique (parcel_id, version_after)
);

create index if not exists logistics_events_tracking_code_idx
  on public.logistics_events (tracking_code);

create index if not exists logistics_events_parcel_id_idx
  on public.logistics_events (parcel_id);

create index if not exists logistics_events_occurred_at_idx
  on public.logistics_events (occurred_at, id);
