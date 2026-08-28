import { timingSafeEqual, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { runForwardingManifestWorker } from "@/server/forwarding-manifest-worker";
export const dynamic="force-dynamic"; export const runtime="nodejs"; export const maxDuration=60;
export async function POST(request:Request){
  if(!authorized(request.headers.get("authorization")))return reply({success:false,code:"ACCESS_DENIED"},401);
  try{const result=await runForwardingManifestWorker(`vercel:${randomUUID()}`);return reply({success:true,...result},200);}catch(cause){console.error("[forwarding-manifest-worker]",{error:cause instanceof Error?cause.message:"UNKNOWN"});return reply({success:false,code:"FORWARDING_WORKER_UNAVAILABLE"},503);}
}
function authorized(header:string|null){const expected=process.env.FORWARDING_MANIFEST_WORKER_TOKEN?.trim(),supplied=header?.match(/^Bearer\s+(\S+)$/i)?.[1];if(!expected||!supplied)return false;const a=Buffer.from(expected),b=Buffer.from(supplied);return a.length===b.length&&timingSafeEqual(a,b);}
function reply(body:unknown,status:number){const response=NextResponse.json(body,{status});response.headers.set("Cache-Control","private, no-store, max-age=0");return response;}
