import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { recordDestinationPayment } from "@/server/destination-payment-parcel";
import { requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";
import { recordInternalNotification } from "@/server/internal-notifications";
import { OperationPerformanceTrace } from "@/server/operation-performance";
import { logOperationRefusal } from "@/server/operation-refusal-diagnostics";
import { reconcileForwardingManifestRegistry } from "@/server/forwarding-manifest-registry";
import { notifyForwardingPayment } from "@/server/forwarding-admin-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const ALLOWED = new Set(["trackingCode", "parcelId", "paymentMode", "paymentReference", "observation", "paymentRequestId"]);
const PAYMENT_AUTH_TIMEOUT_MS = 5_000;

export async function POST(request: Request) {
  const startedAt = performance.now();
  let trace: OperationPerformanceTrace | null = null;
  let requestId = "";
  let agency = "UNKNOWN";
  let stage = "authorizeAgentRequest";
  try {
    const authStartedAt = performance.now();
    const auth = await withPaymentAuthTimeout(authorizeAgentRequest(request));
    if (!auth.authorized) return refusal(auth.status === 401 ? "SESSION_EXPIRED" : "ACCESS_DENIED", auth.status, { startedAt, requestId, agency, stage });
    agency = auth.identity.site;
    const body = await request.json() as Record<string, unknown>;
    requestId = String(body.paymentRequestId ?? "");
    trace = new OperationPerformanceTrace("encaissement", String(body.paymentRequestId ?? "unknown"), auth.identity.site, authStartedAt);
    trace.add("auth_session", performance.now() - authStartedAt);
    if (Object.keys(body).some((key) => !ALLOWED.has(key))) return refusal("INVALID_PAYMENT_COMMAND", 400, { startedAt, requestId, agency, stage: "validatePaymentCommand" });
    stage = "recordDestinationPayment";
    const outcome = await recordDestinationPayment({
      trackingCode: String(body.trackingCode ?? ""),
      parcelId: typeof body.parcelId === "string" ? body.parcelId : undefined,
      agency: requireStorageAgency(auth.identity.site),
      paymentMode: String(body.paymentMode ?? ""),
      paymentReference: String(body.paymentReference ?? ""),
      observation: String(body.observation ?? ""),
      paymentRequestId: String(body.paymentRequestId ?? ""),
      agentAccessToken: (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
    }, trace);
    const result = outcome.payment;
    const row = result as Record<string, unknown>;
    const forwardingId = outcome.forwardingId;
    if (forwardingId) {
      // Post-condition additive: ne doit jamais changer le succès paiement/Caisse.
      await trace.measure("operation_secondaire", async () => {
        await reconcileForwardingManifestRegistry(forwardingId).catch((cause) => {
          console.error("[forwarding-manifest-registry]", { forwardingId, paymentRequestId: requestId, error: cause instanceof Error ? cause.message : "UNKNOWN" });
        });
        if (row.replayed !== true) await notifyForwardingPayment(forwardingId,requestId,{userId:auth.identity.userId,name:auth.identity.nom}).catch(()=>undefined);
      });
    }
    if (row.replayed !== true) await trace.measure("notification", () => recordInternalNotification({ eventKey: `PAYMENT:${String(body.paymentRequestId)}`, agency: auth.identity.site, type: "PAYMENT", title: "Paiement enregistré", message: `${String(row.codeColis ?? body.trackingCode)} — ${Number(row.montantPaye ?? 0).toFixed(2)} USD — ${auth.identity.nom}`, actorUserId: auth.identity.userId, actorName: auth.identity.nom }).catch(() => undefined));
    const responseStartedAt = performance.now();
    const nextResponse = NextResponse.json(result, { status: 200 });
    trace.add("reponse_serveur", performance.now() - responseStartedAt);
    trace.complete("success");
    nextResponse.headers.set("Server-Timing", trace.serverTiming());
    return nextResponse;
  } catch (cause) {
    trace?.complete("error");
    if (cause instanceof PaymentAuthTimeoutError) {
      return refusal("SESSION_EXPIRED", 401, { startedAt, requestId, agency, stage: "authorizeAgentRequest" });
    }
    return cause instanceof StockagesV2Error
      ? refusal(cause.code, cause.status, { startedAt, requestId, agency, stage: cause.technicalStage ?? stage, diagnosticId: cause.diagnosticId, externalHttpStatus: cause.externalHttpStatus })
      : refusal("AGENT_SERVICE_UNAVAILABLE", 503, { startedAt, requestId, agency, stage });
  }
}
type RefusalContext = { startedAt: number; requestId: string; agency: string; stage: string; diagnosticId?: string; externalHttpStatus?: number };
function refusal(code: string, status: number, context: RefusalContext) {
  const diagnostic = logOperationRefusal({ operation: "PAYMENT", applicationCode: code, httpStatus: status, ...context });
  const message = code === "PARCEL_NOT_IN_AGENCY_STORAGE" || code === "PARCEL_NOT_IN_STOCK"
    ? "Ce colis n’est pas présent dans le Stockage de votre agence."
    : code === "SESSION_EXPIRED" || code === "SESSION_EXPIREE" || code === "SESSION_EXPIRED_REFRESHED"
      ? "Votre session a expiré. Veuillez vous reconnecter."
      : "Paiement refusé.";
  return NextResponse.json({ success: false, code, diagnosticId: diagnostic.diagnosticId, message }, { status });
}

async function withPaymentAuthTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new PaymentAuthTimeoutError()), PAYMENT_AUTH_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

class PaymentAuthTimeoutError extends Error {}
