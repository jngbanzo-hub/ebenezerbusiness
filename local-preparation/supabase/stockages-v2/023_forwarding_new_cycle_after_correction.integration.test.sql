-- Disposable PostgreSQL fixture only. Never run against Production.
do $$
declare c public.fixture_case%rowtype; route record; result jsonb;
  v_request uuid; v_reference text; v_failed boolean; v_agent uuid:='00000000-0000-0000-0000-000000000002';
begin
  for route in select * from (values
    ('KLZ','LSHI','CYCLEKLZ26',3::numeric,33::numeric,39::numeric,13::numeric),
    ('FIH','KLZ','CYCLEFIH26',4::numeric,36::numeric,52::numeric,13::numeric),
    ('LSHI','FIH','CYCLELSHI26',5::numeric,50::numeric,65::numeric,13::numeric)
  ) as r(origin_agency,destination_agency,code,weight,initial_price,forwarding_price,rate) loop
    perform public.seed_fixture(route.origin_agency,route.destination_agency,route.code,
      route.weight,route.initial_price,route.forwarding_price);
    select * into c from public.fixture_case;
    perform public.correct_mistaken_forwarding(md5('correct-'||route.code)::uuid,
      c.forwarding_id,c.parcel_id,c.destination_agency,2,c.origin_arrival_id,c.departure_id,
      c.destination_arrival_id,c.historical_price,0,c.historical_price,
      c.origin_agency||'!F17','2026-10-01','Correction administrative fictive',true,
      '00000000-0000-0000-0000-000000000001');
    v_request:=md5('new-cycle-'||route.code)::uuid;
    v_reference:=route.code||'-'||route.origin_agency||'-'||route.destination_agency;
    result:=public.confirm_storage_forwarding_departure(route.code,route.destination_agency,
      route.weight,v_reference,route.forwarding_price,route.rate,'PHYSICAL_STORAGE',
      '2026-10-04',v_request,md5(route.code||'-new')||md5(route.code||'-new'),v_agent);
    if result->>'state'<>'IN_TRANSIT' or result->>'replayed'<>'false'
       or result->>'forwardingReference'<>v_reference||'-R'||upper(left(replace(v_request::text,'-',''),21))
       or (select count(*) from public.stockage_forwardings where original_tracking_code=route.code
         and origin_agency=route.origin_agency and destination_agency=route.destination_agency)<>2
       or (select count(*) from public.stockage_forwardings where forwarding_id=c.forwarding_id
         and status='CANCELLED_BY_COMPENSATION' and forwarding_reference=v_reference)<>1
       or (select count(*) from public.stockage_forwardings where creation_request_id=v_request
         and status='IN_TRANSIT' and forwarding_reference=result->>'forwardingReference')<>1
       or (select count(*) from public.stockage_forwarding_manifest_registry where forwarding_id=c.forwarding_id
         and sync_state='CANCELLED_BY_COMPENSATION')<>1
       or (select count(*) from public.stockage_forwarding_manifest_registry where forwarding_id=(result->>'forwardingId')::uuid
         and sync_state='AWAITING_PAYMENT')<>1
       or (select count(*) from public.stockage_events where event_id in
         (c.origin_arrival_id,c.departure_id,c.destination_arrival_id))<>3
       or (select count(*) from public.stockage_events where event_type='SORTIE_POUR_ACHEMINEMENT')<>2
       or (select count(*) from public.cash_events)<>0 then
      raise exception 'NEW_CYCLE_AFTER_CORRECTION_FAILED: %',route.code;
    end if;
    result:=public.confirm_storage_forwarding_departure(route.code,route.destination_agency,
      route.weight,v_reference,route.forwarding_price,route.rate,'PHYSICAL_STORAGE',
      '2026-10-04',v_request,md5(route.code||'-new')||md5(route.code||'-new'),v_agent);
    if result->>'replayed'<>'true'
       or (select count(*) from public.stockage_forwardings where original_tracking_code=route.code)<>2
       or (select count(*) from public.stockage_events where event_type='SORTIE_POUR_ACHEMINEMENT')<>2 then
      raise exception 'NEW_CYCLE_IDEMPOTENCY_FAILED: %',route.code;
    end if;
    v_failed:=false;
    begin
      perform public.confirm_storage_forwarding_departure(route.code,route.destination_agency,
        route.weight,v_reference,route.forwarding_price,route.rate,'PHYSICAL_STORAGE',
        '2026-10-04',md5('duplicate-'||route.code)::uuid,
        md5(route.code||'-duplicate')||md5(route.code||'-duplicate'),v_agent);
    exception when others then v_failed:=sqlerrm like '%IDEMPOTENCY_CONFLICT%'; end;
    if not v_failed then raise exception 'ACTIVE_DUPLICATE_ACCEPTED: %',route.code; end if;
    v_failed:=false;
    begin
      insert into public.stockage_forwardings(forwarding_id,forwarding_reference,creation_request_id,
        command_fingerprint,original_tracking_code,origin_agency,destination_agency,
        canonical_weight_kg,rate_usd_per_kg,amount_expected,amount_paid,status,
        created_at,version,metadata)
      values(gen_random_uuid(),v_reference||'-ANOTHER',gen_random_uuid(),repeat('f',64),
        route.code,route.origin_agency,route.destination_agency,route.weight,route.rate,
        route.forwarding_price,0,'IN_TRANSIT',now(),1,jsonb_build_object('parcelId',c.parcel_id));
    exception when unique_violation then v_failed:=true; end;
    if not v_failed then raise exception 'ACTIVE_ROUTE_INDEX_FAILED: %',route.code; end if;
  end loop;
