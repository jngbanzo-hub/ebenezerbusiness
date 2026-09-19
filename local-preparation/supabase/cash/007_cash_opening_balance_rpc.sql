-- PREPARATORY ONLY. Apply only after explicit approval.
-- Atomically records the opening balance, activates one cash account and writes immutable Admin audit.
begin;

create or replace function public.open_cash_account(
  p_agency text,
  p_amount numeric,
  p_business_date date,
  p_observation text,
  p_request_id text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_admin public.agents%rowtype;
  v_account public.cash_accounts%rowtype;
  v_existing_audit public.cash_admin_audit%rowtype;
  v_agency text := upper(btrim(p_agency));
  v_observation text := nullif(btrim(coalesce(p_observation, '')), '');
  v_reason text := coalesce(v_observation, 'Ouverture initiale validée par Admin');
  v_fingerprint text;
  v_event_id text;
  v_audit_id text;
  v_opened_at timestamptz := clock_timestamp();
begin
  select * into v_admin from public.agents where id = p_actor_id;
  if not found or v_admin.actif is not true or upper(btrim(v_admin.role)) <> 'ADMIN' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if v_agency not in ('FIH', 'LSHI', 'KLZ')
     or p_amount is null or p_amount <= 0
     or round(p_amount, 2) <> p_amount
     or p_business_date is null
     or p_request_id is null or btrim(p_request_id) = '' then
    raise exception 'INVALID_OPENING_BALANCE';
  end if;

  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'action', 'OPEN_CASH_ACCOUNT',
    'agency', v_agency,
    'amount', p_amount,
    'businessDate', p_business_date,
    'observation', coalesce(v_observation, ''),
    'actorId', p_actor_id
  )::text, 'sha256'), 'hex');

  select * into v_existing_audit
  from public.cash_admin_audit
  where request_id = p_request_id;
  if found then
    if v_existing_audit.action <> 'OPEN_CASH_ACCOUNT'
       or v_existing_audit.metadata->>'commandFingerprint' <> v_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'state', 'SUCCESS',
      'replayed', true,
      'eventId', v_existing_audit.target_id,
      'agency', v_existing_audit.agency,
      'amount', (v_existing_audit.new_value->>'amount')::numeric,
      'currency', 'USD',
      'businessDate', v_existing_audit.metadata->>'businessDate',
      'accountStatus', v_existing_audit.new_value->>'status'
    );
  end if;

  select * into v_account
  from public.cash_accounts
  where agency = v_agency
  for update;
  if not found then raise exception 'ACCOUNT_NOT_READY'; end if;
  if v_account.currency <> 'USD' then raise exception 'ACCOUNT_NOT_READY'; end if;
  if v_account.status <> 'SUSPENDED' then raise exception 'SECOND_OPENING_NOT_ALLOWED'; end if;
  if exists (
    select 1 from public.cash_events
    where cash_account_id = v_account.id and event_type = 'OPENING_BALANCE_RECORDED'
  ) then
    raise exception 'SECOND_OPENING_NOT_ALLOWED';
  end if;

  v_event_id := 'cash-opening-' || encode(
    extensions.digest(v_agency || ':' || lower(btrim(p_request_id)), 'sha256'), 'hex'
  );
  v_audit_id := 'cash-audit-opening-' || encode(
    extensions.digest(v_agency || ':' || lower(btrim(p_request_id)), 'sha256'), 'hex'
  );

  insert into public.cash_events(
    event_id, cash_account_id, agency, business_date, occurred_at, event_type,
    direction, amount, currency, source_type, source_id, source_request_id,
    actor_user_id, actor_name_snapshot, corrected_event_id, reason,
    version_before, version_after, metadata
  ) values (
    v_event_id, v_account.id, v_agency, p_business_date, v_opened_at,
    'OPENING_BALANCE_RECORDED', 'CREDIT', p_amount, 'USD',
    'ADMIN_OPENING_BALANCE', 'opening-balance:' || v_account.id, p_request_id,
    p_actor_id, btrim(v_admin.nom), null, null,
    v_account.version, v_account.version + 1,
    jsonb_build_object(
      'commandFingerprint', v_fingerprint,
      'observation', v_observation,
      'auditId', v_audit_id
    )
  );

  update public.cash_accounts
  set status = 'ACTIVE', version = v_account.version + 1
  where id = v_account.id and status = 'SUSPENDED' and version = v_account.version;
  if not found then raise exception 'ACCOUNT_VERSION_CONFLICT'; end if;

  insert into public.cash_admin_audit(
    audit_id, agency, action, target_type, target_id, previous_value, new_value,
    reason, admin_user_id, admin_name_snapshot, occurred_at, request_id, metadata
  ) values (
    v_audit_id, v_agency, 'OPEN_CASH_ACCOUNT', 'CASH_EVENT', v_event_id,
    jsonb_build_object('status', 'SUSPENDED', 'amount', null, 'currency', 'USD'),
    jsonb_build_object('status', 'ACTIVE', 'amount', p_amount, 'currency', 'USD'),
    v_reason, p_actor_id, btrim(v_admin.nom), v_opened_at, p_request_id,
    jsonb_build_object(
      'commandFingerprint', v_fingerprint,
      'eventId', v_event_id,
      'businessDate', p_business_date,
      'result', 'SUCCESS',
      'observation', v_observation
    )
  );

  return jsonb_build_object(
    'state', 'SUCCESS',
    'replayed', false,
    'eventId', v_event_id,
    'agency', v_agency,
    'amount', p_amount,
    'currency', 'USD',
    'businessDate', p_business_date,
    'accountStatus', 'ACTIVE'
  );
end;
$$;

revoke all on function public.open_cash_account(text,numeric,date,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.open_cash_account(text,numeric,date,text,text,uuid)
  to service_role;

commit;
