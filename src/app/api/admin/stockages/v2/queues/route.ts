import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { isStockagesV2Enabled, requireStorageAgency } from "@/server/stockages-v2";
import { parseQueueFilters, readAgentWorkQueue } from "@/server/stockages-work-queues";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!isStockagesV2Enabled()) return fail("STORAGE_V2_DISABLED", 503);
    const auth = await authorizeAdminRequest(request); if (!auth.authorized) return fail("ACCESS_DENIED", auth.status);
    const url = new URL(request.url); const agency = requireStorageAgency(url.searchParams.get("agency") ?? "");
    const client = serviceClient();
    const [{ data: account, error: accountError }, { data: deliveries, error: deliveriesError }] = await Promise.all([
      client.from("stockage_accounts").select("status").eq("agency", agency).single(),
      client.from("stockage_events").select("tracking_code,agency,business_date,occurred_at,actor_name,weight_kg_delta").eq("agency", agency).eq("event_type", "CONFIRMED_DELIVERY_RECORDED").order("occurred_at", { ascending: false }).limit(500)
    ]);
    if (accountError || deliveriesError) return fail("STORAGE_QUEUE_READ_FAILED", 503);
    return NextResponse.json({ agency, accountStatus: account?.status, ...(await readAgentWorkQueue({ agency, accountActive: account?.status === "ACTIVE", deliveries: deliveries ?? [], filters: parseQueueFilters(url) })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const code = error instanceof Error ? error.message : "STORAGE_QUEUE_READ_FAILED"; return fail(code, code.startsWith("INVALID_") ? 400 : 503); }
}
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error("STORAGE_SERVICE_NOT_CONFIGURED"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public"); }
function fail(code: string, status: number) { return NextResponse.json({ state: "ERROR", code, message: "La vue opérationnelle Admin est indisponible." }, { status }); }
