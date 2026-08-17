import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readQrStockSummary } from "@/server/qr-stock-summary";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return NextResponse.json({ code: "ACCESS_DENIED" }, { status: auth.status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    const summary = await readQrStockSummary("ADMIN");
    console.info("[qr-stock-summary]", { scope: "ADMIN", ...summary });
    return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ code: "QR_SERVICE_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
