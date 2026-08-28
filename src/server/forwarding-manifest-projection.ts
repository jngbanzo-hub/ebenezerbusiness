import "server-only";

import { createClient } from "@supabase/supabase-js";

type RegistryRow = Readonly<{
  forwarding_id: string;
  tracking_code: string;
  origin_agency: string;
  destination_agency: string;
  canonical_weight_kg: number | string;
  rate_usd_per_kg: number | string;
  amount_expected: number | string;
  amount_paid: number | string;
  payment_request_id: string;
  cash_event_id: string;
  payment_datetime: string;
  manifest_sheet: string;
  manifest_source_row: number;
  manifest_source_tracking_code: string;
  manifest_source_weight: number | string;
  manifest_source_fingerprint: string;
  resolution_state: string;
  sync_state: string;
}>;

export async function readForwardingManifestProjectionTraces() {
  const { data, error } = await client()
    .from("stockage_forwarding_manifest_registry")
    .select("forwarding_id,tracking_code,origin_agency,destination_agency,canonical_weight_kg,rate_usd_per_kg,amount_expected,amount_paid,payment_request_id,cash_event_id,payment_datetime,manifest_sheet,manifest_source_row,manifest_source_tracking_code,manifest_source_weight,manifest_source_fingerprint,resolution_state,sync_state")
    .eq("resolution_state", "CERTIFIED")
    .not("payment_request_id", "is", null)
    .not("cash_event_id", "is", null)
    .not("payment_datetime", "is", null)
    .order("payment_datetime", { ascending: true })
    .order("forwarding_id", { ascending: true })
    .limit(5000);
  if (error) throw new Error("FORWARDING_MANIFEST_PROJECTION_UNAVAILABLE");
  return Object.freeze(((data ?? []) as RegistryRow[]).filter(isProjectable).map(project));
}

function isProjectable(row: RegistryRow) {
  return row.manifest_sheet === row.origin_agency &&
    ["FIH", "LSHI", "KLZ"].includes(row.origin_agency) &&
    ["FIH", "LSHI", "KLZ"].includes(row.destination_agency) &&
    row.origin_agency !== row.destination_agency &&
    Number(row.amount_paid) > 0 &&
    Number(row.amount_paid) === Number(row.amount_expected) &&
    /^[0-9a-f]{64}$/.test(row.manifest_source_fingerprint);
}

function project(row: RegistryRow) {
  return Object.freeze({
    forwardingId: row.forwarding_id,
    trackingCode: row.tracking_code,
    originAgency: row.origin_agency,
    destinationAgency: row.destination_agency,
    canonicalWeightKg: Number(row.canonical_weight_kg),
    rateUsdPerKg: Number(row.rate_usd_per_kg),
    amountExpected: Number(row.amount_expected),
    amountPaid: Number(row.amount_paid),
    paymentRequestId: row.payment_request_id,
    cashEventId: row.cash_event_id,
    paymentDatetime: row.payment_datetime,
    manifestSheet: row.manifest_sheet,
    manifestSourceRow: row.manifest_source_row,
    manifestSourceTrackingCode: row.manifest_source_tracking_code,
    manifestSourceWeight: Number(row.manifest_source_weight),
    manifestSourceFingerprint: row.manifest_source_fingerprint,
    resolutionState: row.resolution_state,
    syncState: row.sync_state
  });
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("FORWARDING_MANIFEST_PROJECTION_NOT_CONFIGURED");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
