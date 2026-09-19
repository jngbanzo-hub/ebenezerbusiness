-- PREPARATORY ONLY. APPLY ONLY AFTER 001 AND A SEPARATE SECURITY REVIEW.
begin;

alter table public.cash_accounts enable row level security;
alter table public.cash_accounts force row level security;
alter table public.cash_events enable row level security;
alter table public.cash_events force row level security;
alter table public.cash_daily_closures enable row level security;
alter table public.cash_daily_closures force row level security;
alter table public.cash_admin_audit enable row level security;
alter table public.cash_admin_audit force row level security;

revoke all on table public.cash_accounts, public.cash_events, public.cash_daily_closures, public.cash_admin_audit from public, anon, authenticated;
grant select on table public.cash_accounts, public.cash_events, public.cash_daily_closures, public.cash_admin_audit to authenticated;
grant select, insert on table public.cash_events, public.cash_daily_closures, public.cash_admin_audit to service_role;
grant select, insert, update on table public.cash_accounts to service_role;

create policy cash_accounts_read on public.cash_accounts for select to authenticated
using (exists (
  select 1 from public.agents p where p.id = auth.uid() and p.actif is true and (
    upper(trim(p.role)) = 'ADMIN'
    or (upper(trim(p.role)) = 'AGENT' and
      case upper(trim(p.agence)) when 'COTONOU' then 'COO' else upper(trim(p.agence)) end = cash_accounts.agency)
  )
));

create policy cash_events_read on public.cash_events for select to authenticated
using (exists (
  select 1 from public.agents p where p.id = auth.uid() and p.actif is true and (
    upper(trim(p.role)) = 'ADMIN'
    or (upper(trim(p.role)) = 'AGENT' and
      case upper(trim(p.agence)) when 'COTONOU' then 'COO' else upper(trim(p.agence)) end = cash_events.agency)
  )
));

create policy cash_closures_read on public.cash_daily_closures for select to authenticated
using (exists (
  select 1 from public.agents p where p.id = auth.uid() and p.actif is true and (
    upper(trim(p.role)) = 'ADMIN'
    or (upper(trim(p.role)) = 'AGENT' and
      case upper(trim(p.agence)) when 'COTONOU' then 'COO' else upper(trim(p.agence)) end = cash_daily_closures.agency)
  )
));

create policy cash_audit_admin_read on public.cash_admin_audit for select to authenticated
using (exists (
  select 1 from public.agents p
  where p.id = auth.uid() and p.actif is true and upper(trim(p.role)) = 'ADMIN'
));

create view public.cash_current_balances with (security_invoker = true) as
select a.agency,
  coalesce(sum(case when e.direction = 'CREDIT' then e.amount else -e.amount end), 0)::numeric(18,2) as current_balance,
  a.currency,
  max(e.occurred_at) as updated_at
from public.cash_accounts a left join public.cash_events e on e.cash_account_id = a.id
group by a.id, a.agency, a.currency;

create view public.cash_current_day with (security_invoker = true) as
select e.agency, e.business_date,
  coalesce(sum(e.amount) filter (where e.event_type = 'PAYMENT_CREDIT_RECORDED'), 0)::numeric(18,2) as payments_total,
  coalesce(sum(e.amount) filter (where e.event_type = 'EXPENSE_DEBIT_RECORDED'), 0)::numeric(18,2) as expenses_total,
  coalesce(sum(case when e.event_type in ('ADMIN_ADJUSTMENT_RECORDED', 'CASH_CORRECTION_RECORDED') then case when e.direction = 'CREDIT' then e.amount else -e.amount end else 0 end), 0)::numeric(18,2) as corrections_net
from public.cash_events e
group by e.agency, e.business_date;

-- This view intentionally contains every business_date. The server must compute
-- the requested date in Africa/Porto-Novo and apply an explicit business_date
-- predicate. Database clock and session timezone never select the cash day.

create view public.cash_daily_history with (security_invoker = true) as
select agency, business_date, opening_balance, payments_total, expenses_total,
  corrections_net, closing_balance, status, version, closed_at, reopened_at
from public.cash_daily_closures;

create view public.cash_agent_payment_details with (security_invoker = true) as
select agency, business_date, actor_user_id, actor_name_snapshot,
  count(*)::bigint as payment_count, sum(amount)::numeric(18,2) as amount_collected
from public.cash_events where event_type = 'PAYMENT_CREDIT_RECORDED'
group by agency, business_date, actor_user_id, actor_name_snapshot;

create view public.cash_agency_totals with (security_invoker = true) as
select agency, business_date, count(*) filter (where event_type = 'PAYMENT_CREDIT_RECORDED')::bigint as payment_count,
  coalesce(sum(amount) filter (where event_type = 'PAYMENT_CREDIT_RECORDED'), 0)::numeric(18,2) as payments_total,
  coalesce(sum(amount) filter (where event_type = 'EXPENSE_DEBIT_RECORDED'), 0)::numeric(18,2) as expenses_total
from public.cash_events group by agency, business_date;

create view public.cash_anomalies with (security_invoker = true) as
select c.agency, c.business_date, c.closure_id, 'CLOSURE_TOTAL_MISMATCH'::text as anomaly_type
from public.cash_daily_closures c
left join public.cash_agency_totals t on t.agency = c.agency and t.business_date = c.business_date
where c.status = 'CLOSED' and (
  c.payments_total <> coalesce(t.payments_total, 0)
  or c.expenses_total <> coalesce(t.expenses_total, 0)
);

-- Deliberately empty contract view. A future payment projection may replace it.
-- It must never read cash tables or create a COO cash account.
create view public.cash_coo_revenue_outside_cash with (security_invoker = true) as
select null::date as business_date, null::uuid as actor_user_id,
  null::text as actor_name_snapshot, 0::bigint as payment_count,
  0::numeric(18,2) as amount_collected
where false;

revoke all on table public.cash_current_balances, public.cash_current_day,
  public.cash_daily_history, public.cash_agent_payment_details,
  public.cash_agency_totals, public.cash_anomalies,
  public.cash_coo_revenue_outside_cash from public, anon;
grant select on table public.cash_current_balances, public.cash_current_day,
  public.cash_daily_history, public.cash_agent_payment_details,
  public.cash_agency_totals, public.cash_anomalies,
  public.cash_coo_revenue_outside_cash to authenticated, service_role;

revoke all on function public.reject_cash_immutable_mutation() from public, anon, authenticated;

commit;
