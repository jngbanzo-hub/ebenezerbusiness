import "server-only";

import { parseStrictPositiveWeight } from "@/features/admin/shippers";
import type { ManifestShipperRow } from "@/features/admin/types";
import { readCanonicalPaymentManifestRows } from "@/server/admin-manifest-sheets";
import { StockagesV2Error, type StorageAgency } from "@/server/stockages-v2";

export const INTER_AGENCY_RATES = Object.freeze({
  "FIH-LSHI": 12,
  "LSHI-FIH": 13,
  "FIH-KLZ": 14,
  "KLZ-FIH": 16,
  "LSHI-KLZ": 11,
  "KLZ-LSHI": 13
} as const);

export type InterAgencyRoute = keyof typeof INTER_AGENCY_RATES;

export function buildInterAgencyReference(trackingCode: string, origin: StorageAgency, destination: StorageAgency) {
  const code = normalizeCode(trackingCode);
  requireDistinctRoute(origin, destination);
  return `${code}-${origin}-${destination}`;
}

export function quoteInterAgencyRouting(input: { trackingCode: string; origin: StorageAgency; destination: StorageAgency; weightKg: number }) {
  const route = requireDistinctRoute(input.origin, input.destination);
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) throw new StockagesV2Error("PARCEL_WEIGHT_UNAVAILABLE", 422);
  const rateUsdPerKg = INTER_AGENCY_RATES[route];
  return Object.freeze({
    trackingCode: normalizeCode(input.trackingCode),
    routingReference: buildInterAgencyReference(input.trackingCode, input.origin, input.destination),
    origin: input.origin,
    destination: input.destination,
    weightKg: input.weightKg,
    rateUsdPerKg,
    amountExpectedUsd: round(input.weightKg * rateUsdPerKg),
    currency: "USD" as const
  });
}

export async function resolveInterAgencyQuote(
  input: { trackingCode: string; origin: StorageAgency; destination: StorageAgency },
  readRows: () => Promise<ManifestShipperRow[]> = readCanonicalPaymentManifestRows
) {
  const code = normalizeCode(input.trackingCode);
  let canonicalRows: ManifestShipperRow[];
  try {
    canonicalRows = await readRows();
  } catch {
    throw new StockagesV2Error("AGENT_SERVICE_UNAVAILABLE", 503);
  }
  const matchingCodeRows = canonicalRows.filter((row) => normalizeCandidateCode(row.codeColisRaw) === code);
  const rows = matchingCodeRows.filter((row) => row.sourceSite === input.origin);
  if (!rows.length && matchingCodeRows.length) throw new StockagesV2Error("SOURCE_AGENCY_MISMATCH", 409);
  if (!rows.length) throw new StockagesV2Error("TRACKING_CODE_NOT_FOUND", 404);
  const weights = rows.map((row) => parseStrictPositiveWeight(row.poidsRaw));
  if (weights.some((weight) => weight === null)) throw new StockagesV2Error("PARCEL_WEIGHT_UNAVAILABLE", 422);
  const known = weights.filter((weight): weight is number => weight !== null);
  if (new Set(known.map((weight) => weight.toFixed(3))).size !== 1) throw new StockagesV2Error("PARCEL_WEIGHT_AMBIGUOUS", 422);
  return quoteInterAgencyRouting({ ...input, trackingCode: code, weightKg: known[0]! });
}

function requireDistinctRoute(origin: StorageAgency, destination: StorageAgency): InterAgencyRoute {
  const route = `${origin}-${destination}` as InterAgencyRoute;
  if (origin === destination || !(route in INTER_AGENCY_RATES)) throw new StockagesV2Error("INVALID_INTER_AGENCY_ROUTE", 400);
  return route;
}
function normalizeCode(value: unknown) { const code = String(value ?? "").trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code)) throw new StockagesV2Error("INVALID_TRACKING_CODE"); return code; }
function normalizeCandidateCode(value: unknown) { const code = String(value ?? "").trim().toUpperCase(); return /^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code) ? code : null; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
