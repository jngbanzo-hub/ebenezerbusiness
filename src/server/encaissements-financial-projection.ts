import "server-only";

import type { AdminPayment, ManifestShipperRow } from "@/features/admin/types";
import type { StorageAgency } from "@/server/stockages-v2";

export type ParcelFinancialProjection = {
  trackingCode: string;
  destination: StorageAgency;
  amountExpected: number | null;
  totalPaid: number | null;
  remainingBalance: number | null;
  currency: "USD";
  paymentSites: string[];
  paymentAgents: string[];
  paymentCount: number;
  paymentComplete: boolean;
  collectionEligible: boolean;
  deliveryEligible: boolean;
  dataQuality: "RELIABLE" | "INCOMPLETE" | "CONFLICT";
  sourceStatus: string;
  sourceEligible: boolean;
  financialState: "COMPLETE" | "INCOMPLETE" | "CONFLICT";
  anomalies: string[];
};

export function buildEncaissementsFinancialProjection(input: {
  trackingCode: string;
  destination: StorageAgency;
  manifestRows: readonly ManifestShipperRow[];
  payments: readonly AdminPayment[];
}): ParcelFinancialProjection {
  const code = normalizeCode(input.trackingCode);
  const destinationRows = input.manifestRows
    .filter((row) => row.sourceSite === input.destination && normalizeCode(row.codeColisRaw) === code)
    .sort((a, b) => a.rowNumber - b.rowNumber);
  const canonicalRow = destinationRows.at(-1);
  const amountValues = destinationRows.map((row) => parseMoney(row.montantAttenduRaw));
  const knownAmounts = amountValues.filter((value): value is number => value !== null);
  const amountKeys = new Set(knownAmounts.map((value) => value.toFixed(2)));
  const amountExpected = canonicalRow ? parseMoney(canonicalRow.montantAttenduRaw) : null;
  const sourceStatus = String(canonicalRow?.statutRaw ?? "").trim();
  const sourceEligible = !/ANNUL|LIVR[ÉE]|ANNULE|DELIVERED/i.test(sourceStatus.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const matchingPayments = deduplicatePayments(
    input.payments.filter((payment) => payment.destinationCode === input.destination && normalizeCode(payment.codeColis) === code)
  );
  const totalPaid = round(matchingPayments.reduce((sum, payment) => sum + payment.montantPaye, 0));
  const anomalies: string[] = [];
  if (!canonicalRow || amountExpected === null) anomalies.push("EXPECTED_AMOUNT_MISSING");
  if (amountKeys.size > 1) anomalies.push("EXPECTED_AMOUNT_CONFLICT");
  if (input.manifestRows.some((row) => normalizeCode(row.codeColisRaw) === code && row.sourceSite !== input.destination)) anomalies.push("DESTINATION_CONFLICT");
  if (!sourceEligible) anomalies.push("SOURCE_STATUS_INELIGIBLE");
  if (amountExpected !== null && totalPaid > amountExpected) anomalies.push("PAYMENT_OVERPAID");
  const conflictingPaymentExpected = matchingPayments.some((payment) => payment.montantAttendu !== null && amountExpected !== null && round(payment.montantAttendu) !== amountExpected);
  if (conflictingPaymentExpected) anomalies.push("PAYMENT_EXPECTED_AMOUNT_CONFLICT");
  const financialConflict = anomalies.some((value) => value === "EXPECTED_AMOUNT_CONFLICT" || value === "DESTINATION_CONFLICT" || value === "PAYMENT_OVERPAID" || value === "PAYMENT_EXPECTED_AMOUNT_CONFLICT");
  const financialState = financialConflict ? "CONFLICT" : amountExpected === null ? "INCOMPLETE" : "COMPLETE";
  const remainingBalance = financialState === "COMPLETE" ? round(amountExpected! - totalPaid) : null;
  return {
    trackingCode: code,
    destination: input.destination,
    amountExpected,
    totalPaid: amountExpected === null && matchingPayments.length === 0 ? null : totalPaid,
    remainingBalance,
    currency: "USD",
    paymentSites: Array.from(new Set(matchingPayments.map((payment) => payment.agenceEncaissement))),
    paymentAgents: Array.from(new Set(matchingPayments.map((payment) => payment.agent).filter(Boolean))),
    paymentCount: matchingPayments.length,
    paymentComplete: remainingBalance === 0,
    collectionEligible: sourceEligible && financialState === "COMPLETE" && remainingBalance !== null && remainingBalance > 0,
    deliveryEligible: sourceEligible && financialState === "COMPLETE" && remainingBalance === 0,
    dataQuality: financialState === "COMPLETE" ? "RELIABLE" : financialState,
    sourceStatus,
    sourceEligible,
    financialState,
    anomalies
  };
}

function deduplicatePayments(payments: readonly AdminPayment[]) {
  const seen = new Set<string>();
  return payments.filter((payment) => {
    const requestId = payment.paymentRequestId?.trim().toLowerCase();
    const key = requestId ? `request:${requestId}` : `legacy:${legacyPaymentFingerprint(payment)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function legacyPaymentFingerprint(payment: AdminPayment) {
  return [payment.dateTime, normalizeCode(payment.codeColis), payment.destinationCode, payment.agenceEncaissement, round(payment.montantPaye).toFixed(2), payment.reference.trim().toUpperCase(), payment.modePaiement.trim().toUpperCase(), payment.agent.trim().toUpperCase()].join("\u001f");
}

function normalizeCode(value: unknown) { return String(value ?? "").trim().toUpperCase(); }
function parseMoney(value: unknown) { const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", ".").replace(/\s/g, "")); return Number.isFinite(parsed) && parsed > 0 ? round(parsed) : null; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
