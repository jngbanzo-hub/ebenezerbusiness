-- READ ONLY. Run before any future application.
select current_database() as database_name,
       to_regclass('public.stockage_parcels') is not null as parcels_present,
       to_regclass('public.stockage_forwardings') is not null as forwardings_present,
       (select count(*) from public.stockage_parcels) as parcel_rows,
       (select count(*) from public.stockage_parcels group by () having count(*)>=0) as rows_recounted,
       not exists(select 1 from public.stockage_parcels group by agency,tracking_code having count(*)>1) as native_identity_unique,
       to_regprocedure('public.begin_paid_destination_orchestration(uuid,text,text,text,numeric,numeric,uuid)') is not null as begin_paid_present,
       to_regprocedure('public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid)') is not null as confirm_delivery_present,
       to_regprocedure('public.finalize_paid_destination_orchestration(uuid,text,date,text,text,text)') is not null as finalize_paid_present,
       to_regprocedure('public.reconcile_initial_physical_inventory(text,jsonb,date,text,uuid,uuid)') is not null as reconciliation_present,
       to_regprocedure('public.confirm_klz_lshi_departure(text,numeric,text,date,uuid,uuid)') is not null as departure_present,
       to_regprocedure('public.record_detailed_arrival(jsonb,date,text,text,uuid,uuid)') is not null as detailed_arrival_present,
       to_regprocedure('public.record_forwarding_arrival(text,text,date,uuid,uuid)') is not null as forwarding_arrival_present,
       to_regprocedure('public.confirm_forwarding_delivery(text,text,boolean,date,uuid,uuid)') is not null as forwarding_delivery_present;

select conname,pg_get_constraintdef(oid) definition
from pg_constraint where conrelid='public.stockage_parcels'::regclass order by conname;

select indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('stockage_parcels','stockage_events') order by tablename,indexname;

-- Definition guards ignore formatting/case only. Identifiers, predicates and actions remain exact.
with definitions(name,definition,required_semantics) as (values
  ('begin_paid_destination_orchestration',pg_get_functiondef('public.begin_paid_destination_orchestration(uuid,text,text,text,numeric,numeric,uuid)'::regprocedure),'wheretracking_code=v_codeandagency=v_agencyforupdate'),
  ('confirm_parcel_delivery_conflict',pg_get_functiondef('public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid)'::regprocedure),'onconflict(agency,tracking_code)donothing'),
  ('confirm_parcel_delivery_lock',pg_get_functiondef('public.confirm_parcel_delivery(text,text,numeric,text,text,date,boolean,jsonb,uuid,uuid)'::regprocedure),'whereagency=v_agencyandtracking_code=v_codeforupdate'),
  ('finalize_paid_destination_orchestration',pg_get_functiondef('public.finalize_paid_destination_orchestration(uuid,text,date,text,text,text)'::regprocedure),'whereagency=v_row.agencyandtracking_code=v_row.tracking_codeforupdate'),
  ('confirm_klz_lshi_departure',pg_get_functiondef('public.confirm_klz_lshi_departure(text,numeric,text,date,uuid,uuid)'::regprocedure),'whereagency=''klz''andtracking_code=v_code'),
  ('record_forwarding_arrival',pg_get_functiondef('public.record_forwarding_arrival(text,text,date,uuid,uuid)'::regprocedure),'values(v_forwarding.forwarding_reference,v_forwarding.destination_agency'),
  ('confirm_forwarding_delivery',pg_get_functiondef('public.confirm_forwarding_delivery(text,text,boolean,date,uuid,uuid)'::regprocedure),'whereagency=v_forwarding.destination_agencyandtracking_code=v_forwarding.forwarding_referenceforupdate')
)
select name,
       position(required_semantics in regexp_replace(lower(definition),'[[:space:]]','','g'))>0 as semantically_conformant
from definitions
order by name;
