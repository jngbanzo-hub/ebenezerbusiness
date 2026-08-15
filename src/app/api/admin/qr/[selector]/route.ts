import {NextResponse} from "next/server";
import {authorizeAdminRequest} from "@/server/admin-authorization";
import {readAdminQr} from "@/server/qr-admin-service";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:{selector:string}}){try{const auth=await authorizeAdminRequest(request);if(!auth.authorized)return fail("ACCESS_DENIED",auth.status);const value=await readAdminQr(params.selector);if(!value)return fail("QR_NOT_FOUND",404);return NextResponse.json(value,{headers:{"Cache-Control":"private, no-store"}});}catch{return fail("QR_SERVICE_UNAVAILABLE",503);}}
function fail(code:string,status:number){return NextResponse.json({code},{status,headers:{"Cache-Control":"private, no-store"}});}
