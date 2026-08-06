import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { createInterAgencyForwarding } from "@/server/stockages-forwarding";
import { forwardingAgentMessage } from "@/server/stockages-forwarding-errors";
import { requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = new Set(["trackingCode", "sourceAgency", "paymentMode", "optionalReference", "optionalObservation", "paymentRequestId"]);

export async function POST(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => !ALLOWED.has(key))) return fail("INVALID_FORWARDING_COMMAND", 400);
    const authorization = request.headers.get("authorization") ?? "";
    const result = await createInterAgencyForwarding({
      trackingCode: String(body.trackingCode ?? ""),
      origin: requireStorageAgency(String(body.sourceAgency ?? "")),
      destination: requireStorageAgency(auth.identity.site),
      paymentMode: String(body.paymentMode ?? ""),
      optionalReference: String(body.optionalReference ?? ""),
      optionalObservation: String(body.optionalObservation ?? ""),
      paymentRequestId: String(body.paymentRequestId ?? ""),
      actorId: auth.identity.userId,
      agentAccessToken: authorization.replace(/^Bearer\s+/i, "")
    });
    return NextResponse.json({ state: "SUCCESS", ...result }, { status: result.replayed ? 200 : 201 });
  } catch (cause) {
    return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("FORWARDING_SERVICE_UNAVAILABLE", 503);
  }
}

function fail(code: string, status: number) {
  return NextResponse.json(
    { state: "ERROR", code, message: forwardingAgentMessage(code) },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}
