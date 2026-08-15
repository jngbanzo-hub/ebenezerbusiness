import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { prevalidateQrBatch } from "@/server/qr-batch-prevalidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  lines: z.array(z.object({
    lineNumber: z.number().int().positive().safe(),
    displayNumber: z.string().max(32),
    agency: z.string().max(16),
    trackingCode: z.string().max(128)
  }).strict()).min(1).max(100)
}).strict();

export async function POST(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    if (auth.identity.site !== "COO") return fail("QR_AGENCY_ACCESS_DENIED", 403);
    const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return fail("ACCESS_DENIED", 401);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("INVALID_QR_BATCH", 400);
    const lines = await prevalidateQrBatch(parsed.data.lines, token);
    return NextResponse.json({ lines }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch {
    return fail("QR_SERVICE_UNAVAILABLE", 503);
  }
}

function fail(code: string, status: number) {
  return NextResponse.json(
    { state: "ERROR", code },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
