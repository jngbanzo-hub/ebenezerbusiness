-- LOCAL PREPARATION ONLY. Production application requires a separate authorization.
begin;

alter table public.stockage_payment_orchestrations
  add column parcel_id uuid null references public.stockage_parcels(parcel_id) on delete restrict,
  add column forwarding_id uuid null references public.stockage_forwardings(forwarding_id) on delete restrict;
alter table public.stockage_payment_orchestrations add constraint stockage_payment_forwarding_identity_check
  check ((parcel_id is null and forwarding_id is null) or (parcel_id is not null and forwarding_id is not null));
create unique index stockage_payment_forwarding_request_unique
  on public.stockage_payment_orchestrations(forwarding_id)
  where forwarding_id is not null and state<>'FAILED';

drop index public.stockage_events_delivery_unique;
create unique index stockage_events_native_delivery_unique
  on public.stockage_events(agency,tracking_code)
  where event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT')
    and source_type<>'INTER_AGENCY_FORWARDING';
create unique index stockage_events_forwarding_delivery_unique
  on public.stockage_events(source_request_id)
  where event_type in ('CONFIRMED_DELIVERY_RECORDED','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','SORTIE_APRES_REMISE_COLIS_PAYE_COO','SORTIE_APRES_REMISE_ACHEMINEMENT')
    and source_type='INTER_AGENCY_FORWARDING';

