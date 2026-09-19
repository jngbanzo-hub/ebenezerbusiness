import {authenticatedRead,readJsonOrThrow,type BrowserAuth} from "@/features/auth/authenticated-fetch";
export type AdminQrLabel={qr_id:string;display_number:number;status:"UNASSIGNED"|"ASSIGNED"|"REVOKED";agency:string|null;tracking_code:string|null;version:number;created_at:string;created_by:string;assigned_at:string|null;assigned_by:string|null;revoked_at:string|null;revoked_by:string|null};
export type AdminQrAudit={event_id:string;action:string;old_agency:string|null;old_tracking_code:string|null;new_agency:string|null;new_tracking_code:string|null;old_status:string;new_status:string;reason:string;actor_id:string;actor_role:string;actor_agency:string|null;occurred_at:string;request_id:string;version_before:number;version_after:number};
export type AdminQrRecord={label:AdminQrLabel;audit:AdminQrAudit[]};
export async function loadAdminQr(auth:BrowserAuth,selector:string){return readJsonOrThrow<AdminQrRecord>(await authenticatedRead(auth,`/api/admin/qr/${encodeURIComponent(selector.trim())}`),"Lecture QR indisponible.");}
export async function correctAdminQr(auth:BrowserAuth,payload:object){return command(auth,"/api/admin/qr/correct",payload);}
export async function revokeAdminQr(auth:BrowserAuth,payload:object){return command(auth,"/api/admin/qr/revoke",payload);}
async function command(auth:BrowserAuth,url:string,payload:object){return readJsonOrThrow<Record<string,unknown>>(await authenticatedRead(auth,url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),"Commande QR refusée.");}
