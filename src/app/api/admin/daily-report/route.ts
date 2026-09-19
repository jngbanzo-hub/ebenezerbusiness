import { authorizeAdminRequest } from "@/server/admin-authorization";
import { allReportAgencies, readDailyReport } from "@/server/daily-report-source";
import { parseAdminReportPeriod } from "@/server/daily-report-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return Response.json({ message: "Accès refusé." }, { status: auth.status });
    const period = parseAdminReportPeriod(request);
    return Response.json(await readDailyReport({ from: period.from, to: period.to, agencies: allReportAgencies(), actor: { userId: auth.userId, email: auth.email, agency: auth.agency }, includePrivateNotes: true }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const invalidPeriod = error instanceof Error && error.message.includes("REPORT_PERIOD"); return Response.json({ message: invalidPeriod ? "Période invalide." : "Rapport journalier indisponible." }, { status: invalidPeriod ? 400 : 503 }); }
}
