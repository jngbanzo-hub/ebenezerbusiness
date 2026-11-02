-- Disposable PostgreSQL only; all identifiers and payments are fictitious.
create or replace function public.fixture_resume(p_request uuid,p_parcel uuid,p_arrival uuid,
  p_amount numeric default 99) returns jsonb language sql as $$
  select public.finalize_legacy_native_pending_resume(
    p_request,repeat('b',64),p_parcel,p_arrival,'2026-11-02',
    '2026-11-02T09:39:24Z','ESPECES','',
    jsonb_build_object('codeColis','FX10026','destinationCode',
      (select agency from public.stockage_payment_orchestrations where request_id=p_request),
      'statutPaiement','SOLDE','montantPaye',p_amount,'nouveauSolde',0,
      'nouveauTotalPaye',99,'datePaiement','2026-11-02T09:39:24.000Z'),
    '00000000-0000-4000-8000-000000000004')
$$;

do $$
declare
  v_agency text;
  v_request uuid='00000000-0000-4000-8000-000000000011';
  v_parcel uuid='00000000-0000-4000-8000-000000000012';
  v_arrival uuid='00000000-0000-4000-8000-000000000013';
  v_result jsonb;
begin
  foreach v_agency in array array['FIH','LSHI','KLZ'] loop
    perform public.seed_legacy_resume(v_agency,'FX10026',v_request,v_parcel,v_arrival);
    v_result:=public.fixture_resume(v_request,v_parcel,v_arrival);
    if v_result->>'state'<>'COMPLETED'
      or (select count(*) from public.cash_events)<>1
      or (select count(*) from public.stockage_events where event_type='SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION')<>1
      or (select delivery_status from public.stockage_parcels where parcel_id=v_parcel)<>'DELIVERED'
      or (select current_parcel_count from public.stockage_accounts where agency=v_agency)<>0
      or (select current_weight_kg from public.stockage_accounts where agency=v_agency)<>0
      or (select parcel_id from public.stockage_payment_orchestrations where request_id=v_request) is not null
      or (select resumed_parcel_id from public.stockage_payment_orchestrations where request_id=v_request)<>v_parcel
      or (select resumed_by from public.stockage_payment_orchestrations where request_id=v_request)
          <>'00000000-0000-4000-8000-000000000004'::uuid
      or (select resumed_by_name from public.stockage_payment_orchestrations where request_id=v_request)
          <>'Agent repreneur'
      or (select resumed_at from public.stockage_payment_orchestrations where request_id=v_request) is null
      or (select payment_response->>'datePaiement' from public.stockage_payment_orchestrations where request_id=v_request)
          <>'2026-11-02T09:39:24.000Z'
      or (select actor_name_snapshot from public.cash_events limit 1)<>'Agent historique'
      or (select actor_user_id from public.cash_events limit 1)
          <>'00000000-0000-4000-8000-000000000001'::uuid
      or (select occurred_at from public.cash_events limit 1)<>'2026-11-02T09:39:24Z'::timestamptz
      or (select source_id from public.cash_events limit 1)
          <>('payment-request:'||v_request::text)
      or (select amount from public.cash_events limit 1)<>99
      or (select version from public.cash_accounts where agency=v_agency)<>2
    then raise exception 'SUCCESS_CASE_FAILED: %',v_agency; end if;
    begin
      perform public.fixture_resume(v_request,v_parcel,v_arrival);
      raise exception 'REPEAT_SHOULD_FAIL';
    exception when others then
      if sqlerrm='REPEAT_SHOULD_FAIL' then raise; end if;
    end;
    if (select count(*) from public.cash_events)<>1 then raise exception 'REPEAT_DUPLICATED_CASH'; end if;
  end loop;
end $$;

do $$
declare
  v_request uuid='00000000-0000-4000-8000-000000000011';
  v_parcel uuid='00000000-0000-4000-8000-000000000012';
  v_arrival uuid='00000000-0000-4000-8000-000000000013';
