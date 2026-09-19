-- Apply only after 002_cash_rls_and_views.sql and explicit approval.
-- This migration changes privileges only. It does not alter schema, RLS or data.
begin;

revoke all privileges on table
  public.cash_current_balances,
  public.cash_current_day,
  public.cash_daily_history,
  public.cash_agent_payment_details,
  public.cash_agency_totals,
  public.cash_anomalies,
  public.cash_coo_revenue_outside_cash
from authenticated, service_role;

grant select on table
  public.cash_current_balances,
  public.cash_current_day,
  public.cash_daily_history,
  public.cash_agent_payment_details,
  public.cash_agency_totals,
  public.cash_anomalies,
  public.cash_coo_revenue_outside_cash
to authenticated, service_role;

revoke all privileges on table
  public.cash_accounts,
  public.cash_events,
  public.cash_daily_closures,
  public.cash_admin_audit
from service_role;

grant select, insert, update on table public.cash_accounts to service_role;
grant select, insert on table public.cash_events to service_role;
grant select, insert on table public.cash_daily_closures to service_role;
grant select, insert on table public.cash_admin_audit to service_role;

commit;
