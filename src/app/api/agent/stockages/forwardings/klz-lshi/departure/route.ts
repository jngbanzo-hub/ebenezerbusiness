import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { confirmKlzLshiDeparture, isKlzLshiDepartureEnabled, readKlzLshiDepartureQuote } from "@/server/klz-lshi-departure";
import { StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth=await authorizeAgentRequest(request); if(!auth.authorized)return fail("ACCESS_DENIED",auth.status);
    if(auth.identity.site!=="KLZ")return fail("WRONG_AGENCY",403);
    if(!isKlzLshiDepartureEnabled())return fail("KLZ_LSHI_DEPARTURE_DISABLED",503);
    const quote=await readKlzLshiDepartureQuote(new URL(request.url).searchParams.get("trackingCode")??"");
    return NextResponse.json({state:"SUCCESS",quote},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return error instanceof StockagesV2Error?fail(error.code,error.status):fail("KLZ_LSHI_DEPARTURE_UNAVAILABLE",503); }
}

export async function POST(request: Request) {
  try {
    const auth=await authorizeAgentRequest(request); if(!auth.authorized)return fail("ACCESS_DENIED",auth.status);
    if(auth.identity.site!=="KLZ")return fail("WRONG_AGENCY",403);
    if(!isKlzLshiDepartureEnabled())return fail("KLZ_LSHI_DEPARTURE_DISABLED",503);
    const body=await request.json() as Record<string,unknown>;
    if(Object.keys(body).some((key)=>!["trackingCode","weightKg","forwardingReference","requestId"].includes(key)))return fail("INVALID_KLZ_LSHI_DEPARTURE",400);
    const result=await confirmKlzLshiDeparture({trackingCode:String(body.trackingCode??""),weightKg:Number(body.weightKg),forwardingReference:String(body.forwardingReference??""),requestId:String(body.requestId??""),actorId:auth.identity.userId});
    return NextResponse.json({state:"SUCCESS",...result},{status:result.replayed?200:201,headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return error instanceof StockagesV2Error?fail(error.code,error.status):fail("KLZ_LSHI_DEPARTURE_UNAVAILABLE",503); }
}

function fail(code:string,status:number){const messages:Record<string,string>={KLZ_LSHI_DEPARTURE_DISABLED:"L’acheminement KLZ vers LSHI n’est pas activé.",FORWARDING_NOT_READY_FOR_DEPARTURE:"Le paiement d’acheminement LSHI doit être certifié avant le départ.",PARCEL_NOT_IN_STOCK:"Ce colis n’est plus présent dans le Stockage KLZ.",PARCEL_WEIGHT_MISMATCH:"Le poids du colis a changé. Relancez la recherche.",FORWARDING_ALREADY_DEPARTED:"Ce départ a déjà été confirmé.",WRONG_AGENCY:"Cette action est réservée à KLZ.",IDEMPOTENCY_CONFLICT:"Cette demande correspond à un autre départ."};return NextResponse.json({state:"ERROR",code,message:messages[code]??"Le départ KLZ vers LSHI a été refusé."},{status,headers:{"Cache-Control":"private, no-store"}});}
