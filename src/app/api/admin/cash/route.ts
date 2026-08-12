import { authorizeAdminRequest } from "@/server/admin-authorization";
import { createServerCashDashboardSource } from "@/server/cash-dashboard-source";
import { getPortoNovoBusinessDate } from "@/features/cash/cash-dashboard";
import { readCooOutsideCashSummary } from "@/server/coo-outside-cash-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) return Response.json({ error: { code: authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" } }, { status: authorization.status });
    const businessDate = getPortoNovoBusinessDate();
    const [dashboard, cooOutsideCash] = await Promise.all([
      createServerCashDashboardSource().readAdmin(businessDate),
      readCooOutsideCashSummary(businessDate, authorization)
    ]);
    return Response.json({ ...dashboard, cooOutsideCash }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch { return Response.json({ error: { code: "CASH_UNAVAILABLE", message: "La Caisse est temporairement indisponible." } }, { status: 503 }); }
}
