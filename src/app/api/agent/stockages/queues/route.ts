import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { authorizeAgentRequest } from "@/server/agent-authorization";
import { isStockagesV2Enabled, requireStorageAgency } from "@/server/stockages-v2";
import { parseQueueFilters, readAgentWorkQueue } from "@/server/stockages-work-queues";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const agency = requireStorageAgency(auth.identity.site);
    const client = serviceClient();
    const [{ data: account, error: accountError }, { data: deliveries, error: deliveriesError }] = await Promise.all([
      client.from("stockage_accounts").select("status").eq("agency", agency).single(),
      client.from("stockage_events").select("event_id,tracking_code,agency,business_date,occurred_at,actor_name,weight_kg_delta").eq("agency", agency).eq("event_type", "CONFIRMED_DELIVERY_RECORDED").order("occurred_at", { ascending: false }).limit(500)
    ]);
    if (accountError || deliveriesError) return fail("STORAGE_QUEUE_READ_FAILED", 503);
    const result = await readAgentWorkQueue({ agency, accountActive: account?.status === "ACTIVE", deliveries: deliveries ?? [], filters: parseQueueFilters(new URL(request.url)) });
    return NextResponse.json({ agency, accountStatus: account?.status, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "STORAGE_QUEUE_READ_FAILED";
    return fail(code, code.startsWith("INVALID_") ? 400 : code === "STORAGE_AGENCY_NOT_SUPPORTED" ? 403 : 503);
  }
}

function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error("STORAGE_SERVICE_NOT_CONFIGURED"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public"); }
function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: code === "STORAGE_AGENCY_NOT_SUPPORTED" ? "COO est hors périmètre du Stockage de destination." : "La liste opérationnelle est indisponible." }, { status, headers: { "Cache-Control": "private, no-store" } }); }
