-- PREPARATORY ONLY. Restores only the default grants observed before hardening.
begin;

grant all on table public.stockage_accounts, public.stockage_events,
  public.stockage_parcels, public.stockage_admin_audit, public.stockage_anomalies
  to service_role;
grant select on table public.stockage_accounts, public.stockage_events,
  public.stockage_parcels, public.stockage_admin_audit, public.stockage_anomalies
  to authenticated;

grant all on table public.stockage_current_balances, public.stockage_current_day,
  public.stockage_arrivals_history, public.stockage_deliveries_history,
  public.stockage_agent_activity, public.stockage_agency_totals,
  public.stockage_anomalies_open, public.stockage_admin_audit_view
  to service_role;
grant select on table public.stockage_current_balances, public.stockage_current_day,
  public.stockage_arrivals_history, public.stockage_deliveries_history,
  public.stockage_agent_activity, public.stockage_agency_totals,
  public.stockage_anomalies_open, public.stockage_admin_audit_view
  to authenticated;

commit;
