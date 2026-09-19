import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readExhaustivePages } from "@/server/exhaustive-pagination";
import type { StorageAgency } from "@/server/stockages-v2";

export async function readStockagesWorkQueueSource(agency: StorageAgency) {
  const client = serviceClient();
  const [account, deliveries, physical] = await Promise.all([
    client.from("stockage_accounts").select("status").eq("agency", agency).single(),
    readExhaustivePages(async (from, to) => { const result = await client.from("stockage_events").select("event_id,tracking_code,agency,business_date,occurred_at,actor_name,weight_kg_delta").eq("agency", agency).eq("event_type", "CONFIRMED_DELIVERY_RECORDED").order("event_id", { ascending: true }).range(from, to); if (result.error) throw result.error; return result.data ?? []; }, { identity: (row) => row.event_id }),
    readExhaustivePages(async (from, to) => { const result = await client.from("stockage_parcels").select("parcel_id,tracking_code,agency,canonical_weight_kg,delivery_status").eq("agency", agency).is("forwarding_id", null).order("parcel_id", { ascending: true }).range(from, to); if (result.error) throw result.error; return result.data ?? []; }, { identity: (row) => row.parcel_id })
  ]);
  if (account.error) throw new Error("STORAGE_QUEUE_READ_FAILED");
  return { account: account.data, deliveries: deliveries.rows, physicalParcels: physical.rows, pagination: { deliveries: deliveries.metrics, physicalParcels: physical.metrics } };
}

function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error("STORAGE_SERVICE_NOT_CONFIGURED"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } }).schema("public"); }
