import { NextResponse } from "next/server";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { isStockagesV2Enabled, recordArrival, requireStorageAgency, StockagesV2Error, validateArrivalParcels } from "@/server/stockages-v2";
import { recordInternalNotification } from "@/server/internal-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return reply("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return reply("ACCESS_DENIED", auth.status);
    requireStorageAgency(auth.identity.site);
    const body = await request.json() as Record<string, unknown>;
    const parcels = validateArrivalParcels(body.parcels);
    const result = await recordArrival({ parcels, reference: String(body.reference ?? ""), observation: String(body.observation ?? ""), requestId: String(body.requestId ?? ""), actorId: auth.identity.userId });
    if (!result.replayed) await recordInternalNotification({ eventKey: `STORAGE_ARRIVAL:${String(body.requestId)}`, agency: auth.identity.site as "FIH"|"LSHI"|"KLZ", type: "STORAGE_ARRIVAL", title: "Arrivage enregistré", message: `${parcels.length} colis / ${parcels.reduce((sum, parcel) => sum + parcel.weightKg, 0)} kg`, actorUserId: auth.identity.userId, actorName: auth.identity.nom }).catch(() => undefined);
    return NextResponse.json({ state: "SUCCESS", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (cause) { return cause instanceof StockagesV2Error ? reply(cause.code, cause.status) : reply("STORAGE_SERVICE_UNAVAILABLE", 503); }
}
function reply(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: code === "STORAGE_ACCOUNT_NOT_ACTIVE" ? "Stockage non ouvert — solde initial requis" : "Commande Stockages refusée." }, { status }); }
