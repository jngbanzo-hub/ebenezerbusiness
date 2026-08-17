begin;

create or replace function public.sync_admin_alert_read_states_server(
  p_admin_user_id uuid,
  p_active_alert_ids text[]
)
returns table (
  alert_id text,
  occurrence integer,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_admin_user_id is null then
    raise exception 'ADMIN_USER_REQUIRED';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_active_alert_ids, array[]::text[])) as candidate(value)
    where nullif(btrim(candidate.value), '') is null
       or char_length(candidate.value) > 240
  ) then
    raise exception 'INVALID_ALERT_ID';
  end if;

  update public.admin_alert_read_states state
  set is_active = false
  where state.admin_user_id = p_admin_user_id
    and state.is_active
    and not (state.alert_id = any(coalesce(p_active_alert_ids, array[]::text[])));

  insert into public.admin_alert_read_states as state (
    admin_user_id, alert_id, occurrence, first_seen_at, last_seen_at, read_at, is_active
  )
  select p_admin_user_id, ids.alert_id, 1, v_now, v_now, null, true
  from (
    select distinct btrim(value) as alert_id
    from unnest(coalesce(p_active_alert_ids, array[]::text[])) as candidate(value)
  ) ids
  on conflict on constraint admin_alert_read_states_pkey do update
  set occurrence = case when state.is_active then state.occurrence else state.occurrence + 1 end,
      first_seen_at = case when state.is_active then state.first_seen_at else excluded.first_seen_at end,
      last_seen_at = excluded.last_seen_at,
      read_at = case when state.is_active then state.read_at else null end,
      is_active = true;

  return query
  select state.alert_id, state.occurrence, state.read_at
  from public.admin_alert_read_states state
  where state.admin_user_id = p_admin_user_id
    and state.is_active
    and state.alert_id = any(coalesce(p_active_alert_ids, array[]::text[]));
end;
$$;

revoke all on function public.sync_admin_alert_read_states_server(uuid, text[]) from public, anon, authenticated;
grant execute on function public.sync_admin_alert_read_states_server(uuid, text[]) to service_role;

commit;
