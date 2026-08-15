import "server-only";

import { createClient } from "@supabase/supabase-js";

function client() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(); const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if(!url||!key) throw new Error("QR_SERVICE_UNAVAILABLE");
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}).schema("public");
}

export async function readAdminQr(selector:string) {
  const normalized=selector.trim().toUpperCase();
  const query=client().from("qr_labels").select("qr_id,display_number,status,agency,tracking_code,version,created_at,created_by,assigned_at,assigned_by,revoked_at,revoked_by");
  const {data:label,error}=/^\d+$/.test(normalized)?await query.eq("display_number",Number(normalized)).maybeSingle():await query.eq("qr_id",normalized).maybeSingle();
  if(error) throw new Error("QR_SERVICE_UNAVAILABLE"); if(!label) return null;
  const {data:audit,error:auditError}=await client().from("qr_audit_events").select("event_id,action,old_agency,old_tracking_code,new_agency,new_tracking_code,old_status,new_status,reason,actor_id,actor_role,actor_agency,occurred_at,request_id,version_before,version_after").eq("qr_id",label.qr_id).order("occurred_at",{ascending:true});
  if(auditError) throw new Error("QR_SERVICE_UNAVAILABLE");
  return {label,audit:audit??[]};
}

export async function correctAdminQr(input:{actorId:string;qrId:string;agency:string;trackingCode:string;reason:string;expectedVersion:number;requestId:string}) {
  const {data,error}=await client().rpc("correct_qr_assignment_server",{p_actor_id:input.actorId,p_qr_id:input.qrId,p_new_agency:input.agency,p_new_tracking_code:input.trackingCode,p_reason:input.reason,p_expected_version:input.expectedVersion,p_request_id:input.requestId});
  if(error) throw new Error(readCode(error.message)); return data;
}
export async function revokeAdminQr(input:{actorId:string;qrId:string;reason:string;expectedVersion:number;requestId:string}) {
  const {data,error}=await client().rpc("revoke_qr_label_server",{p_actor_id:input.actorId,p_qr_id:input.qrId,p_reason:input.reason,p_expected_version:input.expectedVersion,p_request_id:input.requestId});
  if(error) throw new Error(readCode(error.message)); return data;
}
function readCode(message:string){return ["QR_ADMIN_REQUIRED","QR_NOT_FOUND","QR_NOT_ASSIGNED","QR_REVOKED_TERMINAL","QR_VERSION_CONFLICT","QR_CORRECTION_UNCHANGED","QR_PARCEL_ALREADY_ASSIGNED","QR_IDEMPOTENCY_CONFLICT","INVALID_QR_ADMIN_CORRECTION","INVALID_QR_REVOCATION"].find(code=>message.includes(code))??"QR_SERVICE_UNAVAILABLE";}
