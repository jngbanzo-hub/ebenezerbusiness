import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import { readAdminManifestRange } from "@/server/admin-manifest-sheets";
import { adaptManifestParcelRows } from "@/features/admin/bilan/manifest-readers";
import { discoverCohorts } from "@/features/admin/bilan/cohort-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return NextResponse.json({ error: "Accès Admin refusé." }, { status: authorization.status });
  try {
    const reads = await Promise.all((['FIH', 'LSHI', 'KLZ'] as const).map(async (agency) => {
      const rows = await readAdminManifestRange(`${agency}!A2:F`);
      return adaptManifestParcelRows(rows, agency).rows;
    }));
    const cohorts = discoverCohorts(reads.flat());
    return NextResponse.json({ cohorts }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Registre des cohortes temporairement indisponible." }, { status: 503 });
  }
}
