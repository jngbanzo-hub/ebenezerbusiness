-- READ ONLY. Run after 015 and before 016.
do $$
declare v_cash record; v_jl27226_count integer; v_definition text;
begin
 if to_regprocedure('public.begin_forwarding_destination_payment(uuid,text,uuid,uuid,text,numeric,numeric,uuid)') is null
 or to_regprocedure('public.finalize_forwarding_destination_payment(uuid,text,date,text,text,text)') is null
 or to_regclass('public.stockage_parcels_native_identity_unique') is null
 or to_regclass('public.stockage_parcels_forwarding_identity_unique') is null then raise exception 'MIGRATION_015_REQUIRED'; end if;
 select * into v_cash from information_schema.columns where table_schema='public' and table_name='stockage_forwardings' and column_name='cash_event_id';
 if not found or v_cash.data_type<>'text' or v_cash.is_nullable<>'NO' or v_cash.column_default is not null then raise exception 'CASH_EVENT_ID_SCHEMA_DRIFT'; end if;
 if exists(select 1 from public.stockage_parcels where parcel_id is null) or exists(select 1 from public.stockage_parcels group by parcel_id having count(*)>1) then raise exception 'PARCEL_IDENTITY_DRIFT'; end if;
 if exists(select 1 from public.stockage_forwardings where cash_event_id is null) then raise exception 'UNEXPECTED_UNPAID_FORWARDING'; end if;
 select count(*) into v_jl27226_count from public.stockage_forwarding_orchestrations where request_id='a459a340-ebf5-432b-b76b-b67dd3243b30' and original_tracking_code='JL27226' and origin_agency='FIH' and destination_agency='KLZ' and state='PAYMENT_IN_PROGRESS' and payment_created is false and forwarding_id is null and expected_amount=14;
 if v_jl27226_count<>1 then raise exception 'JL27226_HISTORICAL_ORCHESTRATION_DRIFT'; end if;
 v_definition:=regexp_replace(lower(pg_get_functiondef('public.begin_forwarding_destination_payment(uuid,text,uuid,uuid,text,numeric,numeric,uuid)'::regprocedure)),'[[:space:]]','','g');
 if position('status<>''arrival_confirmed''' in v_definition)=0 then raise exception 'FORWARDING_PAYMENT_BEGIN_DRIFT'; end if;
 v_definition:=regexp_replace(lower(pg_get_functiondef('public.finalize_forwarding_destination_payment(uuid,text,date,text,text,text)'::regprocedure)),'[[:space:]]','','g');
 if position('status=''delivered''' in v_definition)=0 then raise exception 'FORWARDING_PAYMENT_FINALIZE_DRIFT'; end if;
 v_definition:=regexp_replace(lower(pg_get_functiondef('public.record_forwarding_arrival(text,text,date,uuid,uuid)'::regprocedure)),'[[:space:]]','','g');
 if position('status=''ready_for_delivery''' in v_definition)=0 then raise exception 'FORWARDING_ARRIVAL_DRIFT'; end if;
end $$;

select count(*) as parcel_count,
 count(*) filter(where parcel_id is not null) as parcel_ids,
 count(distinct parcel_id) as distinct_parcel_ids,
 count(*) filter(where forwarding_id is not null) as forwarding_parcels
from public.stockage_parcels;
