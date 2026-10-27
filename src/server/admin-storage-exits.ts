import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  buildStorageExitReport,
  readAllStorageExitPages,
  resolveStorageExitPeriod,
  STORAGE_EXIT_TYPES,
  type StorageExitCorrection,
  type StorageExitEvent,
  type StorageExitForwardingLink,
  type StorageExitParcelLink,
  type StorageExitScope
} from "@/features/stockages/admin-storage-exits-model";
import { StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";

const PAGE_SIZE = 1000;
const LOOKUP_CHUNK_SIZE = 100;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) }
  }).schema("public");
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function readAdminStorageExits(input: {
  agency: StorageAgency;
  period: StorageExitScope;
  code?: string;
  year?: number;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}) {
  if (input.period === "all" && !input.code) throw new Error("INVALID_CODE");
  const interval = input.period === "all" ? null : resolveStorageExitPeriod(input.period, input);
  const asOf = new Date().toISOString();
  const upper = interval && interval.toExclusiveIso < asOf ? interval.toExclusiveIso : asOf;
  const client = serviceClient();
  const events = interval && interval.fromIso >= upper ? [] : await readAllStorageExitPages<StorageExitEvent>(async (from, to) => {
    let query = client.from("stockage_events")
      .select("event_id,event_type,agency,tracking_code,parcel_count_delta,weight_kg_delta,occurred_at,business_date,source_type,source_request_id,metadata")
      .eq("agency", input.agency)
      .in("event_type", [...STORAGE_EXIT_TYPES]);
    if (interval) query = query.gte("occurred_at", interval.fromIso);
    if (input.code) query = query.eq("tracking_code", input.code);
    const { data, error } = await query.lt("occurred_at", upper)
      .order("occurred_at", { ascending: true })
      .order("event_id", { ascending: true })
      .range(from, to);
    if (error) throw new StockagesV2Error("STORAGE_EXIT_READ_INCOMPLETE", 503);
    return (data ?? []) as unknown as StorageExitEvent[];
  }, (row) => row.event_id, PAGE_SIZE);

  const corrections: StorageExitCorrection[] = [];
  const parcels: StorageExitParcelLink[] = [];
  const forwardings: StorageExitForwardingLink[] = [];
  for (const ids of chunks(events.map((event) => event.event_id), LOOKUP_CHUNK_SIZE)) {
    const correctionRows = await readAllStorageExitPages<StorageExitCorrection>(async (from, to) => {
      const { data, error } = await client.from("stockage_events")
        .select("event_id,target_event_id,agency,occurred_at,reason,metadata")
        .in("target_event_id", ids)
        .in("event_type", ["STOCK_CORRECTION_RECORDED", "CORRECTION_COMPENSATOIRE_ADMIN"])
        .lt("occurred_at", asOf)
        .order("occurred_at", { ascending: true })
        .order("event_id", { ascending: true })
        .range(from, to);
      if (error) throw new StockagesV2Error("STORAGE_EXIT_CORRECTION_READ_INCOMPLETE", 503);
      return (data ?? []) as unknown as StorageExitCorrection[];
    }, (row) => row.event_id, PAGE_SIZE);
    corrections.push(...correctionRows);

    const parcelRows = await readAllStorageExitPages<StorageExitParcelLink>(async (from, to) => {
      const { data, error } = await client.from("stockage_parcels")
        .select("delivered_event_id,parcel_id,forwarding_id,agency,tracking_code")
        .in("delivered_event_id", ids)
        .order("parcel_id", { ascending: true })
        .range(from, to);
      if (error) throw new StockagesV2Error("STORAGE_EXIT_PARCEL_READ_INCOMPLETE", 503);
      return (data ?? []) as unknown as StorageExitParcelLink[];
    }, (row) => row.parcel_id, PAGE_SIZE);
    parcels.push(...parcelRows);
  }
  const forwardingIds = Array.from(new Set(events.flatMap((event) => event.source_type === "INTER_AGENCY_FORWARDING"
    ? [String(event.metadata?.forwardingId ?? event.source_request_id ?? "")]
    : []))).filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
  for (const ids of chunks(forwardingIds, LOOKUP_CHUNK_SIZE)) {
    const rows = await readAllStorageExitPages<StorageExitForwardingLink>(async (from, to) => {
      const { data, error } = await client.from("stockage_forwardings")
        .select("forwarding_id,forwarding_reference,original_tracking_code,origin_agency,destination_agency")
        .in("forwarding_id", ids)
        .order("forwarding_id", { ascending: true })
        .range(from, to);
      if (error) throw new StockagesV2Error("STORAGE_EXIT_FORWARDING_READ_INCOMPLETE", 503);
      return (data ?? []) as unknown as StorageExitForwardingLink[];
    }, (row) => row.forwarding_id, PAGE_SIZE);
    forwardings.push(...rows);
  }
  return {
    agency: input.agency,
    timezone: "Africa/Porto-Novo" as const,
    interval,
    asOf,
    ...buildStorageExitReport({ agency: input.agency, events, corrections, parcels, forwardings, page: input.page, pageSize: input.pageSize })
  };
}
