import type { BilanAgency, DirectCostKind, UnallocatedDirectCost } from "./bilan-contracts";
import { allocateUsdByWeight, usdToCents, type WeightAllocationInput } from "./allocations";

export const DECLARANT_LSHI_GROUP_USD = 58;
export const DECLARANT_FIH_STANDARD_GROUP_USD = 40;
export const DECLARANT_DHL_USD_PER_KG = 2.8;
export const TRANSIT_FIH_LSHI_USD_PER_KG = 1.7;

export function declarantGroupCostUsd(agency: BilanAgency, company: string, certifiedWeightKg?: number) {
  const normalizedCompany = company.trim().toUpperCase();
  if (agency === "LSHI" && normalizedCompany !== "DHL") return DECLARANT_LSHI_GROUP_USD;
  if (agency === "LSHI" && normalizedCompany === "DHL") {
    if (!Number.isFinite(certifiedWeightKg) || (certifiedWeightKg ?? 0) <= 0) throw new Error("BILAN_CERTIFIED_WEIGHT_REQUIRED");
    return money((certifiedWeightKg ?? 0) * DECLARANT_DHL_USD_PER_KG);
  }
  if (agency !== "FIH") throw new Error("BILAN_DECLARANT_GROUP_AGENCY_UNSUPPORTED");
  if (normalizedCompany === "DHL") {
    if (!Number.isFinite(certifiedWeightKg) || (certifiedWeightKg ?? 0) <= 0) throw new Error("BILAN_CERTIFIED_WEIGHT_REQUIRED");
    return money((certifiedWeightKg ?? 0) * DECLARANT_DHL_USD_PER_KG);
  }
  return DECLARANT_FIH_STANDARD_GROUP_USD;
}

export function transitFihLshiTotalUsd(input: Readonly<{
  company: string;
  destination: BilanAgency;
  officialWeightKg: number;
}>) {
  if (input.company.trim().toUpperCase() !== "DHL" || input.destination !== "LSHI") {
    throw new Error("BILAN_TRANSIT_FIH_LSHI_NOT_APPLICABLE");
  }
  if (!Number.isFinite(input.officialWeightKg) || input.officialWeightKg <= 0) {
    throw new Error("BILAN_OFFICIAL_TRANSIT_WEIGHT_REQUIRED");
  }
  return money(input.officialWeightKg * TRANSIT_FIH_LSHI_USD_PER_KG);
}

export function allocateGroupFlatCost(totalUsd: number, cohortWeights: readonly WeightAllocationInput[]) {
  return allocateUsdByWeight(totalUsd, cohortWeights);
}

export function allocateTransitTotalByCohort(
  officialTransitTotalUsd: number,
  certifiedIndividualCohortWeights: readonly WeightAllocationInput[]
) {
  return allocateUsdByWeight(officialTransitTotalUsd, certifiedIndividualCohortWeights);
}

export function createUnallocatedDirectCost(input: Readonly<{
  kind: DirectCostKind;
  amountUsd: number;
  reason: string;
  sourceIdentity: string;
}>): UnallocatedDirectCost {
  if (!input.reason.trim() || !input.sourceIdentity.trim()) throw new Error("BILAN_UNALLOCATED_COST_REASON_REQUIRED");
  return Object.freeze({
    state: "DIRECT_COST_UNALLOCATED",
    kind: input.kind,
    amountCents: usdToCents(input.amountUsd),
    currency: "USD",
    reason: input.reason.trim(),
    sourceIdentity: input.sourceIdentity.trim()
  });
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
