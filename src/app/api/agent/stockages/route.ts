import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { isStockagesV2Enabled, readAgentStorage, requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";
import { OperationPerformanceTrace } from "@/server/operation-performance";
import { isForwardingEnabled } from "@/server/forwarding-feature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestStartedAt = performance.now();
  let trace: OperationPerformanceTrace | null = null;
  try {
    if (!isStockagesV2Enabled()) return error("STORAGE_V2_DISABLED", 503);
    const authStartedAt = performance.now();
    const authorization = await authorizeAgentRequest(request);
    if (!authorization.authorized) return error("ACCESS_DENIED", authorization.status);
    trace = new OperationPerformanceTrace("arrivages", crypto.randomUUID(), authorization.identity.site, requestStartedAt);
    trace.add("auth_session", performance.now() - authStartedAt);
    const result = await readAgentStorage(requireStorageAgency(authorization.identity.site), trace);
    const responseStartedAt = performance.now();
    const response = json({ ...result, forwardingEnabled: isForwardingEnabled() });
    trace.add("reponse_serveur", performance.now() - responseStartedAt);
    trace.complete("success");
    response.headers.set("Server-Timing", trace.serverTiming());
    return response;
  } catch (cause) {
    trace?.complete("error");
    return handle(cause);
  }
}

function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } }); }
function error(code: string, status: number) { return json({ state: "ERROR", code, message: messageFor(code) }, status); }
function handle(cause: unknown) { return cause instanceof StockagesV2Error ? error(cause.code, cause.status) : error("STORAGE_SERVICE_UNAVAILABLE", 503); }
function messageFor(code: string) { return code === "STORAGE_AGENCY_NOT_SUPPORTED" ? "COO est hors périmètre Stockages." : code === "STORAGE_V2_DISABLED" ? "Stockages V2 est désactivé." : "Le service Stockages est temporairement indisponible."; }
