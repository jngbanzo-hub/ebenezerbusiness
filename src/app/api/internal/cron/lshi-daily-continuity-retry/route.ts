import { NextResponse } from "next/server";

import { isAuthorizedInternalCron } from "@/server/internal-cron-authorization";
import { runLshiOperationalReconciliation } from "@/server/lshi-operational-reconciliation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedInternalCron(request.headers.get("authorization"))) return NextResponse.json({ success: false, code: "ACCESS_DENIED" }, { status: 401 });
  try {
    const result = await runLshiOperationalReconciliation("DAILY_RETRY");
    return NextResponse.json({ success: true, status: result.status, anomalyCount: "anomalies" in result ? result.anomalies.length : 0 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ success: false, code: "LSHI_DAILY_CONTINUITY_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
