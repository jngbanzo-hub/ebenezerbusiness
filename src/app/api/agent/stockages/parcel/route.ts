import { NextResponse } from "next/server";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { resolvePaidPhysicalParcel } from "@/server/encaissements-remittance";
import { isStockagesV2Enabled, requireStorageAgency, StockagesV2Error } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const result = await resolvePaidPhysicalParcel(new URL(request.url).searchParams.get("trackingCode") ?? "", requireStorageAgency(auth.identity.site));
    return NextResponse.json({ state: "SUCCESS", parcel: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) { return cause instanceof StockagesV2Error ? fail(cause.code, cause.status) : fail("STORAGE_SERVICE_UNAVAILABLE", 503); }
}
function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: "Recherche du colis impossible." }, { status }); }
