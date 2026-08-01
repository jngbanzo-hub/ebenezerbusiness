import { NextResponse } from "next/server";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { isStockagesV2Enabled, recordArrival, requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return reply("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return reply("ACCESS_DENIED", auth.status);
    requireStorageAgency(auth.identity.site);
    const body = await request.json() as Record<string, unknown>;
    const result = await recordArrival({ parcelCount: Number(body.parcelCount), weightKg: Number(body.weightKg), reference: String(body.reference ?? ""), observation: String(body.observation ?? ""), requestId: String(body.requestId ?? ""), actorId: auth.identity.userId });
    return NextResponse.json({ state: "SUCCESS", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (cause) { return cause instanceof StockagesV2Error ? reply(cause.code, cause.status) : reply("STORAGE_SERVICE_UNAVAILABLE", 503); }
}
function reply(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: code === "STORAGE_ACCOUNT_NOT_ACTIVE" ? "Stockage non ouvert — solde initial requis" : "Commande Stockages refusée." }, { status }); }
