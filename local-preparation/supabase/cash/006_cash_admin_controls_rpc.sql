-- Apply only after explicit migration approval. No command is activated by this file alone.
begin;

create or replace function public.execute_cash_admin_command(
  p_action text, p_agency text, p_business_date date, p_request_id text,
  p_admin_user_id uuid, p_admin_name text, p_reason text,
  p_amount numeric default null, p_direction text default null,
  p_target_event_id text default null, p_closure_id text default null,
  p_fingerprint text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_account public.cash_accounts%rowtype;
  v_existing public.cash_admin_audit%rowtype;
  v_target public.cash_events%rowtype;
  v_closed public.cash_daily_closures%rowtype;
  v_event_id text;
  v_audit_id text;
  v_old numeric;
  v_delta numeric;
  v_opening numeric;
  v_payments numeric;
  v_expenses numeric;
  v_corrections numeric;
  v_balance numeric;
  v_version integer;
begin
  if p_action not in ('ADJUSTMENT','CORRECTION','CLOSE','REOPEN') or p_agency not in ('FIH','LSHI','KLZ')
    or p_request_id is null or btrim(p_request_id) = '' or p_admin_user_id is null
    or p_admin_name is null or btrim(p_admin_name) = '' or p_reason is null or btrim(p_reason) = ''
    or p_fingerprint is null or btrim(p_fingerprint) = '' then raise exception 'INVALID_COMMAND'; end if;

  perform pg_advisory_xact_lock(hashtextextended('cash-admin:' || p_agency || ':' || p_business_date::text, 0));
  select * into v_existing from public.cash_admin_audit where request_id = p_request_id;
  if found then
    if v_existing.metadata->>'commandFingerprint' <> p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('state','SUCCESS','replayed',true,'action',p_action,'agency',p_agency,'businessDate',p_business_date,'resultId',v_existing.target_id);
  end if;

  select * into v_account from public.cash_accounts where agency = p_agency for update;
  if not found or v_account.status <> 'ACTIVE' then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  v_audit_id := 'cash-audit-' || encode(extensions.digest(p_admin_user_id::text || ':' || p_request_id, 'sha256'),'hex');

  if p_action = 'ADJUSTMENT' then
    if p_amount is null or p_amount <= 0 or p_direction not in ('CREDIT','DEBIT') then raise exception 'INVALID_COMMAND'; end if;
    v_event_id := 'cash-adjust-' || encode(extensions.digest(p_admin_user_id::text || ':' || p_request_id, 'sha256'),'hex');
    insert into public.cash_events values (v_event_id,v_account.id,p_agency,p_business_date,clock_timestamp(),'ADMIN_ADJUSTMENT_RECORDED',p_direction,p_amount,'USD','ADMIN',v_event_id,p_request_id,p_admin_user_id,p_admin_name,null,p_reason,v_account.version,v_account.version+1,jsonb_build_object('commandFingerprint',p_fingerprint),clock_timestamp());
    update public.cash_accounts set version = version + 1 where id = v_account.id;
    insert into public.cash_admin_audit values (v_audit_id,p_agency,'ADMIN_ADJUSTMENT_RECORDED','CASH_EVENT',v_event_id,null,jsonb_build_object('amount',p_amount,'direction',p_direction),p_reason,p_admin_user_id,p_admin_name,clock_timestamp(),p_request_id,jsonb_build_object('commandFingerprint',p_fingerprint),clock_timestamp());
  elsif p_action = 'CORRECTION' then
    select * into v_target from public.cash_events where event_id = p_target_event_id and agency = p_agency;
    if not found or p_amount is null or p_amount <= 0 then raise exception 'TARGET_NOT_FOUND'; end if;
    v_old := v_target.amount;
    v_delta := (case when v_target.direction='CREDIT' then 1 else -1 end) * (p_amount-v_old);
    if v_delta = 0 then raise exception 'INVALID_COMMAND'; end if;
    v_event_id := 'cash-correction-' || encode(extensions.digest(p_admin_user_id::text || ':' || p_request_id, 'sha256'),'hex');
    insert into public.cash_events values (v_event_id,v_account.id,p_agency,p_business_date,clock_timestamp(),'CASH_CORRECTION_RECORDED',case when v_delta>0 then 'CREDIT' else 'DEBIT' end,abs(v_delta),'USD','ADMIN_CORRECTION',p_target_event_id,p_request_id,p_admin_user_id,p_admin_name,p_target_event_id,p_reason,v_account.version,v_account.version+1,jsonb_build_object('commandFingerprint',p_fingerprint,'previousAmount',v_old,'newAmount',p_amount),clock_timestamp());
    update public.cash_accounts set version = version + 1 where id = v_account.id;
    insert into public.cash_admin_audit values (v_audit_id,p_agency,'CASH_CORRECTION_RECORDED','CASH_EVENT',v_event_id,jsonb_build_object('eventId',p_target_event_id,'amount',v_old),jsonb_build_object('eventId',v_event_id,'amount',p_amount,'difference',v_delta),p_reason,p_admin_user_id,p_admin_name,clock_timestamp(),p_request_id,jsonb_build_object('commandFingerprint',p_fingerprint),clock_timestamp());
  elsif p_action = 'CLOSE' then
    if exists(select 1 from public.cash_daily_closures where cash_account_id=v_account.id and business_date=p_business_date and status='CLOSED') then raise exception 'DAY_ALREADY_CLOSED'; end if;
    select coalesce((select closing_balance from public.cash_daily_closures where cash_account_id=v_account.id and business_date<p_business_date and status='CLOSED' order by business_date desc limit 1),(select amount from public.cash_events where cash_account_id=v_account.id and event_type='OPENING_BALANCE_RECORDED' limit 1),0) into v_opening;
    select coalesce(sum(amount) filter(where event_type='PAYMENT_CREDIT_RECORDED'),0),coalesce(sum(amount) filter(where event_type='EXPENSE_DEBIT_RECORDED'),0),coalesce(sum(case when event_type in ('ADMIN_ADJUSTMENT_RECORDED','CASH_CORRECTION_RECORDED') then case when direction='CREDIT' then amount else -amount end else 0 end),0) into v_payments,v_expenses,v_corrections from public.cash_events where cash_account_id=v_account.id and business_date=p_business_date;
    v_balance := v_opening+v_payments-v_expenses+v_corrections;
    if v_balance < 0 then raise exception 'NEGATIVE_CASH_BALANCE'; end if;
    v_version := coalesce((select max(version) from public.cash_daily_closures where cash_account_id=v_account.id and business_date=p_business_date),0)+1;
    v_event_id := coalesce(nullif(p_closure_id,''),'cash-close-' || encode(extensions.digest(p_admin_user_id::text || ':' || p_request_id,'sha256'),'hex'));
    insert into public.cash_daily_closures values(v_event_id,v_account.id,p_agency,p_business_date,v_opening,v_payments,v_expenses,v_corrections,v_balance,'CLOSED',v_version,null,p_admin_user_id,p_admin_name,clock_timestamp(),null,null,null,v_audit_id,clock_timestamp());
    insert into public.cash_admin_audit values(v_audit_id,p_agency,'CASH_DAY_CLOSED','DAILY_CLOSURE',v_event_id,null,jsonb_build_object('openingBalance',v_opening,'paymentsTotal',v_payments,'expensesTotal',v_expenses,'correctionsNet',v_corrections,'closingBalance',v_balance),p_reason,p_admin_user_id,p_admin_name,clock_timestamp(),p_request_id,jsonb_build_object('commandFingerprint',p_fingerprint),clock_timestamp());
  else
    select * into v_closed from public.cash_daily_closures where closure_id=p_closure_id and agency=p_agency and status='CLOSED';
    if not found then raise exception 'CLOSURE_NOT_FOUND'; end if;
    v_version := (select coalesce(max(version),0)+1 from public.cash_daily_closures where cash_account_id=v_account.id and business_date=v_closed.business_date);
    v_event_id := 'cash-reopen-' || encode(extensions.digest(p_admin_user_id::text || ':' || p_request_id,'sha256'),'hex');
    insert into public.cash_daily_closures values(v_event_id,v_account.id,p_agency,v_closed.business_date,v_closed.opening_balance,v_closed.payments_total,v_closed.expenses_total,v_closed.corrections_net,v_closed.closing_balance,'REOPENED',v_version,v_closed.closure_id,p_admin_user_id,p_admin_name,v_closed.closed_at,clock_timestamp(),p_admin_user_id,p_reason,v_audit_id,clock_timestamp());
    insert into public.cash_admin_audit values(v_audit_id,p_agency,'CASH_DAY_REOPENED','DAILY_CLOSURE',v_event_id,jsonb_build_object('closureId',v_closed.closure_id,'status','CLOSED'),jsonb_build_object('closureId',v_event_id,'status','REOPENED','version',v_version),p_reason,p_admin_user_id,p_admin_name,clock_timestamp(),p_request_id,jsonb_build_object('commandFingerprint',p_fingerprint),clock_timestamp());
  end if;
  return jsonb_build_object('state','SUCCESS','replayed',false,'action',p_action,'agency',p_agency,'businessDate',p_business_date,'resultId',v_event_id);
end;
$$;
revoke all on function public.execute_cash_admin_command(text,text,date,text,uuid,text,text,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function public.execute_cash_admin_command(text,text,date,text,uuid,text,text,numeric,text,text,text,text) to service_role;
commit;
