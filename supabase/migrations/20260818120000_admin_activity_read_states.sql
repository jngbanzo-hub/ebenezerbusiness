begin;

create table if not exists public.admin_activity_read_states (
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  activity_id text not null check (char_length(activity_id) between 1 and 240),
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  is_active boolean not null default true,
  primary key (admin_user_id, activity_id)
);

comment on table public.admin_activity_read_states is
  'Per-admin read state only. Recent activity payloads remain in their canonical business sources.';

create index if not exists admin_activity_read_states_active_idx
  on public.admin_activity_read_states (admin_user_id, is_active, read_at);

alter table public.admin_activity_read_states enable row level security;
alter table public.admin_activity_read_states force row level security;

revoke all on public.admin_activity_read_states from public, anon, authenticated;
grant select, insert, update on public.admin_activity_read_states to service_role;

create or replace function public.sync_admin_activity_read_states_server(
  p_admin_user_id uuid,
  p_active_activity_ids text[]
)
returns table (activity_id text, read_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_admin_user_id is null then raise exception 'ADMIN_USER_REQUIRED'; end if;
  if exists (
    select 1 from unnest(coalesce(p_active_activity_ids, array[]::text[])) as candidate(value)
    where nullif(btrim(candidate.value), '') is null or char_length(candidate.value) > 240
  ) then raise exception 'INVALID_ACTIVITY_ID'; end if;

  update public.admin_activity_read_states state set is_active = false
  where state.admin_user_id = p_admin_user_id and state.is_active
    and not (state.activity_id = any(coalesce(p_active_activity_ids, array[]::text[])));

  insert into public.admin_activity_read_states as state (
    admin_user_id, activity_id, first_seen_at, last_seen_at, read_at, is_active
  )
  select p_admin_user_id, ids.activity_id, v_now, v_now, null, true
  from (select distinct btrim(value) as activity_id from unnest(coalesce(p_active_activity_ids, array[]::text[])) as candidate(value)) ids
  on conflict on constraint admin_activity_read_states_pkey do update
  set last_seen_at = excluded.last_seen_at, is_active = true;

  return query select state.activity_id, state.read_at
  from public.admin_activity_read_states state
  where state.admin_user_id = p_admin_user_id and state.is_active
    and state.activity_id = any(coalesce(p_active_activity_ids, array[]::text[]));
end;
$$;

create or replace function public.mark_admin_activities_read_server(
  p_admin_user_id uuid,
  p_activity_ids text[] default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_admin_user_id is null then raise exception 'ADMIN_USER_REQUIRED'; end if;
  update public.admin_activity_read_states state set read_at = clock_timestamp()
  where state.admin_user_id = p_admin_user_id and state.is_active and state.read_at is null
    and (p_activity_ids is null or state.activity_id = any(p_activity_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.sync_admin_activity_read_states_server(uuid, text[]) from public, anon, authenticated;
revoke all on function public.mark_admin_activities_read_server(uuid, text[]) from public, anon, authenticated;
grant execute on function public.sync_admin_activity_read_states_server(uuid, text[]) to service_role;
grant execute on function public.mark_admin_activities_read_server(uuid, text[]) to service_role;

commit;
