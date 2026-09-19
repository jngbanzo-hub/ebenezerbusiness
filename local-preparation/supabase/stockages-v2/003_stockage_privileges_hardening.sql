-- PREPARATORY ONLY. PRIVILEGES ONLY.
begin;

revoke all on table public.stockage_accounts, public.stockage_events,
  public.stockage_parcels, public.stockage_admin_audit, public.stockage_anomalies
  from public, anon, authenticated, service_role;
grant select on table public.stockage_accounts, public.stockage_events,
  public.stockage_parcels, public.stockage_admin_audit, public.stockage_anomalies
  to authenticated, service_role;

revoke all on table public.stockage_current_balances, public.stockage_current_day,
  public.stockage_arrivals_history, public.stockage_deliveries_history,
  public.stockage_agent_activity, public.stockage_agency_totals,
  public.stockage_anomalies_open, public.stockage_admin_audit_view
  from public, anon, authenticated, service_role;
grant select on table public.stockage_current_balances, public.stockage_current_day,
  public.stockage_arrivals_history, public.stockage_deliveries_history,
  public.stockage_agent_activity, public.stockage_agency_totals,
  public.stockage_anomalies_open, public.stockage_admin_audit_view
  to authenticated, service_role;

revoke all on function public.reject_stockage_immutable_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.reject_stockage_anomaly_delete()
  from public, anon, authenticated, service_role;

commit;
