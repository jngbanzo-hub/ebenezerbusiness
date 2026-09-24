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

type ForwardingRow = Readonly<{
  forwarding_id: string;
  origin_agency: string;
  destination_agency: string;
  status: string;
  cash_event_id: string | null;
  delivery_event_id: string | null;
}>;
type OrchestrationRow = Readonly<{
  request_id: string;
  forwarding_id: string | null;
  parcel_id: string | null;
  agency: string;
  state: string;
  payment_created: boolean;
  cash_event_id: string | null;
  stockage_event_id: string | null;
}>;
type ParcelRow = Readonly<{
  parcel_id: string;
  forwarding_id: string | null;
  agency: string;
  delivery_status: string;
  delivered_event_id: string | null;
}>;
type StorageEventRow = Readonly<{
  event_id: string;
  request_id: string;
  event_type: string;
  agency: string;
  parcel_count_delta: number;
  source_request_id: string | null;
}>;

export async function readForwardingManifestProjectionTraces() {
  const db = client();
  const { data, error } = await db
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
  const rows = ((data ?? []) as RegistryRow[]).filter(isProjectable);
  const evidence = await readDeliveryEvidence(db, rows);
  return Object.freeze(rows.map((row) => {
    const forwarding = evidence.forwardings.get(row.forwarding_id);
    return project(row, forwarding, isDeliveryCertified(
      row,
      forwarding,
      evidence.orchestrations.get(row.payment_request_id),
      evidence.parcels.get(evidence.orchestrations.get(row.payment_request_id)?.parcel_id ?? ""),
      evidence.events.get(evidence.orchestrations.get(row.payment_request_id)?.stockage_event_id ?? "")
    ));
  }));
}

async function readDeliveryEvidence(db: ReturnType<typeof client>, rows: RegistryRow[]) {
  const empty = {
    forwardings: new Map<string, ForwardingRow>(),
    orchestrations: new Map<string, OrchestrationRow>(),
    parcels: new Map<string, ParcelRow>(),
    events: new Map<string, StorageEventRow>()
  };
  if (!rows.length) return empty;
  const [forwardingsResult, orchestrationsResult] = await Promise.all([
    db.from("stockage_forwardings")
      .select("forwarding_id,origin_agency,destination_agency,status,cash_event_id,delivery_event_id")
      .in("forwarding_id", rows.map((row) => row.forwarding_id)),
    db.from("stockage_payment_orchestrations")
      .select("request_id,forwarding_id,parcel_id,agency,state,payment_created,cash_event_id,stockage_event_id")
      .in("request_id", rows.map((row) => row.payment_request_id))
  ]);
  // A technical read failure must not create a false delivery certificate.
  if (forwardingsResult.error || orchestrationsResult.error) return empty;
  const forwardings = new Map(((forwardingsResult.data ?? []) as ForwardingRow[]).map((row) => [row.forwarding_id, row]));
  const orchestrations = new Map(((orchestrationsResult.data ?? []) as OrchestrationRow[]).map((row) => [row.request_id, row]));
  const parcelIds = Array.from(new Set(Array.from(orchestrations.values()).map((row) => row.parcel_id).filter((id): id is string => Boolean(id))));
  const eventIds = Array.from(new Set(Array.from(orchestrations.values()).map((row) => row.stockage_event_id).filter((id): id is string => Boolean(id))));
  if (!parcelIds.length || !eventIds.length) return { ...empty, forwardings, orchestrations };
  const [parcelsResult, eventsResult] = await Promise.all([
    db.from("stockage_parcels")
      .select("parcel_id,forwarding_id,agency,delivery_status,delivered_event_id")
      .in("parcel_id", parcelIds),
    db.from("stockage_events")
      .select("event_id,request_id,event_type,agency,parcel_count_delta,source_request_id")
      .in("event_id", eventIds)
  ]);
  if (parcelsResult.error || eventsResult.error) return { ...empty, forwardings, orchestrations };
  return {
    forwardings,
    orchestrations,
    parcels: new Map(((parcelsResult.data ?? []) as ParcelRow[]).map((row) => [row.parcel_id, row])),
    events: new Map(((eventsResult.data ?? []) as StorageEventRow[]).map((row) => [row.event_id, row]))
  };
}

function isDeliveryCertified(
  registry: RegistryRow,
  forwarding?: ForwardingRow,
  orchestration?: OrchestrationRow,
  parcel?: ParcelRow,
  event?: StorageEventRow
) {
  return Boolean(forwarding && orchestration && parcel && event &&
    forwarding.forwarding_id === registry.forwarding_id &&
    forwarding.origin_agency === registry.origin_agency &&
    forwarding.destination_agency === registry.destination_agency &&
    ["FIH", "LSHI", "KLZ"].includes(forwarding.destination_agency) &&
    forwarding.status === "DELIVERED" &&
    forwarding.cash_event_id === registry.cash_event_id &&
    orchestration.request_id === registry.payment_request_id &&
    orchestration.forwarding_id === forwarding.forwarding_id &&
    orchestration.parcel_id === parcel.parcel_id &&
    orchestration.agency === forwarding.destination_agency &&
    orchestration.state === "COMPLETED" && orchestration.payment_created === true &&
    orchestration.cash_event_id === registry.cash_event_id &&
    parcel.forwarding_id === forwarding.forwarding_id &&
    parcel.agency === forwarding.destination_agency &&
    parcel.delivery_status === "DELIVERED" &&
    forwarding.delivery_event_id === event.event_id &&
    parcel.delivered_event_id === event.event_id &&
    orchestration.stockage_event_id === event.event_id &&
    event.request_id === registry.payment_request_id &&
    event.event_type === "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION" &&
    event.agency === forwarding.destination_agency &&
    event.parcel_count_delta === -1 &&
    event.source_request_id === forwarding.forwarding_id);
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

function project(row: RegistryRow, forwarding: ForwardingRow | undefined, deliveryCertified: boolean) {
  return Object.freeze({
    forwardingId: row.forwarding_id,
    trackingCode: row.tracking_code,
    originAgency: row.origin_agency,
    destinationAgency: forwarding?.destination_agency === row.destination_agency
      ? forwarding.destination_agency : row.destination_agency,
    deliveryCertified,
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
