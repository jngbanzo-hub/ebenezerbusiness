-- Isolated, additive Phase A RPC: physical departure KLZ -> LSHI only.
begin;

create function public.confirm_klz_lshi_departure(
 p_tracking_code text,
 p_canonical_weight_kg numeric,
 p_forwarding_reference text,
 p_business_date date,
 p_request_id uuid,
 p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
 v_agent public.agents%rowtype;
 v_forwarding public.stockage_forwardings%rowtype;
 v_orchestration public.stockage_forwarding_orchestrations%rowtype;
 v_parcel public.stockage_parcels%rowtype;
 v_account public.stockage_accounts%rowtype;
 v_existing public.stockage_forwarding_events%rowtype;
 v_code text := upper(btrim(p_tracking_code));
 v_reference text := upper(btrim(p_forwarding_reference));
 v_expected_reference text;
 v_hash text;
 v_forwarding_event_id text;
 v_stockage_event_id text;
begin
 if p_request_id is null or p_actor_id is null or p_business_date is null or p_canonical_weight_kg is null or p_canonical_weight_kg<=0
 or v_code !~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$' then raise exception 'INVALID_KLZ_LSHI_DEPARTURE'; end if;
 v_expected_reference := v_code||'-KLZ-LSHI';
 if v_reference<>v_expected_reference then raise exception 'INVALID_FORWARDING_REFERENCE'; end if;

 select * into v_agent from public.agents where id=p_actor_id for share;
 if not found or v_agent.actif is not true or upper(btrim(v_agent.role))<>'AGENT' then raise exception 'ACTIVE_AGENT_REQUIRED'; end if;
 if upper(btrim(v_agent.agence))<>'KLZ' then raise exception 'WRONG_AGENCY'; end if;

 select * into v_forwarding from public.stockage_forwardings
 where forwarding_reference=v_reference and original_tracking_code=v_code and origin_agency='KLZ' and destination_agency='LSHI' for update;
 if not found then raise exception 'FORWARDING_NOT_READY_FOR_DEPARTURE'; end if;

 v_hash := encode(extensions.digest(jsonb_build_object(
   'type','KLZ_LSHI_DEPARTURE','trackingCode',v_code,'forwardingReference',v_reference,
   'weightKg',p_canonical_weight_kg,'businessDate',p_business_date,'actorId',p_actor_id
 )::text,'sha256'),'hex');

 select * into v_existing from public.stockage_forwarding_events where request_id=p_request_id;
 if found then
   if v_existing.forwarding_id<>v_forwarding.forwarding_id or v_existing.event_type<>'FORWARDING_DEPARTED' or v_existing.payload_hash<>v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('forwardingId',v_forwarding.forwarding_id,'forwardingReference',v_reference,'trackingCode',v_code,'state','IN_TRANSIT','eventId',v_existing.event_id,'replayed',true,'version',v_forwarding.version);
 end if;

 if v_forwarding.status='IN_TRANSIT' then raise exception 'FORWARDING_ALREADY_DEPARTED'; end if;
 if v_forwarding.status<>'PAID_AWAITING_ARRIVAL' or v_forwarding.amount_paid<>v_forwarding.amount_expected then raise exception 'FORWARDING_NOT_READY_FOR_DEPARTURE'; end if;
 if v_forwarding.canonical_weight_kg<>p_canonical_weight_kg then raise exception 'PARCEL_WEIGHT_MISMATCH'; end if;

 select * into v_orchestration from public.stockage_forwarding_orchestrations
 where forwarding_id=v_forwarding.forwarding_id for update;
 if not found or v_orchestration.state<>'PAID_AWAITING_ARRIVAL' or v_orchestration.payment_created is not true then raise exception 'FORWARDING_NOT_READY_FOR_DEPARTURE'; end if;

 select * into v_parcel from public.stockage_parcels
 where agency='KLZ' and tracking_code=v_code for update;
 if not found or v_parcel.delivery_status<>'AVAILABLE' then raise exception 'PARCEL_NOT_IN_STOCK'; end if;
 if v_parcel.canonical_weight_kg<>p_canonical_weight_kg then raise exception 'PARCEL_WEIGHT_MISMATCH'; end if;

 select * into v_account from public.stockage_accounts where agency='KLZ' for update;
 if not found or v_account.status<>'ACTIVE' then raise exception 'STORAGE_ACCOUNT_SUSPENDED'; end if;
 if v_account.current_parcel_count<1 or v_account.current_weight_kg<p_canonical_weight_kg then raise exception 'INSUFFICIENT_STOCK'; end if;

 v_forwarding_event_id := 'forwarding-departure-'||encode(extensions.digest(lower(p_request_id::text),'sha256'),'hex');
 v_stockage_event_id := 'stock-forwarding-departure-'||encode(extensions.digest(lower(p_request_id::text),'sha256'),'hex');

 delete from public.stockage_parcels where agency='KLZ' and tracking_code=v_code and version=v_parcel.version and delivery_status='AVAILABLE';
 if not found then raise exception 'PARCEL_VERSION_CONFLICT'; end if;

 insert into public.stockage_events(event_id,account_id,request_id,event_type,agency,parcel_count_delta,weight_kg_delta,tracking_code,arrival_reference,actor_id,actor_name,actor_role,business_date,occurred_at,payload_hash,account_version_before,account_version_after,source_type,source_request_id,metadata)
 values(v_stockage_event_id,v_account.id,p_request_id,'SORTIE_POUR_ACHEMINEMENT','KLZ',-1,-p_canonical_weight_kg,v_code,v_reference,p_actor_id,btrim(v_agent.nom),'AGENT',p_business_date,clock_timestamp(),v_hash,v_account.version,v_account.version+1,'INTER_AGENCY_FORWARDING',v_forwarding.forwarding_id::text,jsonb_build_object('destinationAgency','LSHI','forwardingReference',v_reference));

 update public.stockage_accounts set current_parcel_count=current_parcel_count-1,current_weight_kg=current_weight_kg-p_canonical_weight_kg,version=version+1,updated_at=clock_timestamp()
 where id=v_account.id and version=v_account.version;
 if not found then raise exception 'STORAGE_VERSION_CONFLICT'; end if;

 insert into public.stockage_forwarding_events(event_id,forwarding_id,request_id,event_type,actor_id,actor_name,agency,version_before,version_after,payload_hash,occurred_at,metadata)
 values(v_forwarding_event_id,v_forwarding.forwarding_id,p_request_id,'FORWARDING_DEPARTED',p_actor_id,btrim(v_agent.nom),'KLZ',v_forwarding.version,v_forwarding.version+1,v_hash,clock_timestamp(),jsonb_build_object('trackingCode',v_code,'destinationAgency','LSHI','stockageEventId',v_stockage_event_id));

 update public.stockage_forwardings set status='IN_TRANSIT',version=version+1,updated_at=clock_timestamp(),metadata=metadata||jsonb_build_object('departureEventId',v_stockage_event_id,'departedAt',clock_timestamp())
 where forwarding_id=v_forwarding.forwarding_id and version=v_forwarding.version and status='PAID_AWAITING_ARRIVAL';
 if not found then raise exception 'FORWARDING_VERSION_CONFLICT'; end if;

 update public.stockage_forwarding_orchestrations set state='IN_TRANSIT',updated_at=clock_timestamp()
 where request_id=v_orchestration.request_id and state='PAID_AWAITING_ARRIVAL';
 if not found then raise exception 'FORWARDING_ORCHESTRATION_CONFLICT'; end if;

 return jsonb_build_object('forwardingId',v_forwarding.forwarding_id,'forwardingReference',v_reference,'trackingCode',v_code,'state','IN_TRANSIT','eventId',v_forwarding_event_id,'stockageEventId',v_stockage_event_id,'replayed',false,'version',v_forwarding.version+1);
end $$;

revoke all on function public.confirm_klz_lshi_departure(text,numeric,text,date,uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_klz_lshi_departure(text,numeric,text,date,uuid,uuid) to service_role;

commit;
