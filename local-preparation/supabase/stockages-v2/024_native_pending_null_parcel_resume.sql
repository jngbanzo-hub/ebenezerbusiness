-- PREPARATION ONLY. Never apply to Production without a separate approval.
-- A dedicated function keeps the ordinary payment/finalization path unchanged.
begin;

do $$begin
  if to_regprocedure('public.record_cash_payment_credit(text,text,text,numeric,date,timestamptz,uuid,text,text,jsonb)') is null
     or to_regclass('public.stockage_events_native_delivery_unique') is null
     or not exists(select 1 from pg_constraint
       where conrelid='public.stockage_payment_orchestrations'::regclass
         and conname='stockage_payment_forwarding_identity_check')
  then raise exception 'LEGACY_RESUME_PRODUCTION_PREFLIGHT_FAILED'; end if;
end $$;

alter table public.stockage_payment_orchestrations
  add column resumed_parcel_id uuid references public.stockage_parcels(parcel_id),
  add column resumed_by uuid references auth.users(id),
  add column resumed_by_name text,
  add column resumed_at timestamptz;

create function public.finalize_legacy_native_pending_resume(
  p_request_id uuid, p_command_fingerprint text, p_expected_parcel_id uuid,
  p_arrival_request_id uuid, p_business_date date, p_canonical_paid_at timestamptz,
  p_payment_mode text, p_observation text, p_payment_response jsonb,
  p_resumer_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions as $$
declare
  v_row public.stockage_payment_orchestrations%rowtype;
  v_parcel public.stockage_parcels%rowtype;
  v_arrival public.stockage_events%rowtype;
  v_account public.stockage_accounts%rowtype;
  v_agent public.agents%rowtype;
  v_cash jsonb;
  v_event_id text;
  v_hash text;
begin
  if p_request_id is null or p_expected_parcel_id is null or p_arrival_request_id is null
     or p_resumer_id is null or p_business_date is null or p_canonical_paid_at is null
     or p_command_fingerprint !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_payment_response) is distinct from 'object'
     or nullif(btrim(p_payment_mode),'') is null
     or (p_canonical_paid_at at time zone 'Africa/Porto-Novo')::date <> p_business_date
  then raise exception 'LEGACY_RESUME_EVIDENCE_INVALID'; end if;

  select * into v_row from public.stockage_payment_orchestrations
    where request_id=p_request_id for update;
  if not found or v_row.command_fingerprint<>p_command_fingerprint
     or v_row.forwarding_id is not null or v_row.parcel_id is not null
  then raise exception 'LEGACY_RESUME_IDENTITY_CONFLICT'; end if;
  if v_row.state<>'PENDING' or v_row.resumed_parcel_id is not null
     or v_row.payment_created or v_row.payment_response is not null
     or v_row.cash_event_id is not null or v_row.stockage_event_id is not null
  then raise exception 'LEGACY_RESUME_NOT_PENDING_UNTOUCHED'; end if;
  if p_payment_response->>'codeColis' is distinct from v_row.tracking_code
     or p_payment_response->>'destinationCode' is distinct from v_row.agency
     or p_payment_response->>'statutPaiement' is distinct from 'SOLDE'
     or (p_payment_response->>'montantPaye')::numeric is distinct from v_row.paid_amount
     or (p_payment_response->>'nouveauSolde')::numeric is distinct from 0
     or (p_payment_response->>'nouveauTotalPaye')::numeric is distinct from v_row.expected_amount
     or p_payment_response->>'datePaiement' is distinct from to_char(p_canonical_paid_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  then raise exception 'LEGACY_RESUME_PAYMENT_CONTRADICTORY'; end if;

  select * into v_agent from public.agents where id=p_resumer_id for share;
  if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT'
     or upper(btrim(v_agent.agence))<>v_row.agency
  then raise exception 'LEGACY_RESUME_AGENT_UNAUTHORIZED'; end if;

  select * into v_parcel from public.stockage_parcels
    where parcel_id=p_expected_parcel_id for update;
  if not found or v_parcel.agency<>v_row.agency or v_parcel.tracking_code<>v_row.tracking_code
     or v_parcel.forwarding_id is not null or v_parcel.delivery_status<>'AVAILABLE'
     or v_parcel.weight_source<>'PHYSICAL_ARRIVAL'
     or v_parcel.weight_source_reference<>'arrival:'||p_arrival_request_id::text
     or v_parcel.delivered_event_id is not null
  then raise exception 'LEGACY_RESUME_PARCEL_CYCLE_CHANGED'; end if;
  if (select count(*) from public.stockage_parcels
      where agency=v_row.agency and tracking_code=v_row.tracking_code)<>1
  then raise exception 'LEGACY_RESUME_PARCEL_AMBIGUOUS'; end if;

  select * into v_arrival from public.stockage_events
    where request_id=p_arrival_request_id for share;
  if not found or v_arrival.agency<>v_row.agency
     or v_arrival.event_type<>'MANUAL_ARRIVAL_RECORDED'
     or v_arrival.occurred_at>v_row.created_at
     or v_arrival.occurred_at>p_canonical_paid_at
     or (select count(*) from jsonb_array_elements(coalesce(v_arrival.metadata->'parcels','[]'::jsonb)) item
         where item->>'trackingCode'=v_row.tracking_code
           and (item->>'weightKg')::numeric=v_parcel.canonical_weight_kg)<>1
     or (select count(*) from jsonb_array_elements(coalesce(v_arrival.metadata->'parcels','[]'::jsonb)) item
         where item->>'trackingCode'=v_row.tracking_code)<>1
  then raise exception 'LEGACY_RESUME_ARRIVAL_NOT_CERTIFIED'; end if;
  -- Reject a second cycle rather than guessing which occurrence of the code P1 paid.
  if (select count(*) from public.stockage_events
      where agency=v_row.agency and event_type='MANUAL_ARRIVAL_RECORDED'
        and metadata @> jsonb_build_object('parcels',jsonb_build_array(
          jsonb_build_object('trackingCode',v_row.tracking_code))))<>1
     or exists(select 1 from public.stockage_events
       where agency=v_row.agency and tracking_code=v_row.tracking_code
         and event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION',
           'SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT',
           'SORTIE_POUR_ACHEMINEMENT'))
  then raise exception 'LEGACY_RESUME_CYCLE_AMBIGUOUS'; end if;

  if exists(select 1 from public.stockage_payment_orchestrations
      where request_id<>v_row.request_id and agency=v_row.agency and tracking_code=v_row.tracking_code
        and state in ('PENDING','COMPLETED','COMPENSATION_REQUIRED'))
     or exists(select 1 from public.stockage_forwardings
       where original_tracking_code=v_row.tracking_code and destination_agency=v_row.agency)
     or exists(select 1 from public.cash_events
       where source_type='PAYMENT_ENGINE' and (source_request_id=v_row.request_id::text
         or metadata @> jsonb_build_object('commandFingerprint',v_row.command_fingerprint)))
     or exists(select 1 from public.stockage_events where request_id=v_row.request_id)
  then raise exception 'LEGACY_RESUME_EXISTING_EFFECT_OR_COMPETITOR'; end if;

  select * into v_account from public.stockage_accounts where agency=v_row.agency for update;
  if not found or v_account.status<>'ACTIVE' or v_account.current_parcel_count<1
     or v_account.current_weight_kg<v_parcel.canonical_weight_kg
  then raise exception 'LEGACY_RESUME_STOCK_INSUFFICIENT'; end if;

  -- Payment author and canonical date remain the original ones; the resumer is
  -- separately recorded on the orchestration, not substituted into the payment.
  v_cash:=public.record_cash_payment_credit(
    v_row.request_id::text,v_row.tracking_code,v_row.agency,v_row.paid_amount,
    p_business_date,p_canonical_paid_at,v_row.actor_id,v_row.actor_name,v_row.command_fingerprint,
    jsonb_build_object('modePaiement',p_payment_mode,'referencePaiement',v_row.tracking_code,
      'observation',coalesce(p_observation,''),'paymentResult',p_payment_response,
      'orchestratedStockExit',true,'parcelId',v_parcel.parcel_id));
  if coalesce(v_cash->>'eventId','')='' or coalesce((v_cash->>'replayed')::boolean,false)
  then raise exception 'LEGACY_RESUME_CASH_ALREADY_EXISTS'; end if;

  v_hash:=encode(extensions.digest(jsonb_build_object('type','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION',
    'requestId',v_row.request_id,'parcelId',v_parcel.parcel_id,'trackingCode',v_row.tracking_code,
    'agency',v_row.agency,'actorId',v_row.actor_id,'weightKg',v_parcel.canonical_weight_kg)::text,'sha256'),'hex');
  v_event_id:='stockage-paid-exit-'||encode(extensions.digest(v_row.request_id::text,'sha256'),'hex');
  insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,
    weight_kg_delta,tracking_code,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,
    account_version_before,account_version_after,source_type,source_request_id,metadata)
  values(v_event_id,v_account.id,v_row.request_id,'SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION',
    v_row.agency,-1,-v_parcel.canonical_weight_kg,v_row.tracking_code,v_row.actor_id,v_row.actor_name,
    'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,
    'PAYMENT_ENGINE',v_row.request_id::text,jsonb_build_object('cashEventId',v_cash->>'eventId',
      'paymentResult',p_payment_response,'parcelId',v_parcel.parcel_id,
      'resumedBy',p_resumer_id,'resumedAt',clock_timestamp()));
  update public.stockage_parcels set delivery_status='DELIVERED',delivered_event_id=v_event_id,
    delivered_by=v_row.actor_id,delivered_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
    where parcel_id=v_parcel.parcel_id and version=v_parcel.version
      and delivery_status='AVAILABLE';
  if not found then raise exception 'LEGACY_RESUME_PARCEL_CHANGED'; end if;
  update public.stockage_accounts set current_parcel_count=current_parcel_count-1,
    current_weight_kg=current_weight_kg-v_parcel.canonical_weight_kg,
    version=version+1,updated_at=clock_timestamp()
    where id=v_account.id and version=v_account.version;
  if not found then raise exception 'LEGACY_RESUME_ACCOUNT_CHANGED'; end if;
  update public.stockage_payment_orchestrations set resumed_parcel_id=v_parcel.parcel_id,
    payment_created=true,payment_response=p_payment_response,cash_event_id=v_cash->>'eventId',
    stockage_event_id=v_event_id,state='COMPLETED',last_error=null,
    resumed_by=p_resumer_id,resumed_by_name=btrim(v_agent.nom),
    resumed_at=clock_timestamp(),updated_at=clock_timestamp(),
    completed_at=clock_timestamp() where request_id=v_row.request_id and state='PENDING';
  if not found then raise exception 'LEGACY_RESUME_ORCHESTRATION_CHANGED'; end if;
  return jsonb_build_object('state','COMPLETED','replayed',true,'parcelId',v_parcel.parcel_id,
    'eventId',v_event_id,'cashEventId',v_cash->>'eventId');
end $$;

revoke all on function public.finalize_legacy_native_pending_resume(
  uuid,text,uuid,uuid,date,timestamptz,text,text,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function public.finalize_legacy_native_pending_resume(
  uuid,text,uuid,uuid,date,timestamptz,text,text,jsonb,uuid) to service_role;
commit;
