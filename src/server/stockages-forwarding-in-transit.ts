import "server-only";

import { createClient } from "@supabase/supabase-js";

import { assertForwardingEnabled } from "@/server/forwarding-feature";
import { StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";

export type InTransitForwarding = Readonly<{
  forwardingId: string;
  parcelId: string;
  trackingCode: string;
  displayCode: string;
  originAgency: "KLZ";
  destinationAgency: "LSHI" | "FIH";
  weightKg: number;
  rateUsdPerKg: number;
  amountExpectedUsd: number;
  forwardingReference: string;
  departedAt: string;
  status: "IN_TRANSIT";
}>;

export async function readDestinationInTransitForwardings(agency: StorageAgency): Promise<readonly InTransitForwarding[]> {
  assertForwardingEnabled();
  if (agency !== "LSHI" && agency !== "FIH") throw new StockagesV2Error("WRONG_AGENCY", 403);
  const { data, error } = await serviceClient()
    .from("stockage_forwardings")
    .select("forwarding_id,forwarding_reference,original_tracking_code,origin_agency,destination_agency,canonical_weight_kg,rate_usd_per_kg,amount_expected,status,created_at,metadata")
    .eq("destination_agency", agency)
    .eq("status", "IN_TRANSIT")
    .order("created_at", { ascending: true });
  if (error) throw new StockagesV2Error("FORWARDING_SERVICE_UNAVAILABLE", 503);
  return Object.freeze((data ?? []).map((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    const parcelId = typeof metadata.parcelId === "string" ? metadata.parcelId : "";
    if (!parcelId) throw new StockagesV2Error("FORWARDING_IDENTITY_MISSING", 409);
    return Object.freeze({
      forwardingId: row.forwarding_id,
      parcelId,
      trackingCode: row.original_tracking_code,
      displayCode: `${row.original_tracking_code} · ${row.origin_agency}-${row.destination_agency}`,
      originAgency: row.origin_agency as "KLZ",
      destinationAgency: row.destination_agency as "LSHI" | "FIH",
      weightKg: Number(row.canonical_weight_kg),
      rateUsdPerKg: Number(row.rate_usd_per_kg),
      amountExpectedUsd: Number(row.amount_expected),
      forwardingReference: row.forwarding_reference,
      departedAt: row.created_at,
      status: "IN_TRANSIT" as const
    });
  }));
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch }
  }).schema("public");
}

function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: "no-store" });
}
