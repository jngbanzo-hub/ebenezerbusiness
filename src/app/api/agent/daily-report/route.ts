import { authorizeAgentRequest } from "@/server/agent-authorization";
import { readDailyReport } from "@/server/daily-report-source";
import { parseAdminReportPeriod } from "@/server/daily-report-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAgentRequest(request);
    if (!auth.authorized) return Response.json({ message: "Accès refusé." }, { status: auth.status });
    const period = parseAdminReportPeriod(request);
    return Response.json(await readDailyReport({ from: period.from, to: period.to, agencies: [auth.identity.site], actor: { userId: auth.identity.userId, email: auth.identity.email, agency: auth.identity.site }, includePrivateNotes: false }), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ message: "Rapport journalier indisponible." }, { status: 503 }); }
}
