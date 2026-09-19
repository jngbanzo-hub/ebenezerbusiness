-- PREPARATORY ROLLBACK ONLY. NEVER RUN AUTOMATICALLY.
-- Restores exactly the privileges observed immediately before Phase Caisse 5.1.
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

grant all privileges on table
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

grant all privileges on table
  public.cash_accounts,
  public.cash_events,
  public.cash_daily_closures,
  public.cash_admin_audit
to service_role;

commit;
