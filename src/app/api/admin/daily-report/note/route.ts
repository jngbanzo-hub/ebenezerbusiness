import { ZodError } from "zod";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { addDailyReportNote } from "@/server/daily-report-note";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if (!auth.authorized) return Response.json({ message: "Accès Admin refusé." }, { status: auth.status });
  try {
    const result = await addDailyReportNote(await request.json(), { userId: auth.userId, name: auth.email });
    return Response.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ message: error instanceof ZodError ? "Note administrative invalide." : "Note administrative indisponible." }, { status: error instanceof ZodError ? 400 : 503 });
  }
}
