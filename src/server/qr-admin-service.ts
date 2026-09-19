import "server-only";

import { createClient } from "@supabase/supabase-js";

function client() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(); const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if(!url||!key) throw new Error("QR_SERVICE_UNAVAILABLE");
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}).schema("public");
}

export async function readAdminQr(actorId:string,selector:string) {
  const {data,error}=await client().rpc("read_qr_admin_server",{
    p_actor_id:actorId,
    p_selector:selector.trim().toUpperCase()
  });
  if(error){
    console.error("[admin-qr] read_qr_admin_server failed",{code:error.code,message:error.message});
    throw new Error("QR_SERVICE_UNAVAILABLE");
  }
  return data;
}

export async function correctAdminQr(input:{actorId:string;qrId:string;agency:string;trackingCode:string;reason:string;expectedVersion:number;requestId:string}) {
  const startedAt=performance.now();
  const {data,error}=await client().rpc("correct_qr_assignment_server",{p_actor_id:input.actorId,p_qr_id:input.qrId,p_new_agency:input.agency,p_new_tracking_code:input.trackingCode,p_reason:input.reason,p_expected_version:input.expectedVersion,p_request_id:input.requestId});
  if(error){
    console.error("[admin-qr-correct-trace]",{requestId:input.requestId,step:"RPC_CORRECTION_END",startedAt:new Date(Date.now()-(performance.now()-startedAt)).toISOString(),durationMs:Math.round(performance.now()-startedAt),status:"error",code:readCode(error.message),externalStatus:null,upstreamCode:error.code});
    throw new Error(readCode(error.message));
  }
  console.info("[admin-qr-correct-trace]",{requestId:input.requestId,step:"RPC_CORRECTION_END",startedAt:new Date(Date.now()-(performance.now()-startedAt)).toISOString(),durationMs:Math.round(performance.now()-startedAt),status:"success",code:null,externalStatus:null});
  return data;
}
export async function revokeAdminQr(input:{actorId:string;qrId:string;reason:string;expectedVersion:number;requestId:string}) {
  const {data,error}=await client().rpc("revoke_qr_label_server",{p_actor_id:input.actorId,p_qr_id:input.qrId,p_reason:input.reason,p_expected_version:input.expectedVersion,p_request_id:input.requestId});
  if(error) throw new Error(readCode(error.message)); return data;
}
function readCode(message:string){return ["QR_ADMIN_REQUIRED","QR_NOT_FOUND","QR_NOT_ASSIGNED","QR_REVOKED_TERMINAL","QR_VERSION_CONFLICT","QR_CORRECTION_UNCHANGED","QR_PARCEL_ALREADY_ASSIGNED","QR_IDEMPOTENCY_CONFLICT","INVALID_QR_ADMIN_CORRECTION","INVALID_QR_REVOCATION"].find(code=>message.includes(code))??"QR_SERVICE_UNAVAILABLE";}
