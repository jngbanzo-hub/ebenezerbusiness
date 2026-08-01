import { NextResponse } from "next/server";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { recordForwardingArrival } from "@/server/stockages-forwarding";
import { StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function POST(request: Request) { try { const auth=await authorizeAgentRequest(request); if(!auth.authorized)return fail("ACCESS_DENIED",auth.status); const body=await request.json() as Record<string,unknown>; if(Object.keys(body).some((key)=>!["forwardingReference","requestId","confirmed"].includes(key))||body.confirmed!==true)return fail("INVALID_FORWARDING_ARRIVAL",400); const result=await recordForwardingArrival({forwardingReference:String(body.forwardingReference??""),requestId:String(body.requestId??""),actorId:auth.identity.userId,actorAgency:auth.identity.site}); return NextResponse.json({state:"SUCCESS",...result},{status:result.replayed?200:201}); } catch(cause){return cause instanceof StockagesV2Error?fail(cause.code,cause.status):fail("FORWARDING_SERVICE_UNAVAILABLE",503);} }
function fail(code:string,status:number){return NextResponse.json({state:"ERROR",code,message:code==="WRONG_AGENCY"?"Cet acheminement n’est pas destiné à votre agence.":"L’arrivage de l’acheminement a été refusé."},{status});}
