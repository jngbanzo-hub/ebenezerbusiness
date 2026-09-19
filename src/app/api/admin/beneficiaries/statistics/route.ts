import { NextResponse } from "next/server";
import { calculateBeneficiaryStatistics } from "@/features/admin/beneficiaries";
import { isValidAdminDateRange } from "@/features/admin/period";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminManifestRows } from "@/server/admin-manifest-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return response({ message: authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit." }, authorization.status);
  const params = new URL(request.url).searchParams;
  const startDate = params.get("from") ?? ""; const endDate = params.get("to") ?? "";
  if (!isValidAdminDateRange({ startDate, endDate })) return response({ message: "Période invalide." }, 400);
  try { return response({ statistics: calculateBeneficiaryStatistics(await readAdminManifestRows(), startDate, endDate) }, 200); }
  catch { return response({ message: "Le classement des bénéficiaires est temporairement indisponible." }, 503); }
}
function response(body: object, status: number) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
