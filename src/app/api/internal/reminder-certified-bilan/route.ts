import { NextResponse } from "next/server";

import { authorizeReminderBilanRead } from "@/server/reminder-bilan-machine-auth";
import { readCertifiedSnapshot } from "@/server/reminder-certified-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Machine-only projection of the already-certified Bilan population. */
export async function GET(request: Request) {
  if (!authorizeReminderBilanRead(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const snapshot = await readCertifiedSnapshot();
    const audit = snapshot.modernManifestAudit;
    if (!audit || !(["FIH", "LSHI", "KLZ"] as const).every(agency => audit.conservation[agency] === "PASS")) {
      throw new Error("UNCERTIFIED_POPULATION");
    }
    const candidates = audit.rows.filter(row => row.state === "PARTIEL" || row.state === "NON PAYÉ" || row.state === "FUTURE DETTE").map(row => ({
      cohort: row.cohort,
      code: row.code,
      agency: row.sourceSheet,
      state: row.state,
      remainingUsd: row.remainingUsd,
      senderName: row.sender,
      beneficiaryName: row.beneficiary,
      physicalIdentities: row.physicalMatches.map(match => ({ parcelId: match.parcelId, forwardingId: match.forwardingId, agency: match.agency }))
    }));
    return NextResponse.json({ certified: true, source: "BILAN_MODERN_MANIFEST_AUDIT", candidates }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "CERTIFIED_SOURCE_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
