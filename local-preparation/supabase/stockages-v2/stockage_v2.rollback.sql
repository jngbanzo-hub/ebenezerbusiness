-- PREPARATORY EMERGENCY ROLLBACK. Destructive; never run automatically.
begin;

drop view if exists public.stockage_admin_audit_view;
drop view if exists public.stockage_anomalies_open;
drop view if exists public.stockage_agency_totals;
drop view if exists public.stockage_agent_activity;
drop view if exists public.stockage_deliveries_history;
drop view if exists public.stockage_arrivals_history;
drop view if exists public.stockage_current_day;
drop view if exists public.stockage_current_balances;

drop function if exists public.record_stockage_anomaly(text,text,text,uuid,jsonb,uuid);
drop function if exists public.resolve_stockage_anomaly(text,text,uuid,uuid);
drop function if exists public.record_stock_correction(text,integer,numeric,date,text,uuid,uuid);
drop function if exists public.record_admin_stock_adjustment(text,text,integer,numeric,date,text,uuid,uuid);
drop function if exists public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid);
drop function if exists public.record_manual_arrival(integer,numeric,date,text,text,uuid,uuid);
drop function if exists public.record_opening_stock(text,integer,numeric,date,text,uuid,uuid);

-- Tables are removed last. Back up and verify zero required business data first.
drop table if exists public.stockage_anomalies;
drop table if exists public.stockage_admin_audit;
drop table if exists public.stockage_parcels;
drop table if exists public.stockage_events;
drop table if exists public.stockage_accounts;
drop function if exists public.reject_stockage_immutable_mutation();
drop function if exists public.reject_stockage_anomaly_delete();

commit;
