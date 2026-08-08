import { NextResponse } from "next/server";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { resolvePaidPhysicalParcel } from "@/server/encaissements-remittance";
import { confirmDelivery, isStockagesV2Enabled, requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";
import { recordInternalNotification } from "@/server/internal-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const body = await request.json() as Record<string, unknown>;
    const agency = requireStorageAgency(auth.identity.site);
    const parcel = await resolvePaidPhysicalParcel(String(body.trackingCode ?? ""), agency);
    const result = await confirmDelivery({ ...parcel, requestId: String(body.requestId ?? ""), physicalConfirmed: body.physicalDeliveryConfirmed === true, actorId: auth.identity.userId, agency });
    if (!result.replayed) await recordInternalNotification({ eventKey: `STORAGE_EXIT:${String(body.requestId)}`, agency, type: "STORAGE_EXIT", title: "Sortie Stockage", message: `${parcel.trackingCode} — ${parcel.weightKg} kg`, actorUserId: auth.identity.userId, actorName: auth.identity.nom }).catch(() => undefined);
    return NextResponse.json({ state: "SUCCESS", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (cause) { return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("STORAGE_SERVICE_UNAVAILABLE", 503); }
}
function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: code === "STORAGE_ACCOUNT_NOT_ACTIVE" ? "Stockage non ouvert — solde initial requis" : "Confirmation de livraison refusée." }, { status }); }
