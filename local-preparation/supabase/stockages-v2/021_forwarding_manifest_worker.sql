begin;

do $$
begin
  if to_regclass('public.stockage_forwarding_manifest_registry') is null
    or to_regprocedure('public.reconcile_forwarding_manifest_registry(uuid)') is null then
    raise exception 'MIGRATION_019_020_REQUIRED';
  end if;
end $$;

alter table public.stockage_forwarding_manifest_registry
  add column claimed_at timestamptz null,
  add column claimed_by text null,
  add column lease_until timestamptz null;

create index stockage_forwarding_manifest_claim_idx
  on public.stockage_forwarding_manifest_registry(sync_state,next_retry_at,lease_until,updated_at)
  where sync_state in ('PENDING','RETRY','AWAITING_MANIFEST_IDENTITY');

create function public.claim_forwarding_manifest_sync_jobs(
  p_worker_id text,
  p_batch_size integer default 10,
  p_lease_seconds integer default 600
) returns setof public.stockage_forwarding_manifest_registry
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if nullif(btrim(p_worker_id),'') is null
    or p_batch_size not between 1 and 25
    or p_lease_seconds not between 60 and 900 then
    raise exception 'INVALID_WORKER_CLAIM';
  end if;
  return query
  with eligible as (
    select registry_id
    from public.stockage_forwarding_manifest_registry
    where sync_state in ('PENDING','RETRY','AWAITING_MANIFEST_IDENTITY')
      and not (sync_state='RETRY' and sync_attempt_count>=8 and next_retry_at is null)
      and (next_retry_at is null or next_retry_at<=clock_timestamp())
      and (lease_until is null or lease_until<=clock_timestamp())
    order by coalesce(next_retry_at,updated_at),registry_id
    for update skip locked
    limit p_batch_size
  )
  update public.stockage_forwarding_manifest_registry r
  set claimed_at=clock_timestamp(),claimed_by=p_worker_id,
      lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
      last_sync_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
  from eligible e where r.registry_id=e.registry_id
  returning r.*;
end $$;

create function public.complete_forwarding_manifest_sync_job(
  p_registry_id uuid,
  p_worker_id text,
  p_outcome text,
  p_error_code text default null,
  p_manifest_source_row integer default null,
  p_manifest_source_fingerprint text default null
) returns public.stockage_forwarding_manifest_registry
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.stockage_forwarding_manifest_registry; v_attempt integer; v_delay integer;
begin
  select * into v_row from public.stockage_forwarding_manifest_registry
  where registry_id=p_registry_id for update;
  if not found then raise exception 'SYNC_JOB_NOT_FOUND'; end if;
  if v_row.claimed_by is distinct from p_worker_id or v_row.lease_until<=clock_timestamp() then
    raise exception 'SYNC_JOB_LEASE_INVALID';
  end if;
  if p_outcome='SYNCED' then
    update public.stockage_forwarding_manifest_registry set
      sync_state='SYNCED',resolution_state='CERTIFIED',manifest_source_row=coalesce(p_manifest_source_row,manifest_source_row),
      manifest_source_fingerprint=coalesce(p_manifest_source_fingerprint,manifest_source_fingerprint),
      last_sync_error_code=null,next_retry_at=null,synced_at=clock_timestamp(),
      claimed_at=null,claimed_by=null,lease_until=null,updated_at=clock_timestamp()
    where registry_id=p_registry_id returning * into v_row;
  elsif p_outcome='AMBIGUOUS' then
    update public.stockage_forwarding_manifest_registry set sync_state='AMBIGUOUS',resolution_state='AMBIGUOUS',
      manifest_source_row=null,manifest_source_date=null,manifest_source_fingerprint=null,
      last_sync_error_code='MANIFEST_SOURCE_AMBIGUOUS',next_retry_at=null,
      claimed_at=null,claimed_by=null,lease_until=null,updated_at=clock_timestamp()
    where registry_id=p_registry_id returning * into v_row;
  elsif p_outcome='AWAITING_MANIFEST_IDENTITY' then
    update public.stockage_forwarding_manifest_registry set sync_state='AWAITING_MANIFEST_IDENTITY',resolution_state='PENDING',
      manifest_source_row=null,manifest_source_date=null,manifest_source_fingerprint=null,
      last_sync_error_code=coalesce(nullif(p_error_code,''),'MANIFEST_IDENTITY_NOT_READY'),next_retry_at=null,
      claimed_at=null,claimed_by=null,lease_until=null,updated_at=clock_timestamp()
    where registry_id=p_registry_id returning * into v_row;
  elsif p_outcome='RETRY' then
    v_attempt:=v_row.sync_attempt_count+1;
    v_delay:=least(60,(power(2,least(v_attempt-1,6)))::integer);
    update public.stockage_forwarding_manifest_registry set sync_state='RETRY',sync_attempt_count=v_attempt,
      last_sync_error_code=case when v_attempt>=8 then 'ADMIN_INTERVENTION_REQUIRED:'||coalesce(nullif(p_error_code,''),'MANIFEST_SYNC_UNAVAILABLE') else coalesce(nullif(p_error_code,''),'MANIFEST_SYNC_UNAVAILABLE') end,
      next_retry_at=case when v_attempt>=8 then null else clock_timestamp()+make_interval(mins=>v_delay) end,
      claimed_at=null,claimed_by=null,lease_until=null,updated_at=clock_timestamp()
    where registry_id=p_registry_id returning * into v_row;
  else raise exception 'INVALID_SYNC_OUTCOME'; end if;
  return v_row;
end $$;

revoke all on function public.claim_forwarding_manifest_sync_jobs(text,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_forwarding_manifest_sync_job(uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.claim_forwarding_manifest_sync_jobs(text,integer,integer) to service_role;
grant execute on function public.complete_forwarding_manifest_sync_job(uuid,text,text,text,integer,text) to service_role;

commit;
