import { timingSafeEqual, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { runForwardingManifestWorker } from "@/server/forwarding-manifest-worker";
export const dynamic="force-dynamic"; export const runtime="nodejs"; export const maxDuration=60;
export async function GET(request:Request){
  if(!authorized(request.headers.get("authorization")))return response({success:false,code:"ACCESS_DENIED"},401);
  try{return response({success:true,...await runForwardingManifestWorker(`cron:${randomUUID()}`)},200);}catch(cause){console.error("[forwarding-manifest-cron]",{error:cause instanceof Error?cause.message:"UNKNOWN"});return response({success:false,code:"FORWARDING_WORKER_UNAVAILABLE"},503);}
}
function authorized(header:string|null){const expected=process.env.CRON_SECRET?.trim(),supplied=header?.match(/^Bearer\s+(\S+)$/i)?.[1];if(!expected||!supplied)return false;const a=Buffer.from(expected),b=Buffer.from(supplied);return a.length===b.length&&timingSafeEqual(a,b);}
function response(body:unknown,status:number){const value=NextResponse.json(body,{status});value.headers.set("Cache-Control","private, no-store, max-age=0");return value;}
