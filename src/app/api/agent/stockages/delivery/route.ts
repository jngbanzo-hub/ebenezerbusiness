import { NextResponse } from "next/server";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { resolvePaidPhysicalParcel } from "@/server/encaissements-remittance";
import { confirmDelivery, isStockagesV2Enabled, requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";
import { recordInternalNotification } from "@/server/internal-notifications";
import { logOperationRefusal } from "@/server/operation-refusal-diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = performance.now();
  let requestId = "";
  let agency = "UNKNOWN";
  let stage = "featureFlag";
  try {
    if (!isStockagesV2Enabled()) return refusal("STORAGE_V2_DISABLED", 503, { startedAt, requestId, agency, stage });
    stage = "authorizeAgentRequest";
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return refusal("ACCESS_DENIED", auth.status, { startedAt, requestId, agency, stage });
    agency = auth.identity.site;
    const body = await request.json() as Record<string, unknown>;
    requestId = String(body.requestId ?? "");
    const storageAgency = requireStorageAgency(auth.identity.site);
    stage = "resolvePaidPhysicalParcel";
    const parcel = await resolvePaidPhysicalParcel(String(body.trackingCode ?? ""), storageAgency);
    stage = "confirmDelivery";
    const result = await confirmDelivery({ ...parcel, requestId, physicalConfirmed: body.physicalDeliveryConfirmed === true, actorId: auth.identity.userId, agency: storageAgency });
    if (!result.replayed) await recordInternalNotification({ eventKey: `STORAGE_EXIT:${String(body.requestId)}`, agency: storageAgency, type: "STORAGE_EXIT", title: "Sortie Stockage", message: `${parcel.trackingCode} — ${parcel.weightKg} kg`, actorUserId: auth.identity.userId, actorName: auth.identity.nom }).catch(() => undefined);
    return NextResponse.json({ state: "SUCCESS", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (cause) {
    return cause instanceof StockagesV2Error
      ? refusal(cause.code, cause.status, { startedAt, requestId, agency, stage: cause.technicalStage ?? stage, diagnosticId: cause.diagnosticId, externalHttpStatus: cause.externalHttpStatus })
      : refusal("STORAGE_SERVICE_UNAVAILABLE", 503, { startedAt, requestId, agency, stage });
  }
}
type RefusalContext = { startedAt: number; requestId: string; agency: string; stage: string; diagnosticId?: string; externalHttpStatus?: number };
function refusal(code: string, status: number, context: RefusalContext) {
  const diagnostic = logOperationRefusal({ operation: "DELIVERY", applicationCode: code, httpStatus: status, ...context });
  return NextResponse.json({ state: "ERROR", code, diagnosticId: diagnostic.diagnosticId, message: code === "STORAGE_ACCOUNT_NOT_ACTIVE" ? "Stockage non ouvert — solde initial requis" : "Confirmation de livraison refusée." }, { status });
}
