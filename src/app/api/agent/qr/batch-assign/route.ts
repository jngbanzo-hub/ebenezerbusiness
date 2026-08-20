import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { assignQrBatchInternally } from "@/server/qr-batch-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lineSchema = z.object({
  lineNumber: z.number().int().positive().safe(),
  displayNumber: z.number().int().positive().safe(),
  agency: z.enum(["FIH", "LSHI", "KLZ"]),
  trackingCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._/-]{1,63}$/),
  expectedVersion: z.number().int().positive().safe(),
  requestId: z.string().uuid()
}).strict();
const schema = z.object({ lines: z.array(lineSchema).min(1).max(100) }).strict();

export async function POST(request: Request) {
  try {
    const authStartedAt = Date.now();
    const auth = await authorizeAgentRequest(request);
    console.info("[qr-batch-assignment]", JSON.stringify({
      step: "AUTHORIZATION",
      durationMs: Date.now() - authStartedAt,
      success: auth.authorized
    }));
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    if (auth.identity.site !== "COO") return fail("QR_AGENCY_ACCESS_DENIED", 403);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("INVALID_QR_BATCH", 400);
    const lines = await assignQrBatchInternally(auth.identity.userId, parsed.data.lines);
    return NextResponse.json({ lines }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (cause) {
    console.error("[qr-batch-assignment]", JSON.stringify({
      step: "BATCH_FAILURE",
      success: false,
      code: cause instanceof Error ? cause.message : "UNKNOWN_ERROR"
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
