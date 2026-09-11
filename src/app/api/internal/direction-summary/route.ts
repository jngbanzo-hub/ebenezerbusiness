import { NextResponse } from "next/server";

import { authorizeDirectionServiceRequest } from "@/server/direction-summary-auth";
import { readDirectionSummary } from "@/server/direction-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = authorizeDirectionServiceRequest(request);
  if (!authorization.authorized) return response({ error: { code: authorization.code } }, authorization.status);
  return response(await readDirectionSummary(), 200);
}

function response(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
