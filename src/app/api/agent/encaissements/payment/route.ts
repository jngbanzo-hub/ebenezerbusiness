import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { recordDestinationPayment } from "@/server/destination-payment-parcel";
import { requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";
import { recordInternalNotification } from "@/server/internal-notifications";
import { OperationPerformanceTrace } from "@/server/operation-performance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const ALLOWED = new Set(["trackingCode", "paymentMode", "paymentReference", "observation", "paymentRequestId"]);

export async function POST(request: Request) {
  let trace: OperationPerformanceTrace | null = null;
  try {
    const authStartedAt = performance.now();
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const body = await request.json() as Record<string, unknown>;
    trace = new OperationPerformanceTrace("encaissement", String(body.paymentRequestId ?? "unknown"), auth.identity.site, authStartedAt);
    trace.add("auth_session", performance.now() - authStartedAt);
    if (Object.keys(body).some((key) => !ALLOWED.has(key))) return fail("INVALID_PAYMENT_COMMAND", 400);
    const result = await recordDestinationPayment({
      trackingCode: String(body.trackingCode ?? ""),
      agency: requireStorageAgency(auth.identity.site),
      paymentMode: String(body.paymentMode ?? ""),
      paymentReference: String(body.paymentReference ?? ""),
      observation: String(body.observation ?? ""),
      paymentRequestId: String(body.paymentRequestId ?? ""),
      agentAccessToken: (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
    }, trace);
    const row = result as Record<string, unknown>;
    if (row.replayed !== true) await trace.measure("notification", () => recordInternalNotification({ eventKey: `PAYMENT:${String(body.paymentRequestId)}`, agency: auth.identity.site, type: "PAYMENT", title: "Paiement enregistré", message: `${String(row.codeColis ?? body.trackingCode)} — ${Number(row.montantPaye ?? 0).toFixed(2)} USD — ${auth.identity.nom}`, actorUserId: auth.identity.userId, actorName: auth.identity.nom }).catch(() => undefined));
    const responseStartedAt = performance.now();
    const nextResponse = NextResponse.json(result, { status: 200 });
    trace.add("reponse_serveur", performance.now() - responseStartedAt);
    trace.complete("success");
    nextResponse.headers.set("Server-Timing", trace.serverTiming());
    return nextResponse;
  } catch (cause) {
    trace?.complete("error");
    return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("AGENT_SERVICE_UNAVAILABLE", 503);
  }
}
function fail(code: string, status: number) { return NextResponse.json({ success: false, code, message: code === "PARCEL_NOT_IN_AGENCY_STORAGE" ? "Ce colis n’est pas présent dans le Stockage de votre agence." : "Paiement refusé." }, { status }); }
