begin;
drop function if exists public.complete_forwarding_manifest_sync_job(uuid,text,text,text,integer,text);
drop function if exists public.claim_forwarding_manifest_sync_jobs(text,integer,integer);
drop index if exists public.stockage_forwarding_manifest_claim_idx;
alter table public.stockage_forwarding_manifest_registry
  drop column if exists lease_until,
  drop column if exists claimed_by,
  drop column if exists claimed_at;
commit;
