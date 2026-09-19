export const PAYMENT_RESOLUTION_STATUSES = [
  "SUCCEEDED",
  "PROCESSING",
  "NOT_FOUND",
  "CONFLICT",
  "FAILED_FINAL",
] as const;

export type PaymentResolutionStatus =
  (typeof PAYMENT_RESOLUTION_STATUSES)[number];

export function withPaymentRequestContext<T extends Record<string, unknown>>(
  receipt: T,
  paymentRequestId: string,
  replayed: boolean,
): T & { paymentRequestId: string; replayed: boolean } {
  return { ...receipt, paymentRequestId, replayed };
}

export function isAgencyDestinationAllowed(
  agentAgency: string,
  destinationCode: string,
): boolean {
  const normalizedAgency = agentAgency.trim().toUpperCase();
  const collectionAgency = normalizedAgency === "COTONOU"
    ? "COO"
    : normalizedAgency;
  const normalizedDestination = destinationCode.trim().toUpperCase();

  if (collectionAgency === "COO") {
    return ["FIH", "LSHI", "KLZ"].includes(normalizedDestination);
  }

  return ["FIH", "LSHI", "KLZ"].includes(collectionAgency) &&
    collectionAgency === normalizedDestination;
}

export function normalizePaymentRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalized,
    )
    ? normalized
    : null;
}

export function normalizePublicPaymentStatus(
  value: unknown,
): "NON_PAYE" | "PARTIELLEMENT_PAYE" | "SOLDE" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  return ["NON_PAYE", "PARTIELLEMENT_PAYE", "SOLDE"].includes(normalized)
    ? normalized as "NON_PAYE" | "PARTIELLEMENT_PAYE" | "SOLDE"
    : null;
}
