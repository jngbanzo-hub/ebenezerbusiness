import { authorizeAdminRequest } from "@/server/admin-authorization";
import { allReportAgencies, readDailyReport } from "@/server/daily-report-source";
import { businessDatePortoNovo } from "@/server/stockages-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAdminRequest(request);
    if (!auth.authorized) return Response.json({ message: "Accès refusé." }, { status: auth.status });
    return Response.json(await readDailyReport({ businessDate: businessDatePortoNovo(), agencies: allReportAgencies(), actor: { userId: auth.userId, email: auth.email, agency: auth.agency } }), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ message: "Rapport journalier indisponible." }, { status: 503 }); }
}
