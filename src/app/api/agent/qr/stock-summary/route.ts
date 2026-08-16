import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { readQrStockSummary } from "@/server/qr-stock-summary";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail(auth.status);
    if (auth.identity.site !== "COO") return fail(403);
    return NextResponse.json(await readQrStockSummary(), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ code: "QR_SERVICE_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}

function fail(status: 401 | 403) {
  return NextResponse.json({ code: "ACCESS_DENIED" }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
