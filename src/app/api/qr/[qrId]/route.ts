import { NextResponse } from "next/server";

import { resolvePublicQr } from "@/server/public-qr-resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "public, no-store, max-age=0" };

export async function GET(_request: Request, { params }: { params: { qrId: string } }) {
  const resolution = await resolvePublicQr(params.qrId);
  const status =
    resolution.state === "INVALID"
      ? 400
      : resolution.state === "UNKNOWN" || resolution.state === "TRACKING_NOT_FOUND"
        ? 404
        : resolution.state === "UNAVAILABLE"
          ? 503
          : 200;

  return NextResponse.json(resolution, { status, headers });
}
