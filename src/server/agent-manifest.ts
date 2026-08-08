import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { ManifestShipperRow } from "@/features/admin/types";
import { readAdminManifestRows } from "@/server/admin-manifest-sheets";
import {
  matchesManifestFilters,
  normalizeManifestDateFilter,
  normalizeManifestRowDate
} from "@/server/agent-manifest-date";
import { StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";

export type AgentManifestAgency = "COO" | StorageAgency;

export async function readAgentManifest(input: {
  agency: AgentManifestAgency;
  compareStorage?: boolean;
  code?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = positiveInteger(input.page ?? 1, 1, 10_000);
  const pageSize = positiveInteger(input.pageSize ?? 25, 1, 100);
  const code = normalizeCodeFilter(input.code);
  const status = normalizeManifestStatus(input.status);
  const from = normalizeManifestDateFilter(input.from);
  const to = normalizeManifestDateFilter(input.to);
  const rows = (await readAdminManifestRows())
    .filter((row) => input.agency === "COO" || row.sourceSite === input.agency)
    .map(toManifestItem)
    .filter((row) => matchesManifestFilters(row, { code, status, from, to }));

  const storage = input.agency === "COO" || input.compareStorage === false
    ? new Map<string, { weightKg: number; status: string }>()
    : await readStorageComparison(input.agency, rows.map((row) => row.trackingCode));
  const enriched = rows.map((row) => {
    const parcel = storage.get(row.trackingCode);
    return Object.freeze({
      ...row,
      presentInStorage: Boolean(parcel),
      storageWeightKg: parcel?.weightKg ?? null,
      weightDifferenceKg: parcel ? round(parcel.weightKg - row.weightKg) : null
    });
  });
  const total = enriched.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  return Object.freeze({
    agency: input.agency,
    rows: Object.freeze(enriched.slice((safePage - 1) * pageSize, safePage * pageSize)),
    pagination: Object.freeze({ page: safePage, pageSize, total, totalPages })
  });
}

export function normalizeManifestStatus(value: unknown): string {
  const normalized = stripDecorations(String(value ?? ""));
  const aliases: Record<string, string> = {
    "": "",
    "EN ATTENTE": "EN ATTENTE",
    ENREGISTRE: "ENREGISTRÉ",
    "EN VOL": "EN VOL",
    "EN TRANSIT": "EN TRANSIT",
    ARRIVE: "ARRIVÉ",
    LIVRE: "LIVRÉ"
  };
  return aliases[normalized] ?? "INCONNU";
}

function toManifestItem(row: ManifestShipperRow) {
  return Object.freeze({
    date: normalizeManifestRowDate(row.dateRaw),
    trackingCode: normalizeRequiredCode(row.codeColisRaw),
    weightKg: parseWeight(row.poidsRaw),
    status: normalizeManifestStatus(row.statutRaw),
    sourceSite: row.sourceSite
  });
}

async function readStorageComparison(agency: StorageAgency, codes: string[]) {
  const unique = Array.from(new Set(codes));
  if (!unique.length) return new Map<string, { weightKg: number; status: string }>();
  const { data, error } = await serviceClient()
    .from("stockage_parcels")
    .select("tracking_code,canonical_weight_kg,delivery_status")
    .eq("agency", agency)
    .eq("delivery_status", "AVAILABLE")
    .in("tracking_code", unique);
  if (error) throw new StockagesV2Error("STORAGE_READ_FAILED", 503);
  return new Map(
    (data ?? []).map((row) => [
      String(row.tracking_code),
      { weightKg: Number(row.canonical_weight_kg), status: String(row.delivery_status) }
    ])
  );
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StockagesV2Error("STORAGE_SERVICE_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}

function stripDecorations(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z ]/gi, " ").replace(/\s+/g, " ").trim().toUpperCase();
}
function normalizeCodeFilter(value: unknown) { const code = String(value ?? "").trim().toUpperCase(); return code && /^[A-Z0-9._/-]{1,64}$/.test(code) ? code : ""; }
function normalizeRequiredCode(value: unknown) { const code = normalizeCodeFilter(value); return code || "CODE_INVALIDE"; }
function parseWeight(value: unknown) { const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; }
function positiveInteger(value: number, min: number, max: number) { return Number.isInteger(value) && value >= min && value <= max ? value : min; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 1000) / 1000; }
