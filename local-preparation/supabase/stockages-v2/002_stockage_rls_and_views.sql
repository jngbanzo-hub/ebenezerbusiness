-- PREPARATORY ONLY. APPLY ONLY AFTER 001 AND A SEPARATE APPROVAL.
begin;

alter table public.stockage_accounts enable row level security;
alter table public.stockage_accounts force row level security;
alter table public.stockage_events enable row level security;
alter table public.stockage_events force row level security;
alter table public.stockage_parcels enable row level security;
alter table public.stockage_parcels force row level security;
alter table public.stockage_admin_audit enable row level security;
alter table public.stockage_admin_audit force row level security;
alter table public.stockage_anomalies enable row level security;
alter table public.stockage_anomalies force row level security;

create policy stockage_accounts_read on public.stockage_accounts for select to authenticated using (
  exists (select 1 from public.agents p where p.id = auth.uid() and p.actif is true and (
    upper(trim(p.role)) = 'ADMIN' or
    (upper(trim(p.role)) = 'AGENT' and upper(trim(p.agence)) = stockage_accounts.agency)
  ))
);
create policy stockage_events_read on public.stockage_events for select to authenticated using (
  exists (select 1 from public.agents p where p.id = auth.uid() and p.actif is true and (
    upper(trim(p.role)) = 'ADMIN' or
    (upper(trim(p.role)) = 'AGENT' and upper(trim(p.agence)) = stockage_events.agency)
  ))
);
create policy stockage_parcels_read on public.stockage_parcels for select to authenticated using (
  exists (select 1 from public.agents p where p.id = auth.uid() and p.actif is true and (
    upper(trim(p.role)) = 'ADMIN' or
    (upper(trim(p.role)) = 'AGENT' and upper(trim(p.agence)) = stockage_parcels.agency)
  ))
);
create policy stockage_anomalies_admin_read on public.stockage_anomalies for select to authenticated using (
  exists (select 1 from public.agents p where p.id = auth.uid() and p.actif is true
    and upper(trim(p.role)) = 'ADMIN')
);
create policy stockage_audit_admin_read on public.stockage_admin_audit for select to authenticated using (
  exists (select 1 from public.agents p where p.id = auth.uid() and p.actif is true
    and upper(trim(p.role)) = 'ADMIN')
);

create view public.stockage_current_balances with (security_invoker = true) as
select agency, status, current_parcel_count, current_weight_kg, version,
  opened_business_date, opened_at, updated_at from public.stockage_accounts;

create view public.stockage_current_day with (security_invoker = true) as
select agency, business_date,
  coalesce(sum(parcel_count_delta) filter (where event_type = 'MANUAL_ARRIVAL_RECORDED'), 0)::bigint arrivals_count,
  coalesce(sum(weight_kg_delta) filter (where event_type = 'MANUAL_ARRIVAL_RECORDED'), 0)::numeric(18,3) arrivals_weight_kg,
  abs(coalesce(sum(parcel_count_delta) filter (where event_type = 'CONFIRMED_DELIVERY_RECORDED'), 0))::bigint deliveries_count,
  abs(coalesce(sum(weight_kg_delta) filter (where event_type = 'CONFIRMED_DELIVERY_RECORDED'), 0))::numeric(18,3) deliveries_weight_kg
from public.stockage_events group by agency, business_date;

create view public.stockage_arrivals_history with (security_invoker = true) as
select event_id, agency, business_date, occurred_at, parcel_count_delta parcel_count,
  weight_kg_delta weight_kg, arrival_reference, actor_id, actor_name
from public.stockage_events where event_type = 'MANUAL_ARRIVAL_RECORDED';

create view public.stockage_deliveries_history with (security_invoker = true) as
select event_id, agency, business_date, occurred_at, tracking_code,
  abs(weight_kg_delta) weight_kg, actor_id, actor_name
from public.stockage_events where event_type = 'CONFIRMED_DELIVERY_RECORDED';

create view public.stockage_agent_activity with (security_invoker = true) as
select agency, business_date, actor_id, actor_name,
  count(*) filter (where event_type = 'MANUAL_ARRIVAL_RECORDED') arrivals,
  count(*) filter (where event_type = 'CONFIRMED_DELIVERY_RECORDED') deliveries,
  coalesce(sum(weight_kg_delta) filter (where event_type = 'MANUAL_ARRIVAL_RECORDED'), 0)::numeric(18,3) arrived_weight_kg,
  abs(coalesce(sum(weight_kg_delta) filter (where event_type = 'CONFIRMED_DELIVERY_RECORDED'), 0))::numeric(18,3) delivered_weight_kg
from public.stockage_events where actor_role = 'AGENT'
group by agency, business_date, actor_id, actor_name;

create view public.stockage_agency_totals with (security_invoker = true) as
select agency, business_date, sum(parcel_count_delta)::bigint parcel_delta,
  sum(weight_kg_delta)::numeric(18,3) weight_delta_kg, count(*)::bigint event_count
from public.stockage_events group by agency, business_date;

create view public.stockage_anomalies_open with (security_invoker = true) as
select anomaly_id, agency, tracking_code, request_id, anomaly_type, details, created_at
from public.stockage_anomalies where status = 'OPEN';

create view public.stockage_admin_audit_view with (security_invoker = true) as
select audit_id, action, agency, request_id, admin_id, admin_name, old_value,
  new_value, reason, target_event_id, occurred_at, metadata
from public.stockage_admin_audit;

-- The server computes Africa/Porto-Novo business_date and always filters it.
-- No view chooses an implicit database day or UTC clock value.

commit;