end $$;

-- Historical paid-at-origin path: a fictitious canonical payment checkpoint
-- must carry the new cycle reference before the unchanged finalizer effects.
do $$
declare c public.fixture_case%rowtype; route record; result jsonb;
  v_request uuid; v_reference text; v_fingerprint text; v_failed boolean;
begin
  for route in select * from (values
    ('KLZ','LSHI','PAIDKLZ26',3::numeric,33::numeric,39::numeric,13::numeric),
    ('FIH','KLZ','PAIDFIH26',4::numeric,36::numeric,52::numeric,13::numeric),
    ('LSHI','FIH','PAIDLSHI26',5::numeric,50::numeric,65::numeric,13::numeric)
  ) as r(origin_agency,destination_agency,code,weight,initial_price,forwarding_price,rate) loop
    perform public.seed_fixture(route.origin_agency,route.destination_agency,route.code,
      route.weight,route.initial_price,route.forwarding_price);
    select * into c from public.fixture_case;
    perform public.correct_mistaken_forwarding(md5('correct-paid-'||route.code)::uuid,
      c.forwarding_id,c.parcel_id,c.destination_agency,2,c.origin_arrival_id,c.departure_id,
      c.destination_arrival_id,c.historical_price,0,c.historical_price,
      c.origin_agency||'!F17','2026-10-01','Correction administrative fictive',true,
      '00000000-0000-0000-0000-000000000001');
    v_request:=md5('paid-cycle-'||route.code)::uuid;
    v_fingerprint:=md5('paid-fingerprint-'||route.code)||md5('paid-fingerprint-'||route.code);
    v_reference:=route.code||'-'||route.origin_agency||'-'||route.destination_agency
      ||'-R'||upper(left(replace(v_request::text,'-',''),21));
    insert into public.stockage_forwarding_orchestrations(request_id,command_fingerprint,
      original_tracking_code,origin_agency,destination_agency,canonical_weight_kg,
      rate_usd_per_kg,expected_amount,source_status,payment_mode,actor_id,actor_name,
      payment_created,payment_response,state,updated_at)
    values(v_request,v_fingerprint,route.code,route.origin_agency,route.destination_agency,
      route.weight,route.rate,route.forwarding_price,'EN TRANSIT','ESPECES',
      '00000000-0000-0000-0000-000000000002','Agent fictif',true,
      jsonb_build_object('paymentRequestId',v_request,'amount',route.forwarding_price,
        'operationContext',jsonb_build_object('forwardingReference',v_reference)),
      'PAID_AWAITING_ARRIVAL',now());
    insert into public.cash_events values('cash-fictif-'||route.code,v_request::text,
      jsonb_build_object('amount',route.forwarding_price));
    result:=public.finalize_inter_agency_forwarding(v_request,v_fingerprint);
    if result->>'state'<>'PAID_AWAITING_ARRIVAL' or result->>'forwardingReference'<>v_reference
      or result->>'replayed'<>'false'
      or (select count(*) from public.stockage_forwardings where forwarding_id=c.forwarding_id
        and status='CANCELLED_BY_COMPENSATION'
        and forwarding_reference=route.code||'-'||route.origin_agency||'-'||route.destination_agency)<>1
      or (select count(*) from public.stockage_forwardings where creation_request_id=v_request
        and status='PAID_AWAITING_ARRIVAL' and amount_paid=route.forwarding_price
        and metadata->'paymentResponse'->'operationContext'->>'forwardingReference'=v_reference)<>1
      or (select count(*) from public.stockage_forwarding_events where forwarding_id=(result->>'forwardingId')::uuid
        and event_type='FORWARDING_CREATED')<>1
      or (select count(*) from public.stockage_forwarding_manifest_registry where forwarding_id=c.forwarding_id
        and sync_state='CANCELLED_BY_COMPENSATION')<>1
      or (select count(*) from public.cash_events)<>1 then
      raise exception 'PAID_ORIGIN_CYCLE_LINK_FAILED: %',route.code;
    end if;
    result:=public.finalize_inter_agency_forwarding(v_request,v_fingerprint);
    if result->>'replayed'<>'true'
      or (select count(*) from public.stockage_forwardings where original_tracking_code=route.code)<>2
      or (select count(*) from public.stockage_forwarding_events where event_type='FORWARDING_CREATED')<>1
      or (select count(*) from public.cash_events)<>1 then
      raise exception 'PAID_ORIGIN_REPLAY_FAILED: %',route.code;
    end if;
    v_failed:=false;
    begin
      insert into public.stockage_forwarding_orchestrations(request_id,forwarding_id,
        command_fingerprint,state,payment_created,updated_at)
      values(md5('paid-duplicate-'||route.code)::uuid,null,v_fingerprint,
        'PAYMENT_IN_PROGRESS',false,now());
    exception when unique_violation then v_failed:=true; end;
    if not v_failed or (select count(*) from public.cash_events)<>1 then
      raise exception 'PAID_ORIGIN_DUPLICATE_FINGERPRINT_ACCEPTED: %',route.code;
    end if;
  end loop;
