import { NextResponse } from "next/server";

import { filterManifestStatistics } from "@/features/admin/manifest-statistics";
import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readManifestStatistics } from "@/server/admin-statistics-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.authorized) return failure(authorization.status === 401 ? "Session invalide ou expirée." : "Accès interdit.", authorization.status);
    const params = new URL(request.url).searchParams;
    const year = parseOptionalInteger(params.get("year"), 2020, 2100);
    const month = parseOptionalInteger(params.get("month"), 1, 12);
    if (year === false || month === false) return failure("Filtres invalides.", 400);
    const statistics = filterManifestStatistics(await readManifestStatistics(), year || undefined, month || undefined);
    return NextResponse.json({ statistics }, { headers: privateHeaders() });
  } catch {
    return failure("Les statistiques du manifeste sont temporairement indisponibles.", 503);
  }
}

function parseOptionalInteger(value: string | null, min: number, max: number) { if (!value) return null; if (!/^\d+$/.test(value)) return false; const parsed = Number(value); return parsed >= min && parsed <= max ? parsed : false; }
function failure(message: string, status: number) { return NextResponse.json({ message }, { status, headers: privateHeaders() }); }
function privateHeaders() { return { "Cache-Control": "private, no-store, max-age=0" }; }
