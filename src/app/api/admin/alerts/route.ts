import {NextResponse} from "next/server";
import {authorizeAdminRequest} from "@/server/admin-authorization";
import {readAdminAlertCenter} from "@/server/admin-alert-center";
import {markAdminAlertsRead} from "@/server/admin-alert-read-state";
export const dynamic="force-dynamic";export const runtime="nodejs";export const maxDuration=60;
export async function GET(request:Request){try{const auth=await authorizeAdminRequest(request);if(!auth.authorized)return fail(auth.status);return NextResponse.json(await readAdminAlertCenter(auth),{headers:noStore()});}catch(error){logFailure("GET",error);return fail(503);}}
export async function POST(request:Request){try{const auth=await authorizeAdminRequest(request);if(!auth.authorized)return fail(auth.status);const payload=await request.json() as Record<string,unknown>;if(payload.action==="MARK_ALL_READ"){return NextResponse.json({marked:await markAdminAlertsRead(auth.userId,null)},{headers:noStore()});}if(payload.action==="MARK_READ"&&typeof payload.alertId==="string"&&payload.alertId.trim()&&payload.alertId.length<=240){return NextResponse.json({marked:await markAdminAlertsRead(auth.userId,[payload.alertId.trim()])},{headers:noStore()});}return NextResponse.json({code:"INVALID_REQUEST"},{status:400,headers:noStore()});}catch{return fail(503);}}
function fail(status:number){return NextResponse.json({code:status===503?"ADMIN_ALERTS_UNAVAILABLE":"ACCESS_DENIED"},{status,headers:noStore()});}function noStore(){return{"Cache-Control":"private, no-store, max-age=0"};}
function logFailure(method:string,error:unknown){const value=error instanceof Error?{name:error.name,message:error.message}:{name:"UnknownError",message:String(error)};console.error("[admin-alerts]",method,value);}