begin
  perform public.seed_legacy_resume('KLZ','FX10026',v_request,v_parcel,v_arrival);
  insert into public.stockage_parcels values('00000000-0000-4000-8000-000000000088',
    'FIH','FX10026',null,5,'AVAILABLE','PHYSICAL_ARRIVAL','arrival:other',null,null,null,1,now());
  if public.fixture_resume(v_request,v_parcel,v_arrival)->>'state'<>'COMPLETED'
  then raise exception 'INTER_AGENCY_HOMONYM_BLOCKED_VALID_PARCEL'; end if;

  perform public.seed_legacy_resume('KLZ','FX10026',v_request,v_parcel,v_arrival);
  insert into auth.users values('00000000-0000-4000-8000-000000000087');
  insert into public.agents values('00000000-0000-4000-8000-000000000087',
    'Agent autre agence','AGENT',true,'FIH');
  begin
    perform public.finalize_legacy_native_pending_resume(v_request,repeat('b',64),v_parcel,
      v_arrival,'2026-11-02','2026-11-02T09:39:24Z','ESPECES','',
      jsonb_build_object('codeColis','FX10026','destinationCode','KLZ','statutPaiement','SOLDE',
        'montantPaye',99,'nouveauSolde',0,'nouveauTotalPaye',99,
        'datePaiement','2026-11-02T09:39:24.000Z'),
      '00000000-0000-4000-8000-000000000087');
    raise exception 'WRONG_AGENT_SHOULD_FAIL';
  exception when others then if sqlerrm='WRONG_AGENT_SHOULD_FAIL' then raise; end if; end;
  if (select count(*) from public.cash_events)<>0 then raise exception 'WRONG_AGENT_PARTIAL_CASH'; end if;

  perform public.seed_legacy_resume('KLZ','FX10026',v_request,v_parcel,v_arrival);
  -- Simulate a concurrent replacement of the physical parcel after read.
  update public.stockage_parcels set parcel_id='00000000-0000-4000-8000-000000000099' where parcel_id=v_parcel;
  begin
    perform public.fixture_resume(v_request,v_parcel,v_arrival);
    raise exception 'CHANGED_PARCEL_SHOULD_FAIL';
  exception when others then if sqlerrm='CHANGED_PARCEL_SHOULD_FAIL' then raise; end if; end;
  if (select count(*) from public.cash_events)<>0 then raise exception 'CHANGED_PARCEL_PARTIAL_CASH'; end if;

  perform public.seed_legacy_resume('KLZ','FX10026',v_request,v_parcel,v_arrival);
  update public.stockage_parcels set weight_source_reference='arrival:00000000-0000-4000-8000-000000000098';
  begin
    perform public.fixture_resume(v_request,v_parcel,v_arrival);
    raise exception 'CHANGED_CYCLE_SHOULD_FAIL';
  exception when others then if sqlerrm='CHANGED_CYCLE_SHOULD_FAIL' then raise; end if; end;
  if (select count(*) from public.cash_events)<>0 then raise exception 'CHANGED_CYCLE_PARTIAL_CASH'; end if;

  perform public.seed_legacy_resume('KLZ','FX10026',v_request,v_parcel,v_arrival);
  insert into public.stockage_events values('arrival-two','00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000014','MANUAL_ARRIVAL_RECORDED','KLZ',1,9,null,
    '00000000-0000-4000-8000-000000000001','Agent historique','AGENT','2026-10-27',
    '2026-10-27T09:00:00Z',repeat('c',64),2,3,'PHYSICAL_AGENT_CONFIRMATION',null,
    '{"parcels":[{"trackingCode":"FX10026","weightKg":9}]}');
  update public.stockage_accounts set version=3,current_parcel_count=2,current_weight_kg=18
    where agency='KLZ';
  begin
    perform public.fixture_resume(v_request,v_parcel,v_arrival);
    raise exception 'AMBIGUOUS_CYCLE_SHOULD_FAIL';
  exception when others then if sqlerrm='AMBIGUOUS_CYCLE_SHOULD_FAIL' then raise; end if; end;
  if (select count(*) from public.cash_events)<>0 then raise exception 'AMBIGUOUS_CYCLE_PARTIAL_CASH'; end if;

  perform public.seed_legacy_resume('KLZ','FX10026',v_request,v_parcel,v_arrival);
  begin
    perform public.fixture_resume(v_request,v_parcel,v_arrival,98);
    raise exception 'CONTRADICTORY_AMOUNT_SHOULD_FAIL';
  exception when others then if sqlerrm='CONTRADICTORY_AMOUNT_SHOULD_FAIL' then raise; end if; end;
  if (select count(*) from public.cash_events)<>0 then raise exception 'AMOUNT_PARTIAL_CASH'; end if;

  perform public.seed_legacy_resume('KLZ','FX10026',v_request,v_parcel,v_arrival);
  -- Deliberately fail after cash insertion: the whole function call must roll back.
  perform set_config('test.fail_exit','true',true);
  begin
    perform public.fixture_resume(v_request,v_parcel,v_arrival);
    raise exception 'ROLLBACK_SHOULD_FAIL';
  exception when others then if sqlerrm='ROLLBACK_SHOULD_FAIL' then raise; end if; end;
  perform set_config('test.fail_exit','false',true);
  if (select count(*) from public.cash_events)<>0
     or (select version from public.cash_accounts where agency='KLZ')<>1
     or (select state from public.stockage_payment_orchestrations where request_id=v_request)<>'PENDING'
  then raise exception 'PARTIAL_CHANGE_AFTER_FAILURE'; end if;
end $$;

select 'isolated fictitious resume tests: PASS' as result;
