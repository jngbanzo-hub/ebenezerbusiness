-- Run only against a disposable, isolated PostgreSQL test database after fixture.sql and 022 SQL.
do $$
declare c public.fixture_case%rowtype; result jsonb; route record;
begin
  for route in select * from (values
    ('KLZ','LSHI','TST04426',3::numeric,33::numeric,39::numeric),
    ('FIH','KLZ','TST04526',4::numeric,36::numeric,52::numeric),
    ('LSHI','FIH','TST04626',5::numeric,50::numeric,75::numeric)
  ) as v(origin_agency,destination_agency,code,weight,initial_price,forwarding_price) loop
    perform public.seed_fixture(route.origin_agency,route.destination_agency,route.code,
      route.weight,route.initial_price,route.forwarding_price);
    select * into c from public.fixture_case;
    result:=public.correct_mistaken_forwarding(md5('request-'||route.code)::uuid,
      c.forwarding_id,c.parcel_id,c.destination_agency,2,c.origin_arrival_id,c.departure_id,
      c.destination_arrival_id,c.historical_price,0,c.historical_price,
      c.origin_agency||'!F17','2026-10-01','Correction administrative fictive',true,
      '00000000-0000-0000-0000-000000000001');
    if result->>'state'<>'COMPLETED' or result->>'replayed'<>'false'
      or (select count(*) from public.stockage_parcels where parcel_id=c.parcel_id
        and tracking_code=c.tracking_code and agency=c.origin_agency and forwarding_id is null
        and canonical_weight_kg=c.weight_kg and weight_source_reference=c.origin_arrival_id)<>1
      or (select count(*) from public.stockage_accounts where agency=c.origin_agency
        and current_parcel_count=1 and current_weight_kg=c.weight_kg)<>1
      or (select count(*) from public.stockage_accounts where agency=c.destination_agency
        and current_parcel_count=0 and current_weight_kg=0)<>1
      or (select count(*) from public.stockage_events where event_type='CORRECTION_COMPENSATOIRE_ADMIN')<>2
      or (select count(*) from public.stockage_admin_audit)<>1
      or (select count(*) from public.stockage_forwarding_events where event_type='FORWARDING_CANCELLED_BY_COMPENSATION')<>1
      or (select count(*) from public.stockage_forwardings where forwarding_id=c.forwarding_id
        and status='CANCELLED_BY_COMPENSATION' and amount_expected=c.forwarding_price and amount_paid=0)<>1
      or (select count(*) from public.stockage_forwarding_orchestrations where forwarding_id=c.forwarding_id
        and state='CANCELLED_BY_COMPENSATION')<>1 then
      raise exception 'FULL_CORRECTION_FAILED: %', route.code;
    end if;
    result:=public.correct_mistaken_forwarding(md5('request-'||route.code)::uuid,
      c.forwarding_id,c.parcel_id,c.destination_agency,2,c.origin_arrival_id,c.departure_id,
      c.destination_arrival_id,c.historical_price,0,c.historical_price,
      c.origin_agency||'!F17','2026-10-01','Correction administrative fictive',true,
      '00000000-0000-0000-0000-000000000001');
    if result->>'replayed'<>'true'
      or (select count(*) from public.stockage_events where event_type='CORRECTION_COMPENSATOIRE_ADMIN')<>2 then
      raise exception 'IDEMPOTENT_REPLAY_FAILED: %', route.code;
    end if;
  end loop;
end $$;

create function public.fixture_fail_late() returns trigger language plpgsql as $$
begin raise exception 'SIMULATED_LATE_FAILURE'; end $$;
create trigger fixture_fail_late before insert on public.stockage_forwarding_events
  for each row execute function public.fixture_fail_late();
