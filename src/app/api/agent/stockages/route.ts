import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { isStockagesV2Enabled, readAgentStorage, requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return error("STORAGE_V2_DISABLED", 503);
    const authorization = await authorizeAgentRequest(request);
    if (!authorization.authorized) return error("ACCESS_DENIED", authorization.status);
    return json(await readAgentStorage(requireStorageAgency(authorization.identity.site)));
  } catch (cause) {
    return handle(cause);
  }
}

function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } }); }
function error(code: string, status: number) { return json({ state: "ERROR", code, message: messageFor(code) }, status); }
function handle(cause: unknown) { return cause instanceof StockagesV2Error ? error(cause.code, cause.status) : error("STORAGE_SERVICE_UNAVAILABLE", 503); }
function messageFor(code: string) { return code === "STORAGE_AGENCY_NOT_SUPPORTED" ? "COO est hors périmètre Stockages." : code === "STORAGE_V2_DISABLED" ? "Stockages V2 est désactivé." : "Le service Stockages est temporairement indisponible."; }
