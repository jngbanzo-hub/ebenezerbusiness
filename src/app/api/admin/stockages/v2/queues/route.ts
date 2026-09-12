import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { isStockagesV2Enabled, requireStorageAgency } from "@/server/stockages-v2";
import { parseQueueFilters, readAdminWorkQueue } from "@/server/stockages-work-queues";
import { readStockagesWorkQueueSource } from "@/server/stockages-work-queue-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAdminRequest(request); if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const url = new URL(request.url); const agency = requireStorageAgency(url.searchParams.get("agency") ?? "");
    const source = await readStockagesWorkQueueSource(agency);
    return NextResponse.json({ agency, accountStatus: source.account?.status, ...(await readAdminWorkQueue({ agency, accountActive: source.account?.status === "ACTIVE", deliveries: source.deliveries, physicalParcels: source.physicalParcels, filters: parseQueueFilters(url) })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const code = error instanceof Error ? error.message : "STORAGE_QUEUE_READ_FAILED"; return fail(code, code.startsWith("INVALID_") ? 400 : 503); }
}
function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: "La vue opérationnelle Admin est indisponible." }, { status }); }
