import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { resolveInterAgencyQuote } from "@/server/inter-agency-routing";
import { readForwardingReadiness, readForwardingResume } from "@/server/stockages-forwarding";
import { requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";
import { forwardingAgentMessage } from "@/server/stockages-forwarding-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const url = new URL(request.url);
    const destination = requireStorageAgency(auth.identity.site);
    const quote = await resolveInterAgencyQuote({
      trackingCode: url.searchParams.get("trackingCode") ?? "",
      origin: requireStorageAgency(url.searchParams.get("sourceAgency") ?? ""),
      destination
    });
    const [readiness, resume] = await Promise.all([
      readForwardingReadiness(destination),
      readForwardingResume({
        trackingCode: quote.trackingCode,
        origin: quote.origin,
        destination: quote.destination,
        amountExpectedUsd: quote.amountExpectedUsd,
        paymentMode: url.searchParams.get("paymentMode") ?? "ESPECES",
        optionalReference: url.searchParams.get("optionalReference") ?? "",
        optionalObservation: url.searchParams.get("optionalObservation") ?? "",
        actorId: auth.identity.userId
      })
    ]);
    return NextResponse.json({ state: "SUCCESS", quote, resume, readiness: { ...readiness, message: readiness.code ? forwardingAgentMessage(readiness.code) : null } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof StockagesV2Error) return fail(error.code, error.status);
    return fail("AGENT_SERVICE_UNAVAILABLE", 503);
  }
}

function fail(code: string, status: number) {
  return NextResponse.json(
    { state: "ERROR", code, message: forwardingAgentMessage(code) },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}
