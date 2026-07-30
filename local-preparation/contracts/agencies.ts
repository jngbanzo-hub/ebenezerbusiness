import { contractError } from "./errors";

export const CANONICAL_AGENCIES = ["COO", "FIH", "LSHI", "KLZ"] as const;

export type CanonicalAgency = (typeof CANONICAL_AGENCIES)[number];

export function normalizeCanonicalAgency(value: unknown): CanonicalAgency {
  if (typeof value !== "string") {
    throw contractError("INVALID_AGENCY", "Agence invalide.");
  }

  const normalized = value.trim().toUpperCase();
  const canonical = normalized === "COTONOU" ? "COO" : normalized;

  if (!isCanonicalAgency(canonical)) {
    throw contractError("INVALID_AGENCY", "Agence invalide.");
  }

  return canonical;
}

export function isCanonicalAgency(value: unknown): value is CanonicalAgency {
  return (
    typeof value === "string" &&
    CANONICAL_AGENCIES.includes(value as CanonicalAgency)
  );
}

export function assertCanonicalAgency(
  value: unknown,
): asserts value is CanonicalAgency {
  if (!isCanonicalAgency(value)) {
    throw contractError("INVALID_AGENCY", "Agence invalide.");
  }
}
