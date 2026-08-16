import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { readManifestQrCandidates } from "@/server/qr-manifest-candidates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    if (auth.identity.site !== "COO") return fail("QR_AGENCY_ACCESS_DENIED", 403);
    const result = await readManifestQrCandidates();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch {
    return fail("QR_MANIFEST_CANDIDATES_UNAVAILABLE", 503);
  }
}

function fail(code: string, status: number) {
  return NextResponse.json(
    { state: "ERROR", code },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
