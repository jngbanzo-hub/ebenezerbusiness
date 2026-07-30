export type CanonicalAgency =
  | "COO"
  | "FIH"
  | "LSHI"
  | "KLZ";

export function normalizeCanonicalAgency(
  agency: string,
): CanonicalAgency | null {
  const normalized = agency.trim().toUpperCase();
  const canonical = normalized === "COTONOU" ? "COO" : normalized;

  return canonical === "COO" ||
    canonical === "FIH" ||
    canonical === "LSHI" ||
    canonical === "KLZ"
    ? canonical
    : null;
}
