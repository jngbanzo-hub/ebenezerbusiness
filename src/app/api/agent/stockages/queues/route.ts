import { NextResponse } from "next/server";
import { authorizeAgentRequest } from "@/server/agent-authorization";
import { isStockagesV2Enabled, requireStorageAgency } from "@/server/stockages-v2";
import { parseQueueFilters, readAgentWorkQueue } from "@/server/stockages-work-queues";
import { readStockagesWorkQueueSource } from "@/server/stockages-work-queue-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const agency = requireStorageAgency(auth.identity.site);
    const source = await readStockagesWorkQueueSource(agency);
    const result = await readAgentWorkQueue({ agency, accountActive: source.account?.status === "ACTIVE", deliveries: source.deliveries, physicalParcels: source.physicalParcels, filters: parseQueueFilters(new URL(request.url)) });
    return NextResponse.json({ agency, accountStatus: source.account?.status, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "STORAGE_QUEUE_READ_FAILED";
    return fail(code, code.startsWith("INVALID_") ? 400 : code === "STORAGE_AGENCY_NOT_SUPPORTED" ? 403 : 503);
  }
}

function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: code === "STORAGE_AGENCY_NOT_SUPPORTED" ? "COO est hors périmètre du Stockage de destination." : "La liste opérationnelle est indisponible." }, { status, headers: { "Cache-Control": "private, no-store" } }); }
