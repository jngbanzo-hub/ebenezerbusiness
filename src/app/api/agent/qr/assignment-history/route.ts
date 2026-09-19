import { NextResponse } from "next/server";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { readRecentInitialQrAssignments } from "@/server/qr-assignment-history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail(auth.status);
    if (auth.identity.site !== "COO") return fail(403);
    const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return fail(401);
    return NextResponse.json(
      { assignments: await readRecentInitialQrAssignments(token) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json({ code: "QR_HISTORY_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}

function fail(status: 401 | 403) {
  return NextResponse.json({ code: "ACCESS_DENIED" }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
