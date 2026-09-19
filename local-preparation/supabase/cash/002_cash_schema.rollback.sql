-- PREPARATORY ROLLBACK ONLY. NEVER RUN AUTOMATICALLY.
-- Back up and export all cash journals before any destructive rollback.
begin;

drop view if exists public.cash_coo_revenue_outside_cash;
drop view if exists public.cash_anomalies;
drop view if exists public.cash_agency_totals;
drop view if exists public.cash_agent_payment_details;
drop view if exists public.cash_daily_history;
drop view if exists public.cash_current_day;
drop view if exists public.cash_current_balances;

drop policy if exists cash_audit_admin_read on public.cash_admin_audit;
drop policy if exists cash_closures_read on public.cash_daily_closures;
drop policy if exists cash_events_read on public.cash_events;
drop policy if exists cash_accounts_read on public.cash_accounts;

drop trigger if exists cash_audit_reject_mutation on public.cash_admin_audit;
drop trigger if exists cash_closures_reject_mutation on public.cash_daily_closures;
drop trigger if exists cash_events_reject_mutation on public.cash_events;
drop function if exists public.reject_cash_immutable_mutation();

-- Destructive last resort only, deliberately commented out:
-- drop table if exists public.cash_admin_audit;
-- drop table if exists public.cash_daily_closures;
-- drop table if exists public.cash_events;
-- drop table if exists public.cash_accounts;

commit;
