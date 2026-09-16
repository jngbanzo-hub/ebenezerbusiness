import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { bounded, readQrBatchStatus } from "@/server/qr-batch-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;
const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request) {
  try {
    const auth = await bounded(() => authorizeAgentRequest(request), 5_000);
    if (!auth.authorized) return NextResponse.json({ code: "ACCESS_DENIED" }, { status: auth.status, headers });
    if (auth.identity.site !== "COO") return NextResponse.json({ code: "QR_AGENCY_ACCESS_DENIED" }, { status: 403, headers });
    const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("batchId"));
    if (!id.success) return NextResponse.json({ code: "INVALID_QR_BATCH" }, { status: 400, headers });
    const stored = await readQrBatchStatus(auth.identity.userId, id.data);
    // Absence is not proof of rollback: an uncommitted transaction can still be running.
    return NextResponse.json(stored?.result ?? { batchId: id.data, status: "NOT_OBSERVED", lines: [] }, { headers });
  } catch {
    return NextResponse.json({ code: "QR_SERVICE_UNAVAILABLE" }, { status: 503, headers });
  }
}
