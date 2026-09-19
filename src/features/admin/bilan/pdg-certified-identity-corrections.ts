import type { BilanAgency, CohortId } from "./bilan-contracts";

export const PDG_CERTIFIED_IDENTITY_CORRECTION = "PDG_CERTIFIED_IDENTITY_CORRECTION" as const;

export type PdgCertifiedIdentityCorrection = Readonly<{
  cohortId: CohortId;
  agency: BilanAgency;
  sourceRawCode: string;
  shipmentRawCode: string;
  canonicalParcelCode: string;
  resolutionType: typeof PDG_CERTIFIED_IDENTITY_CORRECTION;
  active: boolean;
  deactivatedReason: string | null;
}>;

export const PDG_CERTIFIED_IDENTITY_CORRECTIONS: readonly PdgCertifiedIdentityCorrection[] = Object.freeze([
  Object.freeze({
    cohortId: "2026-08",
    agency: "KLZ",
    sourceRawCode: "AT08026",
    shipmentRawCode: "AT08036KLZ",
    canonicalParcelCode: "AT08026",
    resolutionType: PDG_CERTIFIED_IDENTITY_CORRECTION,
    active: false,
    deactivatedReason: "La donnée EXPÉDITION actuelle porte désormais l’identité KLZ correcte AT08026KLZ."
  })
]);

export function findPdgCertifiedIdentityCorrection(
  cohortId: CohortId,
  agency: BilanAgency,
  sourceRawCode: string
) {
  return PDG_CERTIFIED_IDENTITY_CORRECTIONS.find((entry) =>
    entry.active && entry.cohortId === cohortId && entry.agency === agency && entry.sourceRawCode === sourceRawCode
  ) ?? null;
}
