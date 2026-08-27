import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { AdminPayment, ManifestShipperRow } from "@/features/admin/types";
import { normalizeManifestRowDate } from "@/server/agent-manifest-date";
import { readAdminManifestRows } from "@/server/admin-manifest-sheets";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { findShipmentParcelMatches, type AdminShipmentParcelMatch } from "@/server/admin-shipment-parcel-match";
import { readShipmentStatistics } from "@/server/admin-statistics-sheets";
import { readAdminQr } from "@/server/qr-admin-service";
import { storageParcelDisplayCode } from "@/server/storage-parcel-identity";

type SourceState = "FOUND" | "ABSENT" | "UNAVAILABLE_TEMPORARILY";
type SourceResult<T> = { state: SourceState; matches: T[] };

export type AdminGlobalParcelSearchResult = {
  code: string;
  found: boolean;
  manifest: SourceResult<{ agency: string; date: string; weightKg: number | null; status: string; rowNumber: number }>;
  storage: SourceResult<{ parcelId: string; forwardingId: string | null; displayCode: string; agency: string; weightKg: number; status: string; createdAt: string; updatedAt: string; lastEvent: { type: string; occurredAt: string } | null; events: Array<{ type: string; occurredAt: string }> }>;
  payments: SourceResult<AdminPayment>;
  shipments: SourceResult<AdminShipmentParcelMatch>;
  qr: SourceResult<{ qrId: string; displayNumber: number; status: string; version: number; agency: string | null; trackingCode: string | null; assignedAt: string | null; audit: Array<{ action: string; occurredAt: string }> }>;
};

export function normalizeGlobalParcelCode(value: unknown) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code) ? code : "";
}

export async function searchAdminParcelGlobally(actorId: string, rawCode: string): Promise<AdminGlobalParcelSearchResult> {
  const code = normalizeGlobalParcelCode(rawCode);
  if (!code) throw new Error("INVALID_TRACKING_CODE");
  const [manifest, storage, payments, shipments, qr] = await Promise.all([
    isolated(() => searchManifest(code)),
    isolated(() => searchStorage(code)),
    isolated(() => searchPayments(code)),
    isolated(() => searchShipments(code)),
    isolated(() => searchQr(actorId, code))
  ]);
  return { code, found: [manifest, storage, payments, shipments, qr].some((source) => source.state === "FOUND"), manifest, storage, payments, shipments, qr };
}

async function isolated<T>(read: () => Promise<T[]>): Promise<SourceResult<T>> {
  try {
    const matches = await withTimeout(read(), 12_000);
    return { state: matches.length ? "FOUND" : "ABSENT", matches };
  } catch {
    return { state: "UNAVAILABLE_TEMPORARILY", matches: [] };
  }
}

async function searchManifest(code: string) {
  return (await readAdminManifestRows()).filter((row) => exact(row.codeColisRaw, code)).map((row) => ({
    agency: row.sourceSite,
    date: normalizeManifestRowDate(row.dateRaw),
    weightKg: positiveNumber(row.poidsRaw),
    status: String(row.statutRaw ?? "").trim() || "—",
    rowNumber: row.rowNumber
  }));
}

async function searchPayments(code: string) {
  return (await readAdminPayments()).filter((payment) => exact(payment.codeColis, code));
}

async function searchShipments(code: string) {
  return findShipmentParcelMatches((await readShipmentStatistics()).shipments, code);
}

async function searchStorage(code: string) {
  const client = serviceClient();
  const [{ data: parcels, error: parcelError }, { data: events, error: eventError }] = await Promise.all([
    client.from("stockage_parcels").select("parcel_id,forwarding_id,tracking_code,agency,canonical_weight_kg,delivery_status,created_at,updated_at,stockage_forwardings(origin_agency,destination_agency)").eq("tracking_code", code).order("updated_at", { ascending: false }),
    client.from("stockage_events").select("tracking_code,agency,event_type,occurred_at").eq("tracking_code", code).order("occurred_at", { ascending: false }).limit(20)
  ]);
  if (parcelError || eventError) throw new Error("STORAGE_UNAVAILABLE");
  return (parcels ?? []).map((parcel) => {
    const context = Array.isArray(parcel.stockage_forwardings) ? parcel.stockage_forwardings[0] : parcel.stockage_forwardings;
    const parcelEvents = (events ?? []).filter((candidate) => candidate.agency === parcel.agency).map((event) => ({ type: String(event.event_type), occurredAt: String(event.occurred_at) }));
    return { parcelId: String(parcel.parcel_id), forwardingId: parcel.forwarding_id ? String(parcel.forwarding_id) : null, displayCode: storageParcelDisplayCode({ parcelId: String(parcel.parcel_id), forwardingId: parcel.forwarding_id ? String(parcel.forwarding_id) : null, trackingCode: String(parcel.tracking_code), agency: String(parcel.agency), originAgency: context?.origin_agency, destinationAgency: context?.destination_agency }), agency: String(parcel.agency), weightKg: Number(parcel.canonical_weight_kg), status: String(parcel.delivery_status), createdAt: String(parcel.created_at), updatedAt: String(parcel.updated_at), lastEvent: parcelEvents[0] ?? null, events: parcelEvents };
  });
}

async function searchQr(actorId: string, code: string) {
  const { data, error } = await serviceClient().rpc("read_qr_manifest_registry_server", { p_display_numbers: [] });
  if (error || !data || typeof data !== "object") throw new Error("QR_UNAVAILABLE");
  const assignments = Array.isArray(data.activeAssignments) ? data.activeAssignments as Array<Record<string, unknown>> : [];
  const matchingIds = assignments.filter((row) => exact(row.trackingCode, code)).map((row) => String(row.qrId));
  const records = await Promise.all(matchingIds.map((qrId) => readAdminQr(actorId, qrId)));
  return records.filter(Boolean).map((record) => ({
    qrId: record.label.qr_id,
    displayNumber: record.label.display_number,
    status: record.label.status,
    version: record.label.version,
    agency: record.label.agency,
    trackingCode: record.label.tracking_code,
    assignedAt: record.label.assigned_at,
    audit: record.audit.map((event: { action: string; occurred_at: string }) => ({ action: event.action, occurredAt: event.occurred_at }))
  }));
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("SERVICE_UNAVAILABLE");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}

function exact(value: unknown, code: string) { return String(value ?? "").trim().toUpperCase() === code; }
function positiveNumber(value: unknown) { const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function withTimeout<T>(promise: Promise<T>, delayMs: number) { return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SOURCE_TIMEOUT")), delayMs))]); }
