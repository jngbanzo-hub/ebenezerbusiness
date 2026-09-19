import { authorizeAgentRequest } from "@/server/agent-authorization";
import { createServerCashDashboardSource } from "@/server/cash-dashboard-source";
import { getPortoNovoBusinessDate } from "@/features/cash/cash-dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAgentRequest(request);
    if (!authorization.authorized) return error(authorization.status, authorization.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN");
    if (authorization.identity.site === "COO") return Response.json({ businessDate: getPortoNovoBusinessDate(), cash: null, outsideCash: true }, noStore());
    const businessDate = getPortoNovoBusinessDate();
    const cash = await createServerCashDashboardSource().readAgent(authorization.identity.site, businessDate);
    return Response.json({ businessDate, cash, outsideCash: false }, noStore());
  } catch { return error(503, "CASH_UNAVAILABLE"); }
}

function error(status: number, code: string) { return Response.json({ error: { code, message: status === 503 ? "La Caisse est temporairement indisponible." : "Accès refusé." } }, { status, ...noStore() }); }
function noStore() { return { headers: { "Cache-Control": "private, no-store, max-age=0" } }; }
