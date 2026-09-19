import { NextResponse } from "next/server";
import { qrBatchConfirmationSchema as schema } from "@/server/qr-batch-confirmation-schema";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { assignQrBatchInternally, bounded } from "@/server/qr-batch-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  try {
    const authStartedAt = Date.now();
    const auth = await bounded(() => authorizeAgentRequest(request), 5_000);
    console.info("[qr-batch-assignment]", JSON.stringify({
      step: "AUTHORIZATION",
      durationMs: Date.now() - authStartedAt,
      success: auth.authorized
    }));
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    if (auth.identity.site !== "COO") return fail("QR_AGENCY_ACCESS_DENIED", 403);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("INVALID_QR_BATCH", 400);
    const result = await assignQrBatchInternally(auth.identity.userId, parsed.data.lines, parsed.data.batchId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (cause) {
    console.error("[qr-batch-assignment]", JSON.stringify({
      step: "BATCH_FAILURE",
      success: false,
      code: "QR_BATCH_UNAVAILABLE"
    }));
    return fail("QR_SERVICE_UNAVAILABLE", 503);
  }
}

function fail(code: string, status: number) {
  return NextResponse.json(
    { state: "ERROR", code },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
