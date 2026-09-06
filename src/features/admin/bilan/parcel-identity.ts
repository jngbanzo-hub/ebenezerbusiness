import { BILAN_AGENCIES, type BilanAgency, type ParcelIdentity } from "./bilan-contracts";
import { canonicalParcelCode, resolveCohort } from "./cohort-registry";

export function resolveAnalyticalAgency(rawCode: string, structuredAgency: BilanAgency): BilanAgency {
  return canonicalParcelCode(rawCode).endsWith("KLZ") ? "KLZ" : structuredAgency;
}

export function createParcelIdentity(input: Readonly<{
  rawCode: string;
  structuredAgency: BilanAgency;
  sourceSheet: string;
  sourceRow: number;
}>): ParcelIdentity {
  const rawCode = input.rawCode.trim();
  if (!rawCode) throw new Error("BILAN_EMPTY_PARCEL_CODE");
  if (!BILAN_AGENCIES.includes(input.structuredAgency)) throw new Error("BILAN_INVALID_AGENCY");
  if (!Number.isInteger(input.sourceRow) || input.sourceRow < 1) throw new Error("BILAN_INVALID_SOURCE_ROW");
  const canonicalCode = canonicalParcelCode(rawCode);
  return Object.freeze({
    rawCode,
    canonicalCode,
    cohort: resolveCohort(canonicalCode),
    agency: resolveAnalyticalAgency(canonicalCode, input.structuredAgency),
    sourceSheet: input.sourceSheet,
    sourceRow: input.sourceRow
  });
}

export function parcelIdentityKey(identity: ParcelIdentity) {
  const cohort = identity.cohort.state === "RESOLVED" ? identity.cohort.definition.id : "UNRESOLVED";
  return `${cohort}|${identity.agency}|${identity.canonicalCode}`;
}
