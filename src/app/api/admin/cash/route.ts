import { authorizeAdminRequest } from "@/server/admin-authorization";
import { createServerCashDashboardSource } from "@/server/cash-dashboard-source";
import { getPortoNovoBusinessDate } from "@/features/cash/cash-dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) return Response.json({ error: { code: authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" } }, { status: authorization.status });
    const businessDate = getPortoNovoBusinessDate();
    return Response.json(await createServerCashDashboardSource().readAdmin(businessDate), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch { return Response.json({ error: { code: "CASH_UNAVAILABLE", message: "La Caisse est temporairement indisponible." } }, { status: 503 }); }
}
