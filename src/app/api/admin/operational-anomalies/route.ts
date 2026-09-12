import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readOperationalAnomalies } from "@/server/operational-anomalies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.authorized) return NextResponse.json({ message: "Accès refusé." }, { status: auth.status });
  return NextResponse.json(await readOperationalAnomalies(), { headers: { "Cache-Control": "private, no-store" } });
}
