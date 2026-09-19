import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { isStockagesV2Enabled, readAdminStorageParcels, requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const agency = requireStorageAgency(new URL(request.url).searchParams.get("agency") ?? "");
    return NextResponse.json(await readAdminStorageParcels(agency), { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("STORAGE_ADMIN_READ_FAILED", 503);
  }
}

function fail(code: string, status: number) {
  return NextResponse.json({ state: "ERROR", code, message: code === "STORAGE_AGENCY_NOT_SUPPORTED" ? "Agence Stockage non prise en charge." : "Détail du Stockage indisponible." }, { status });
}
