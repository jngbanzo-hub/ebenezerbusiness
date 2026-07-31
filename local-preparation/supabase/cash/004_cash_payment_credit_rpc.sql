-- PREPARATORY ONLY. DO NOT APPLY OR DEPLOY DURING PHASE CAISSE 9.
begin;

create or replace function public.record_cash_payment_credit(
  p_payment_request_id text,
  p_payment_reference text,
  p_agency text,
  p_amount numeric,
  p_business_date date,
  p_occurred_at timestamptz,
  p_actor_user_id uuid,
  p_actor_name text,
  p_command_fingerprint text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account public.cash_accounts%rowtype;
  v_existing public.cash_events%rowtype;
  v_event_id text;
  v_source_id text;
  v_metadata jsonb;
begin
  if p_agency not in ('FIH', 'LSHI', 'KLZ') then
    raise exception 'INVALID_CASH_AGENCY';
  end if;
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) <> p_amount then
    raise exception 'INVALID_PAYMENT_AMOUNT';
  end if;
  if p_payment_request_id is null or btrim(p_payment_request_id) = '' or
     p_payment_reference is null or btrim(p_payment_reference) = '' or
     p_actor_name is null or btrim(p_actor_name) = '' or
     p_command_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_PAYMENT_CREDIT';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_PAYMENT_METADATA';
  end if;

  select * into v_existing
  from public.cash_events
  where source_type = 'PAYMENT_ENGINE'
    and source_request_id = lower(btrim(p_payment_request_id));

  if found then
    if v_existing.metadata ->> 'commandFingerprint' <> p_command_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'eventId', v_existing.event_id,
      'replayed', true,
      'version', v_existing.version_after
    );
  end if;

  select * into v_account
  from public.cash_accounts
  where agency = p_agency
  for update;
  if not found or v_account.status <> 'ACTIVE' or v_account.currency <> 'USD' then
    raise exception 'CASH_ACCOUNT_NOT_ACTIVE';
  end if;

  v_source_id := 'parcel:' || p_agency || ':' || upper(btrim(p_payment_reference));
  if exists (
    select 1 from public.cash_events
    where source_type = 'PAYMENT_ENGINE' and source_id = v_source_id
  ) then
    raise exception 'PAYMENT_ALREADY_CREDITED';
  end if;

  v_event_id := 'cash-payment-' || encode(
    extensions.digest(p_agency || ':' || lower(btrim(p_payment_request_id)), 'sha256'),
    'hex'
  );
  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'commandFingerprint', p_command_fingerprint,
    'paymentReference', upper(btrim(p_payment_reference))
  );

  insert into public.cash_events (
    event_id, cash_account_id, agency, business_date, occurred_at,
    event_type, direction, amount, currency, source_type, source_id,
    source_request_id, actor_user_id, actor_name_snapshot, corrected_event_id,
    reason, version_before, version_after, metadata
  ) values (
    v_event_id, v_account.id, p_agency, p_business_date, p_occurred_at,
    'PAYMENT_CREDIT_RECORDED', 'CREDIT', p_amount, 'USD', 'PAYMENT_ENGINE',
    v_source_id, lower(btrim(p_payment_request_id)), p_actor_user_id,
    btrim(p_actor_name), null, null, v_account.version, v_account.version + 1,
    v_metadata
  );

  update public.cash_accounts
  set version = version + 1
  where id = v_account.id and version = v_account.version;
  if not found then raise exception 'CASH_VERSION_CONFLICT'; end if;

  return jsonb_build_object(
    'eventId', v_event_id,
    'replayed', false,
    'version', v_account.version + 1
  );
end;
$$;

revoke all on function public.record_cash_payment_credit(
  text, text, text, numeric, date, timestamptz, uuid, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_cash_payment_credit(
  text, text, text, numeric, date, timestamptz, uuid, text, text, jsonb
) to service_role;

commit;
