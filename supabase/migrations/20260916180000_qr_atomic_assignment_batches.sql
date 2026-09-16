-- Prepared locally only. QR association journal; no payment/cash/storage mutation.
begin;

create table public.qr_assignment_batches (
  batch_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  commands jsonb not null check (jsonb_typeof(commands) = 'array' and jsonb_array_length(commands) between 1 and 250),
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
alter table public.qr_assignment_batches enable row level security;
alter table public.qr_assignment_batches force row level security;
revoke all on public.qr_assignment_batches from public, anon, authenticated, service_role;

create function public.read_qr_assignment_batch_server(p_actor_id uuid, p_batch_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.agents where id = p_actor_id and actif is true
    and (upper(btrim(role)) = 'ADMIN' or (upper(btrim(role)) = 'AGENT' and upper(btrim(agence)) in ('COO', 'COTONOU'))))
  then raise exception 'QR_ACCESS_DENIED'; end if;
  return (select jsonb_build_object('commands', commands, 'result', result)
    from public.qr_assignment_batches where batch_id = p_batch_id and actor_id = p_actor_id);
end;
$$;

create function public.assign_qr_batch_server(p_actor_id uuid, p_batch_id uuid, p_lines jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
set lock_timeout = '2s'
as $$
declare
  v_commands jsonb;
  v_existing public.qr_assignment_batches%rowtype;
  v_line jsonb;
  v_label public.qr_labels%rowtype;
  v_receipt jsonb;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_code text;
  v_started timestamptz := clock_timestamp();
  v_failed_line bigint;
begin
  if not exists (select 1 from public.agents where id = p_actor_id and actif is true
    and (upper(btrim(role)) = 'ADMIN' or (upper(btrim(role)) = 'AGENT' and upper(btrim(agence)) in ('COO', 'COTONOU'))))
  then raise exception 'QR_ACCESS_DENIED'; end if;
  if p_batch_id is null or jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'INVALID_QR_BATCH'; end if;
  if jsonb_array_length(p_lines) not between 1 and 250 then raise exception 'INVALID_QR_BATCH'; end if;

  -- Validate every command before creating even the journal row.
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object' or not (v_line ?& array['lineNumber','displayNumber','agency','trackingCode','expectedVersion','requestId'])
      or (select count(*) from jsonb_object_keys(v_line)) <> 6
      or jsonb_typeof(v_line->'lineNumber') <> 'number' or (v_line->>'lineNumber') !~ '^[1-9][0-9]{0,14}$'
      or jsonb_typeof(v_line->'displayNumber') <> 'number' or (v_line->>'displayNumber') !~ '^[1-9][0-9]{0,14}$'
      or jsonb_typeof(v_line->'expectedVersion') <> 'number' or (v_line->>'expectedVersion') !~ '^[1-9][0-9]{0,14}$'
      or jsonb_typeof(v_line->'agency') <> 'string' or v_line->>'agency' not in ('FIH','LSHI','KLZ')
      or jsonb_typeof(v_line->'trackingCode') <> 'string' or (v_line->>'trackingCode') !~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
      or jsonb_typeof(v_line->'requestId') <> 'string' or (v_line->>'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then raise exception 'INVALID_QR_BATCH'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_lines) l group by l->>'lineNumber' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(p_lines) l group by l->>'displayNumber' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(p_lines) l group by (l->>'requestId')::uuid having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(p_lines) l group by l->>'agency', l->>'trackingCode' having count(*) > 1)
  then raise exception 'DUPLICATE_IN_LIST'; end if;
  select jsonb_agg(value order by (value->>'lineNumber')::bigint) into v_commands from jsonb_array_elements(p_lines);

  -- Shared across every application instance. Contention fails boundedly, never executes twice.
  if not pg_try_advisory_xact_lock(hashtextextended('qr-batch:' || p_batch_id::text, 0)) then
    return jsonb_build_object('batchId', p_batch_id, 'status', 'IN_PROGRESS', 'lines', '[]'::jsonb);
  end if;
  select * into v_existing from public.qr_assignment_batches where batch_id = p_batch_id;
  if found then
    if v_existing.actor_id <> p_actor_id or v_existing.commands <> v_commands then raise exception 'QR_IDEMPOTENCY_CONFLICT'; end if;
    return v_existing.result;
  end if;
  insert into public.qr_assignment_batches(batch_id, actor_id, commands) values (p_batch_id, p_actor_id, v_commands);

  -- Exception block is a subtransaction: every QR/audit mutation rolls back together.
  begin
    -- Lock all labels in deterministic order, including across overlapping batches.
    perform q.qr_id from public.qr_labels q
      where q.display_number in (select (value->>'displayNumber')::bigint from jsonb_array_elements(v_commands))
      order by q.display_number for update;
    for v_line in select value from jsonb_array_elements(v_commands) loop
      v_failed_line := (v_line->>'lineNumber')::bigint;
      select * into v_label from public.qr_labels where display_number = (v_line->>'displayNumber')::bigint;
      if not found then raise exception 'QR_NOT_FOUND'; end if;
      if v_label.status <> 'UNASSIGNED' then raise exception 'QR_NOT_UNASSIGNED'; end if;
      if v_label.version <> (v_line->>'expectedVersion')::bigint then raise exception 'QR_VERSION_CONFLICT'; end if;
      if exists (select 1 from public.qr_labels where agency = v_line->>'agency' and tracking_code = v_line->>'trackingCode' and status = 'ASSIGNED')
        then raise exception 'QR_PARCEL_ALREADY_ASSIGNED'; end if;
      if exists (select 1 from public.qr_audit_events where request_id = (v_line->>'requestId')::uuid)
        then raise exception 'QR_IDEMPOTENCY_CONFLICT'; end if;
    end loop;
    for v_line in select value from jsonb_array_elements(v_commands) loop
      v_failed_line := (v_line->>'lineNumber')::bigint;
      if clock_timestamp() - v_started > interval '8 seconds' then raise exception 'QR_BATCH_DEADLINE'; end if;
      -- Reuse all existing uniqueness, actor, version and audit rules, without network N+1.
      v_receipt := public.assign_qr_label_server(p_actor_id, null, (v_line->>'displayNumber')::bigint,
        v_line->>'agency', v_line->>'trackingCode', (v_line->>'expectedVersion')::bigint, (v_line->>'requestId')::uuid);
      v_results := v_results || jsonb_build_array(v_line || jsonb_build_object('qrId', v_receipt->>'qrId',
        'state', 'ASSOCIATED', 'application', 'APPLIED', 'retrySafe', false, 'replayed', false));
    end loop;
    if clock_timestamp() - v_started > interval '8 seconds' then raise exception 'QR_BATCH_DEADLINE'; end if;
    v_result := jsonb_build_object('batchId', p_batch_id, 'status', 'COMPLETED', 'lines', v_results);
  exception when others then
    v_code := case when sqlerrm in ('QR_NOT_FOUND','QR_NOT_UNASSIGNED','QR_VERSION_CONFLICT',
      'QR_PARCEL_ALREADY_ASSIGNED','QR_IDEMPOTENCY_CONFLICT','QR_BATCH_DEADLINE','QR_ACCESS_DENIED','QR_AGENCY_ACCESS_DENIED')
      then sqlerrm when sqlstate = '55P03' then 'QR_BATCH_BUSY' else 'QR_BATCH_ROLLED_BACK' end;
    select jsonb_agg(value || jsonb_build_object('state','ERROR','application','NOT_APPLIED','retrySafe',true,
      'code', case when (value->>'lineNumber')::bigint = v_failed_line then v_code else 'BATCH_ROLLED_BACK' end))
      into v_results from jsonb_array_elements(v_commands);
    v_result := jsonb_build_object('batchId', p_batch_id, 'status', 'REJECTED', 'lines', v_results);
  end;
  update public.qr_assignment_batches set result = v_result, completed_at = clock_timestamp() where batch_id = p_batch_id;
  return v_result;
end;
$$;

revoke all on function public.assign_qr_batch_server(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.read_qr_assignment_batch_server(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.assign_qr_batch_server(uuid, uuid, jsonb) to service_role;
grant execute on function public.read_qr_assignment_batch_server(uuid, uuid) to service_role;
commit;
