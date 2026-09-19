import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { readForwardingManifestProjectionTraces } from "@/server/forwarding-manifest-projection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return response({ success: false, code: "ACCESS_DENIED" }, 401);
  }
  try {
    const traces = await readForwardingManifestProjectionTraces();
    return response({ success: true, traces }, 200);
  } catch {
    return response({ success: false, code: "FORWARDING_TRACE_SOURCE_UNAVAILABLE" }, 503);
  }
}

function authorized(header: string | null) {
  const expected = process.env.FORWARDING_MANIFEST_SYNC_TOKEN?.trim();
  const supplied = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function response(body: unknown, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "private, no-store, max-age=0");
  result.headers.set("Pragma", "no-cache");
  return result;
}
