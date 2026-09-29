import { NextResponse } from "next/server";

import { authorizeReminderBilanRead } from "@/server/reminder-bilan-machine-auth";
import { readCertifiedSnapshot } from "@/server/reminder-certified-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Identical to the existing Bilan dry-run contact parsing; this projection
// does not infer a phone from a name or relax recipient eligibility.
function splitContact(value: string | null) {
  const match = value?.trim().match(/^(.*?)\s+((?:243|229)\d{8,9}|0\d{8,10})$/);
  return { name: match?.[1]?.trim() || value?.trim() || null, phone: match?.[2] || null };
}

function normaliseReminderPhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") || "";
  if (/^243\d{9}$/.test(digits)) return digits;
  if (/^229\d{8,10}$/.test(digits)) return digits;
  if (/^0\d{8,10}$/.test(digits)) return `229${digits.slice(1)}`;
  return null;
}

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
    const candidates = audit.rows.filter(row => row.state === "PARTIEL" || row.state === "NON PAYÉ" || row.state === "FUTURE DETTE").map(row => {
      const sender = splitContact(row.sender);
      const beneficiary = splitContact(row.beneficiary);
      const senderPhone = normaliseReminderPhone(sender.phone);
      const beneficiaryPhone = normaliseReminderPhone(beneficiary.phone);
      const singleIdentity = row.physicalMatches.length === 1 ? row.physicalMatches[0] : null;
      return {
        cohort: row.cohort,
        code: row.code,
        agency: row.sourceSheet,
        category: row.state === "FUTURE DETTE" ? "FUTURE" : "CURRENT",
        financialCertified: row.remainingUsd !== null && row.remainingUsd > 0,
        remainingUsd: row.remainingUsd,
        destinationLabel: row.sourceSheet,
        currentAgencyLabel: row.sourceSheet,
        sender: { name: sender.name, phone: senderPhone, eligible: row.state !== "FUTURE DETTE" && senderPhone !== null },
        beneficiary: { name: beneficiary.name, phone: beneficiaryPhone, eligible: row.state !== "FUTURE DETTE" && beneficiaryPhone !== null },
        parcelId: singleIdentity?.parcelId ?? null,
        forwardingId: singleIdentity?.forwardingId ?? null,
        nature: singleIdentity?.parcelId ? singleIdentity.forwardingId ? "FORWARDING" : "NATIF" : null
      };
    });
    return NextResponse.json({ certified: true, source: "BILAN_MODERN_MANIFEST_AUDIT", candidates }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "CERTIFIED_SOURCE_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
