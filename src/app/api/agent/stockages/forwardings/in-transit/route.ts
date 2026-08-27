import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { forwardingAgentMessage } from "@/server/stockages-forwarding-errors";
import { readDestinationInTransitForwardings } from "@/server/stockages-forwarding-in-transit";
import { requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const url = new URL(request.url);
    if (url.searchParams.has("agency")) return fail("INVALID_FORWARDING_QUERY", 400);
    const agency = requireStorageAgency(auth.identity.site);
    const items = await readDestinationInTransitForwardings(agency);
    return NextResponse.json({ state: "SUCCESS", agency, items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("FORWARDING_SERVICE_UNAVAILABLE", 503);
  }
}

function fail(code: string, status: number) {
  return NextResponse.json({ state: "ERROR", code, message: forwardingAgentMessage(code) }, { status, headers: { "Cache-Control": "private, no-store" } });
}