create function public.begin_forwarding_destination_payment(
  p_request_id uuid,p_command_fingerprint text,p_parcel_id uuid,p_forwarding_id uuid,
  p_agency text,p_expected_amount numeric,p_paid_amount numeric,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_agent public.agents%rowtype; v_existing public.stockage_payment_orchestrations%rowtype;
 v_parcel public.stockage_parcels%rowtype; v_forwarding public.stockage_forwardings%rowtype;
 v_account public.stockage_accounts%rowtype; v_agency text:=upper(btrim(p_agency));
begin
 select * into v_agent from public.agents where id=p_actor_id;
 if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
 if upper(btrim(v_agent.agence))<>v_agency or v_agency not in ('FIH','LSHI') then raise exception 'WRONG_AGENCY'; end if;
 if p_request_id is null or p_command_fingerprint !~ '^[0-9a-f]{64}$' or p_expected_amount<=0 or p_paid_amount<>p_expected_amount then raise exception 'INVALID_PAID_EXIT_COMMAND'; end if;
 select * into v_existing from public.stockage_payment_orchestrations where request_id=p_request_id for update;
 if found then
   update public.stockage_payment_orchestrations set attempt_count=attempt_count+1,updated_at=clock_timestamp() where request_id=p_request_id;
   if v_existing.command_fingerprint<>p_command_fingerprint or v_existing.parcel_id<>p_parcel_id or v_existing.forwarding_id<>p_forwarding_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('state',v_existing.state,'paymentCreated',v_existing.payment_created,'paymentResponse',v_existing.payment_response,'replayed',v_existing.state='COMPLETED','eventId',v_existing.stockage_event_id);
 end if;
 select * into v_forwarding from public.stockage_forwardings where forwarding_id=p_forwarding_id for update;
 if not found or v_forwarding.destination_agency<>v_agency or v_forwarding.status<>'ARRIVAL_CONFIRMED' or v_forwarding.amount_paid<>0 or v_forwarding.amount_expected<>p_expected_amount then raise exception 'FORWARDING_NOT_READY_FOR_PAYMENT'; end if;
 select * into v_parcel from public.stockage_parcels where parcel_id=p_parcel_id and forwarding_id=p_forwarding_id for update;
 if not found or v_parcel.agency<>v_agency or v_parcel.delivery_status not in ('AVAILABLE','PRESENT') or v_parcel.canonical_weight_kg<>v_forwarding.canonical_weight_kg then raise exception 'PARCEL_NOT_IN_STOCK'; end if;
 select * into v_account from public.stockage_accounts where agency=v_agency for update;
 if not found or v_account.status<>'ACTIVE' or v_account.current_parcel_count<1 or v_account.current_weight_kg<v_parcel.canonical_weight_kg then raise exception 'STOCK_INSUFFICIENT'; end if;
 if not exists(select 1 from public.cash_accounts where agency=v_agency and status='ACTIVE') then raise exception 'CASH_ACCOUNT_NOT_ACTIVE'; end if;
 insert into public.stockage_payment_orchestrations(request_id,command_fingerprint,tracking_code,agency,actor_id,actor_name,expected_amount,paid_amount,parcel_id,forwarding_id)
 values(p_request_id,p_command_fingerprint,v_parcel.tracking_code,v_agency,p_actor_id,btrim(v_agent.nom),p_expected_amount,p_paid_amount,p_parcel_id,p_forwarding_id);
 return jsonb_build_object('state','PENDING','paymentCreated',false,'replayed',false);
end $$;

create function public.finalize_forwarding_destination_payment(
  p_request_id uuid,p_command_fingerprint text,p_business_date date,p_payment_mode text,p_payment_reference text,p_observation text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_row public.stockage_payment_orchestrations%rowtype; v_account public.stockage_accounts%rowtype;
 v_parcel public.stockage_parcels%rowtype; v_forwarding public.stockage_forwardings%rowtype;
 v_cash jsonb; v_event_id text; v_forwarding_event_id text; v_hash text;
begin
 select * into v_row from public.stockage_payment_orchestrations where request_id=p_request_id for update;
 if not found or v_row.forwarding_id is null or v_row.parcel_id is null then raise exception 'PAYMENT_ORCHESTRATION_NOT_FOUND'; end if;
 if v_row.command_fingerprint<>p_command_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 if v_row.state='COMPLETED' then return jsonb_build_object('state','COMPLETED','replayed',true,'eventId',v_row.stockage_event_id,'cashEventId',v_row.cash_event_id); end if;
 if v_row.payment_created is not true or v_row.payment_response is null then raise exception 'PAYMENT_ORCHESTRATION_INCOMPLETE'; end if;
 select * into v_forwarding from public.stockage_forwardings where forwarding_id=v_row.forwarding_id for update;
 select * into v_parcel from public.stockage_parcels where parcel_id=v_row.parcel_id and forwarding_id=v_row.forwarding_id for update;
 if not found or v_parcel.agency<>v_row.agency or v_parcel.delivery_status not in ('AVAILABLE','PRESENT') then raise exception 'PARCEL_NOT_IN_STOCK'; end if;
 if v_forwarding.status<>'ARRIVAL_CONFIRMED' or v_forwarding.destination_agency<>v_row.agency or v_forwarding.amount_paid<>0 or v_forwarding.amount_expected<>v_row.paid_amount then raise exception 'FORWARDING_NOT_READY_FOR_PAYMENT'; end if;
 select * into v_account from public.stockage_accounts where agency=v_row.agency for update;
 if not found or v_account.status<>'ACTIVE' or v_account.current_parcel_count<1 or v_account.current_weight_kg<v_parcel.canonical_weight_kg then raise exception 'STOCK_INSUFFICIENT'; end if;
 v_cash:=public.record_cash_payment_credit(v_row.request_id::text,v_row.tracking_code,v_row.agency,v_row.paid_amount,p_business_date,clock_timestamp(),v_row.actor_id,v_row.actor_name,v_row.command_fingerprint,jsonb_build_object('modePaiement',p_payment_mode,'referencePaiement',coalesce(p_payment_reference,''),'observation',coalesce(p_observation,''),'paymentResult',v_row.payment_response,'forwardingId',v_row.forwarding_id,'parcelId',v_row.parcel_id));
 v_hash:=encode(extensions.digest(jsonb_build_object('type','SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION','requestId',v_row.request_id,'parcelId',v_row.parcel_id,'forwardingId',v_row.forwarding_id,'agency',v_row.agency,'actorId',v_row.actor_id,'weightKg',v_parcel.canonical_weight_kg)::text,'sha256'),'hex');
 v_event_id:='stockage-forwarding-paid-exit-'||encode(extensions.digest(v_row.request_id::text,'sha256'),'hex');
 v_forwarding_event_id:='forwarding-paid-delivery-'||encode(extensions.digest(v_row.request_id::text,'sha256'),'hex');
 insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,weight_kg_delta,tracking_code,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,account_version_before,account_version_after,source_type,source_request_id,metadata)
 values(v_event_id,v_account.id,v_row.request_id,'SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION',v_row.agency,-1,-v_parcel.canonical_weight_kg,v_row.tracking_code,v_row.actor_id,v_row.actor_name,'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,'INTER_AGENCY_FORWARDING',v_row.forwarding_id::text,jsonb_build_object('cashEventId',v_cash->>'eventId','paymentResult',v_row.payment_response,'parcelId',v_row.parcel_id));
 update public.stockage_parcels set delivery_status='DELIVERED',delivered_event_id=v_event_id,delivered_by=v_row.actor_id,delivered_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where parcel_id=v_row.parcel_id and forwarding_id=v_row.forwarding_id and version=v_parcel.version and delivery_status in ('AVAILABLE','PRESENT');
 if not found then raise exception 'PARCEL_ALREADY_DELIVERED'; end if;
 update public.stockage_accounts set current_parcel_count=current_parcel_count-1,current_weight_kg=current_weight_kg-v_parcel.canonical_weight_kg,version=version+1,updated_at=clock_timestamp() where id=v_account.id and version=v_account.version and current_parcel_count>=1 and current_weight_kg>=v_parcel.canonical_weight_kg;
 if not found then raise exception 'STOCK_INSUFFICIENT'; end if;
 update public.stockage_forwardings set amount_paid=amount_expected,cash_event_id=v_cash->>'eventId',status='DELIVERED',delivery_event_id=v_event_id,delivered_by=v_row.actor_id,delivered_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where forwarding_id=v_row.forwarding_id and version=v_forwarding.version and status='ARRIVAL_CONFIRMED';
 if not found then raise exception 'FORWARDING_VERSION_CONFLICT'; end if;
 insert into public.stockage_forwarding_events(event_id,forwarding_id,request_id,event_type,actor_id,actor_name,agency,version_before,version_after,payload_hash,occurred_at,metadata)
 values(v_forwarding_event_id,v_row.forwarding_id,v_row.request_id,'FORWARDING_DELIVERED',v_row.actor_id,v_row.actor_name,v_row.agency,v_forwarding.version,v_forwarding.version+1,v_hash,clock_timestamp(),jsonb_build_object('cashEventId',v_cash->>'eventId','parcelId',v_row.parcel_id));
 update public.stockage_payment_orchestrations set cash_event_id=v_cash->>'eventId',stockage_event_id=v_event_id,state='COMPLETED',last_error=null,updated_at=clock_timestamp(),completed_at=clock_timestamp() where request_id=v_row.request_id;
 return jsonb_build_object('state','COMPLETED','eventId',v_event_id,'cashEventId',v_cash->>'eventId','forwardingId',v_row.forwarding_id,'parcelId',v_row.parcel_id,'replayed',false,'version',v_account.version+1);
end $$;

revoke all on function public.begin_forwarding_destination_payment(uuid,text,uuid,uuid,text,numeric,numeric,uuid),public.finalize_forwarding_destination_payment(uuid,text,date,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_forwarding_destination_payment(uuid,text,uuid,uuid,text,numeric,numeric,uuid),public.finalize_forwarding_destination_payment(uuid,text,date,text,text,text) to service_role;

commit;
