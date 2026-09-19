\set ON_ERROR_STOP on
begin;
\ir 009_paid_exit_forwarding_orchestration.sql

do $$
begin
  if to_regclass('public.stockage_forwarding_orchestrations') is null
     or to_regclass('public.stockage_forwardings') is null
     or to_regclass('public.stockage_forwarding_events') is null
     or to_regclass('public.stockage_forwarding_anomalies') is null then
    raise exception 'PREFLIGHT_009_TABLES_MISSING';
  end if;
  if to_regprocedure('public.begin_inter_agency_forwarding(text,text,text,numeric,numeric,text,text,text,uuid,text,uuid)') is null
     or to_regprocedure('public.checkpoint_inter_agency_payment(uuid,text,jsonb)') is null
     or to_regprocedure('public.finalize_inter_agency_forwarding(uuid,text)') is null then
    raise exception 'PREFLIGHT_009_FUNCTIONS_MISSING';
  end if;
end $$;

rollback;

select
  to_regclass('public.stockage_forwarding_orchestrations') is null
  and to_regclass('public.stockage_forwardings') is null
  and to_regclass('public.stockage_forwarding_events') is null
  and to_regclass('public.stockage_forwarding_anomalies') is null as rollback_integral;
