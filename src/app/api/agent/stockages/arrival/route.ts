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
    const body = await request.json() as Record<string, unknown>;
    const parcels = validateArrivalParcels(body.parcels);
    const agency = requireStorageAgency(auth.identity.site);
    const result = await recordArrival({ parcels, reference: String(body.reference ?? ""), observation: String(body.observation ?? ""), requestId: String(body.requestId ?? ""), actorId: auth.identity.userId, agency });
    if (!result.replayed) {
      const eventId = result.eventId ?? String(body.requestId);
      const summary = `${parcels.length} colis / ${parcels.reduce((sum, parcel) => sum + parcel.weightKg, 0)} kg`;
      const reference = String(body.reference ?? "").trim();
      await Promise.allSettled([
        recordInternalNotification({ eventKey: `stock_arrival:${eventId}:admin`, agency, audience: "ADMIN", type: "STORAGE_ARRIVAL", title: "Arrivage Stockage enregistré", message: `${agency} a enregistré un nouvel arrivage : ${summary}.${reference ? ` Référence : ${reference}.` : ""}`, actorUserId: auth.identity.userId, actorName: auth.identity.nom }),
        recordInternalNotification({ eventKey: `stock_arrival:${eventId}:coo`, agency: "COO", audience: "AGENT", type: "STORAGE_ARRIVAL", title: `Arrivage confirmé à ${agency}`, message: `${agency} a confirmé la réception physique de ${summary}.${reference ? ` Référence : ${reference}.` : ""}`, actorUserId: auth.identity.userId, actorName: auth.identity.nom })
      ]);
    }
    return NextResponse.json({ state: "SUCCESS", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (cause) { return cause instanceof StockagesV2Error ? reply(cause.code, cause.status, cause.diagnosticId) : reply("STORAGE_SERVICE_UNAVAILABLE", 503); }
}
function reply(code: string, status: number, diagnosticId?: string) { return NextResponse.json({ state: "ERROR", code, message: code === "STORAGE_ACCOUNT_NOT_ACTIVE" ? "Stockage non ouvert — solde initial requis" : "Commande Stockages refusée.", ...(diagnosticId ? { diagnosticId } : {}) }, { status }); }