end $$;

do $$
declare c public.fixture_case%rowtype; v_request uuid:=md5('ordinary-departure')::uuid;
  v_failed boolean:=false; result jsonb;
begin
  perform public.seed_fixture('FIH','KLZ','OLDCASE126',4,36,52);
  select * into c from public.fixture_case;
  insert into public.stockage_parcels(parcel_id,forwarding_id,tracking_code,agency,
    canonical_weight_kg,delivery_status,weight_source,weight_source_reference,
    created_at,version,updated_at)
  values(md5('ordinary-parcel')::uuid,null,'ORDINARY126','FIH',4,'AVAILABLE',
    'PHYSICAL_ARRIVAL','ordinary-arrival',now(),1,now());
  update public.stockage_accounts set current_parcel_count=1,current_weight_kg=4
    where agency='FIH';
  begin
    perform public.confirm_storage_forwarding_departure('ORDINARY126','KLZ',4,
      'ORDINARY126-FIH-KLZ',52,13,'PHYSICAL_STORAGE','2026-10-04',v_request,
      repeat('a',64),'00000000-0000-0000-0000-000000000001');
  exception when others then v_failed:=sqlerrm like '%ACTIVE_AGENT_REQUIRED%'; end;
  if not v_failed or (select count(*) from public.stockage_forwardings where original_tracking_code='ORDINARY126')<>0 then
    raise exception 'UNAUTHORIZED_DEPARTURE_NOT_BLOCKED';
  end if;
  result:=public.confirm_storage_forwarding_departure('ORDINARY126','KLZ',4,
    'ORDINARY126-FIH-KLZ',52,13,'PHYSICAL_STORAGE','2026-10-04',v_request,
    repeat('a',64),'00000000-0000-0000-0000-000000000002');
  if result->>'forwardingReference'<>'ORDINARY126-FIH-KLZ'
     or result->>'state'<>'IN_TRANSIT'
     or (select count(*) from public.stockage_forwarding_manifest_registry
       where forwarding_id=(result->>'forwardingId')::uuid and sync_state='AWAITING_PAYMENT')<>1 then
    raise exception 'ORDINARY_DEPARTURE_REGRESSION';
  end if;
end $$;