do $$
declare c public.fixture_case%rowtype; failed boolean:=false;
begin
  perform public.seed_fixture('KLZ','LSHI','ROLLBACK126',3,33,39);
  select * into c from public.fixture_case;
  begin
    perform public.correct_mistaken_forwarding(md5('rollback-request')::uuid,
      c.forwarding_id,c.parcel_id,c.destination_agency,2,c.origin_arrival_id,c.departure_id,
      c.destination_arrival_id,33,0,33,'KLZ!F17','2026-10-01',
      'Correction administrative fictive',true,'00000000-0000-0000-0000-000000000001');
  exception when others then failed:=sqlerrm like '%SIMULATED_LATE_FAILURE%'; end;
  if not failed or (select count(*) from public.stockage_events where event_type='CORRECTION_COMPENSATOIRE_ADMIN')<>0
    or (select count(*) from public.stockage_admin_audit)<>0
    or (select count(*) from public.stockage_accounts where agency='KLZ' and current_parcel_count=0 and current_weight_kg=0)<>1
    or (select count(*) from public.stockage_accounts where agency='LSHI' and current_parcel_count=1 and current_weight_kg=3)<>1
    or (select count(*) from public.stockage_parcels where parcel_id=c.parcel_id and agency='LSHI' and forwarding_id=c.forwarding_id)<>1
    or (select count(*) from public.stockage_forwardings where forwarding_id=c.forwarding_id and status='ARRIVAL_CONFIRMED')<>1 then
    raise exception 'ATOMIC_ROLLBACK_FAILED';
  end if;
end $$;
drop trigger fixture_fail_late on public.stockage_forwarding_events;
drop function public.fixture_fail_late();

do $$
declare c public.fixture_case%rowtype; failed boolean;
begin
  perform public.seed_fixture('FIH','KLZ','LATER126',4,36,52);
  select * into c from public.fixture_case;
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,
    parcel_count_delta,weight_kg_delta,tracking_code,actor_id,actor_name,actor_role,
    business_date,occurred_at,payload_hash,account_version_before,account_version_after,
    source_type,metadata) values('later-operation',md5('account-KLZ')::uuid,gen_random_uuid(),
    'ADMIN_STOCK_ADJUSTMENT_RECORDED','KLZ',0,1,c.tracking_code,
    '00000000-0000-0000-0000-000000000001','Admin fictif','ADMIN',
    '2026-10-04','2026-10-04T12:00:00Z',repeat('d',64),2,3,'ADMIN',
    jsonb_build_object('parcelId',c.parcel_id::text));
  failed:=false;
  begin
    perform public.correct_mistaken_forwarding(md5('later-request')::uuid,
      c.forwarding_id,c.parcel_id,c.destination_agency,2,c.origin_arrival_id,c.departure_id,
      c.destination_arrival_id,36,0,36,'FIH!F17','2026-10-01',
      'Correction administrative fictive',true,'00000000-0000-0000-0000-000000000001');
  exception when others then failed:=sqlerrm like '%FORWARDING_HAS_SUBSEQUENT_EFFECT%'; end;
  if not failed or (select count(*) from public.stockage_events where event_type='CORRECTION_COMPENSATOIRE_ADMIN')<>0 then
    raise exception 'LATER_OPERATION_GUARD_FAILED';
  end if;
end $$;

do $$
declare c public.fixture_case%rowtype; failed boolean;
begin
  perform public.seed_fixture('LSHI','FIH','RIGHTS126',5,50,75);
  select * into c from public.fixture_case;
  if has_function_privilege('authenticated',
    'public.correct_mistaken_forwarding(uuid,uuid,uuid,text,bigint,text,text,text,numeric,numeric,numeric,text,date,text,boolean,uuid)',
    'EXECUTE') or not has_function_privilege('service_role',
    'public.correct_mistaken_forwarding(uuid,uuid,uuid,text,bigint,text,text,text,numeric,numeric,numeric,text,date,text,boolean,uuid)',
    'EXECUTE') then raise exception 'FUNCTION_PRIVILEGES_FAILED'; end if;
  failed:=false;
  begin
    perform public.correct_mistaken_forwarding(md5('rights-request')::uuid,
      c.forwarding_id,c.parcel_id,c.destination_agency,2,c.origin_arrival_id,c.departure_id,
      c.destination_arrival_id,50,0,50,'LSHI!F17','2026-10-01',
      'Correction administrative fictive',true,'00000000-0000-0000-0000-000000000002');
  exception when others then failed:=sqlerrm like '%ACTIVE_ADMIN_REQUIRED%'; end;
  if not failed or (select count(*) from public.stockage_events where event_type='CORRECTION_COMPENSATOIRE_ADMIN')<>0 then
    raise exception 'ACTOR_RIGHTS_GUARD_FAILED';
  end if;
end $$;
