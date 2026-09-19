import "server-only";
import { createClient } from "@supabase/supabase-js";

type Job = Record<string, unknown> & { registry_id:string; sync_state:string };
type Outcome = { outcome:"SYNCED"|"RETRY"|"AMBIGUOUS"|"AWAITING_MANIFEST_IDENTITY"; errorCode?:string; manifestSourceRow?:number; manifestSourceFingerprint?:string };

export async function runForwardingManifestWorker(workerId:string) {
  const started=Date.now(); const client=serviceClient();
  const {data,error}=await client.rpc("claim_forwarding_manifest_sync_jobs",{p_worker_id:workerId,p_batch_size:10,p_lease_seconds:600});
  if(error) throw new Error("FORWARDING_SYNC_CLAIM_FAILED");
  const jobs=(Array.isArray(data)?data:[]) as Job[]; const counters={claimed:jobs.length,synced:0,retry:0,ambiguous:0,awaitingIdentity:0};
  for(const job of jobs){
    let outcome:Outcome;
    try{outcome=await projectThroughAppsScript(job);}catch(cause){outcome={outcome:"RETRY",errorCode:normalizeError(cause)};}
    const result=await client.rpc("complete_forwarding_manifest_sync_job",{
      p_registry_id:job.registry_id,p_worker_id:workerId,p_outcome:outcome.outcome,p_error_code:outcome.errorCode??null,
      p_manifest_source_row:outcome.manifestSourceRow??null,p_manifest_source_fingerprint:outcome.manifestSourceFingerprint??null
    });
    if(result.error) throw new Error("FORWARDING_SYNC_ACK_FAILED");
    if(outcome.outcome==="SYNCED")counters.synced++; else if(outcome.outcome==="RETRY")counters.retry++; else if(outcome.outcome==="AMBIGUOUS")counters.ambiguous++; else counters.awaitingIdentity++;
  }
  return {...counters,durationMs:Date.now()-started};
}

async function projectThroughAppsScript(job:Job):Promise<Outcome>{
  const url=process.env.FORWARDING_MANIFEST_WORKER_APPS_SCRIPT_URL?.trim();
  const token=process.env.FORWARDING_MANIFEST_WORKER_TOKEN?.trim();
  if(!url||!token)throw new Error("FORWARDING_WORKER_NOT_CONFIGURED");
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"PROJECT_FORWARDING_MANIFEST",token,job}),cache:"no-store",signal:AbortSignal.timeout(45_000)});
  if(!response.ok)throw new Error(response.status>=500?"APPS_SCRIPT_UNAVAILABLE":"APPS_SCRIPT_REJECTED");
  const payload=await response.json() as {success?:boolean;outcome?:Outcome["outcome"];errorCode?:string;manifestSourceRow?:number;manifestSourceFingerprint?:string};
  if(!payload.success||!payload.outcome)throw new Error(payload.errorCode??"INVALID_APPS_SCRIPT_RESPONSE");
  return {outcome:payload.outcome,errorCode:payload.errorCode,manifestSourceRow:payload.manifestSourceRow,manifestSourceFingerprint:payload.manifestSourceFingerprint};
}
function serviceClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("FORWARDING_WORKER_DB_NOT_CONFIGURED");return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}).schema("public");}
function normalizeError(cause:unknown){const message=cause instanceof Error?cause.message:"MANIFEST_SYNC_UNAVAILABLE";return /^[A-Z0-9_]+$/.test(message)?message:"MANIFEST_SYNC_UNAVAILABLE";}
