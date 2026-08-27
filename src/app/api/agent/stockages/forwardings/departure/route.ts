import { NextResponse } from "next/server";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { departForwarding, readForwardingDepartureQuote, type ForwardingOriginAgency } from "@/server/stockages-forwarding-departure";
import { forwardingAgentMessage } from "@/server/stockages-forwarding-errors";
import { requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const ALLOWED = new Set(["trackingCode", "destinationAgency", "requestId"]);

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    if (auth.identity.site !== "KLZ" && auth.identity.site !== "LSHI") return fail("WRONG_AGENCY", 403);
    const origin = auth.identity.site as ForwardingOriginAgency;
    const url = new URL(request.url);
    const quote = await readForwardingDepartureQuote(url.searchParams.get("trackingCode") ?? "", origin, requireStorageAgency(url.searchParams.get("destinationAgency") ?? ""));
    return NextResponse.json({ state: "SUCCESS", quote }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("FORWARDING_SERVICE_UNAVAILABLE", 503);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    if (auth.identity.site !== "KLZ" && auth.identity.site !== "LSHI") return fail("WRONG_AGENCY", 403);
    const origin = auth.identity.site as ForwardingOriginAgency;
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => !ALLOWED.has(key))) return fail("INVALID_FORWARDING_DEPARTURE", 400);
    const result = await departForwarding({ trackingCode: String(body.trackingCode ?? ""), origin, destination: requireStorageAgency(String(body.destinationAgency ?? "")), requestId: String(body.requestId ?? ""), actorId: auth.identity.userId });
    return NextResponse.json({ state: "SUCCESS", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (cause) {
    return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("FORWARDING_SERVICE_UNAVAILABLE", 503);
  }
}
function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: forwardingAgentMessage(code) }, { status, headers: { "Cache-Control": "private, no-store" } }); }
