import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { executeForwardingCorrection, readForwardingCorrectionPreview } from "@/server/forwarding-admin-correction";
import { requireStorageAgency } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "CORRECTION_READ_UNAVAILABLE";
  const status = code === "CORRECTION_TARGET_NOT_FOUND" ? 404 :
    code === "CORRECTION_NOT_ENABLED" || code === "CORRECTION_READ_UNAVAILABLE" || code === "CORRECTION_TRANSACTION_FAILED" ? 503 : 409;
  return NextResponse.json({ state: "ERROR", code, message: "Correction indisponible. Aucune donnée n’a été modifiée par cette demande." },
    { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.authorized) return NextResponse.json({ state: "ERROR", code: "ACCESS_DENIED" }, { status: auth.status });
  try {
    const params = new URL(request.url).searchParams;
    const preview = await readForwardingCorrectionPreview({
      forwardingId: params.get("forwardingId") ?? "", parcelId: params.get("parcelId") ?? "",
      agency: requireStorageAgency(params.get("agency") ?? "")
    });
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.authorized) return NextResponse.json({ state: "ERROR", code: "ACCESS_DENIED" }, { status: auth.status });
  if (process.env.FORWARDING_ADMIN_CORRECTION_ENABLED !== "true") return failure(new Error("CORRECTION_NOT_ENABLED"));
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await executeForwardingCorrection({
      forwardingId: String(body.forwardingId ?? ""), parcelId: String(body.parcelId ?? ""),
      agency: requireStorageAgency(String(body.agency ?? "")), requestId: String(body.requestId ?? ""),
      reason: String(body.reason ?? ""), physicalConfirmed: body.physicalConfirmed === true,
      actorId: auth.userId
    });
    return NextResponse.json({ state: "COMPLETED", result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
