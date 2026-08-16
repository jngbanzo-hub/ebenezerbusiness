import {NextResponse} from "next/server";
import {authorizeAdminRequest} from "@/server/admin-authorization";
import {readAdminAlertCenter} from "@/server/admin-alert-center";
export const dynamic="force-dynamic";export const runtime="nodejs";export const maxDuration=60;
export async function GET(request:Request){try{const auth=await authorizeAdminRequest(request);if(!auth.authorized)return fail(auth.status);return NextResponse.json(await readAdminAlertCenter(auth),{headers:noStore()});}catch{return fail(503);}}
function fail(status:number){return NextResponse.json({code:status===503?"ADMIN_ALERTS_UNAVAILABLE":"ACCESS_DENIED"},{status,headers:noStore()});}function noStore(){return{"Cache-Control":"private, no-store, max-age=0"};}
