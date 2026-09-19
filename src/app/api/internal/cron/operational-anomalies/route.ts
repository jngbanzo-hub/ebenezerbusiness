import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { readOperationalAnomalies } from "@/server/operational-anomalies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ success: false, code: "ACCESS_DENIED" }, { status: 401 });
  const result = await readOperationalAnomalies();
  console.info("[operational-anomalies-metrics]", JSON.stringify(result.metrics));
  return NextResponse.json({ success: true, generatedAt: result.generatedAt, anomalyCount: result.anomalies.length, metrics: result.metrics }, { headers: { "Cache-Control": "private, no-store" } });
}

function authorized(header: string | null) { const expected = process.env.CRON_SECRET?.trim(), supplied = header?.match(/^Bearer\s+(\S+)$/i)?.[1]; if (!expected || !supplied) return false; const left = Buffer.from(expected), right = Buffer.from(supplied); return left.length === right.length && timingSafeEqual(left, right); }
