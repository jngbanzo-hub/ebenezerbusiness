import type { ManifestShipperRow, AdminPayment } from "@/features/admin/types";

export type HistoricalTerms = Readonly<{
  state: "VERIFIED" | "UNAVAILABLE" | "AMBIGUOUS";
  expectedUsd: number | null;
  paidUsd: number | null;
  manifestRowNumber: number | null;
  manifestDate: string | null;
  source: string | null;
}>;

function amount(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value).trim().replace(/\s/g, "").replace(/[^\d,.-]/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function dateKey(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const dayFirst = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const result = dayFirst ? `${dayFirst[3]}-${dayFirst[2].padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}` : iso?.[0] ?? null;
  if (!result) return null;
  const parsed = new Date(`${result}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : null;
}

/** Fail closed when the old agency/code/weight/cycle or any payment is ambiguous. */
export function verifyHistoricalTerms(input: {
  rows: readonly ManifestShipperRow[];
  payments: readonly AdminPayment[];
  originAgency: string;
  destinationAgency: string;
  trackingCode: string;
  weightKg: number;
  forwardingCreatedAt: string;
}): HistoricalTerms {
  const code = input.trackingCode.trim().toUpperCase();
  const candidates = input.rows.filter(row => row.sourceSite === input.originAgency &&
    String(row.codeColisRaw).trim().toUpperCase() === code);
  if (candidates.length !== 1) return { state: candidates.length ? "AMBIGUOUS" : "UNAVAILABLE", expectedUsd: null, paidUsd: null, manifestRowNumber: null, manifestDate: null, source: null };
  const row = candidates[0];
  const date = dateKey(row.dateRaw);
  const forwardingDay = dateKey(input.forwardingCreatedAt);
  const weight = amount(row.poidsRaw);
  const expected = amount(row.historicalCurrentPriceFieldRaw ?? row.montantAttenduRaw);
  const remaining = amount(row.historicalRemainingAmountRaw);
  const paid = amount(row.historicalPaidAmountRaw);
  const paymentStatus = String(row.historicalPaymentStatusRaw ?? "").trim().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const paidStatusContradicts = !paymentStatus.includes("NON PAYE") &&
    /PAYE|PARTIEL|SOLDE/.test(paymentStatus);
  const relevantPayments = input.payments.filter(payment => payment.codeColis.trim().toUpperCase() === code &&
    payment.destinationCode === input.originAgency);
  const sameDestinationAfterDeparture = input.payments.filter(payment => payment.codeColis.trim().toUpperCase() === code &&
    payment.destinationCode === input.destinationAgency && payment.dateTime.slice(0, 10) >= input.forwardingCreatedAt.slice(0, 10));
  if (!date || !forwardingDay || date > forwardingDay || weight !== input.weightKg ||
      expected === null || expected <= 0 || (remaining !== null && remaining !== expected) ||
      (paid !== null && paid !== 0) || paidStatusContradicts || relevantPayments.length || sameDestinationAfterDeparture.length) {
    return { state: "AMBIGUOUS", expectedUsd: null, paidUsd: null, manifestRowNumber: row.rowNumber, manifestDate: date, source: null };
  }
  return {
    state: "VERIFIED", expectedUsd: expected, paidUsd: 0,
    manifestRowNumber: row.rowNumber, manifestDate: date,
    source: `${input.originAgency}!F${row.rowNumber}`
  };
}
