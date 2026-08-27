import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { forwardingAgentMessage } from "@/server/stockages-forwarding-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authorizeAgentRequest(request);
  if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
  return fail("FORWARDING_PAYMENT_BEFORE_ARRIVAL_FORBIDDEN", 409);
}

function fail(code: string, status: number) {
  return NextResponse.json(
    { state: "ERROR", code, message: forwardingAgentMessage(code) },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}
