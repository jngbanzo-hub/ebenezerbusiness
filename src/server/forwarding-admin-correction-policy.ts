export type CorrectionEvidence = Readonly<{
  forwardingId: string;
  parcelId: string;
  trackingCode: string;
  originAgency: string;
  destinationAgency: string;
  weightKg: number;
  forwardingStatus: string;
  forwardingAmountPaid: number;
  forwardingCashEventId: string | null;
  forwardingDeliveryEventId: string | null;
  parcelAgency: string;
  parcelTrackingCode: string;
  parcelForwardingId: string | null;
  parcelWeightKg: number;
  parcelStatus: string;
  originAccountActive: boolean;
  destinationAccountActive: boolean;
  originNativeIdentityCount: number;
  relatedPaymentCount: number;
  relatedCashEventCount: number;
  laterPhysicalOperationCount: number;
  relatedCorrectionCount: number;
  originArrivalEvidenceCount: number;
  forwardingDepartureCount: number;
  forwardingArrivalCount: number;
  forwardingOrchestrationCount: number;
  financialProof: "VERIFIED" | "UNAVAILABLE" | "AMBIGUOUS";
  historicalExpectedUsd: number | null;
  historicalPaidUsd: number | null;
  currentNativeExpectedUsd: number | null;
}>;

export type CorrectionBlockCode =
  | "FORWARDING_NOT_REVERSIBLE"
  | "PARCEL_IDENTITY_MISMATCH"
  | "STORAGE_ACCOUNT_INACTIVE"
  | "ORIGIN_IDENTITY_COLLISION"
  | "SUBSEQUENT_OPERATION_EXISTS"
  | "CORRECTION_ALREADY_RECORDED"
  | "HISTORICAL_CYCLE_UNVERIFIED"
  | "HISTORICAL_TERMS_UNVERIFIED"
  | "NATIVE_PRICE_RULE_CONFLICT";

/** Read-only presentation guard. The transactional RPC repeats every database guard. */
export function correctionBlockers(evidence: CorrectionEvidence): CorrectionBlockCode[] {
  const blockers: CorrectionBlockCode[] = [];
  if (evidence.forwardingStatus !== "ARRIVAL_CONFIRMED" ||
      evidence.forwardingAmountPaid !== 0 || evidence.forwardingCashEventId || evidence.forwardingDeliveryEventId) {
    blockers.push("FORWARDING_NOT_REVERSIBLE");
  }
  if (!evidence.parcelId || !evidence.forwardingId ||
      evidence.parcelAgency !== evidence.destinationAgency ||
      evidence.parcelTrackingCode !== evidence.trackingCode ||
      evidence.parcelForwardingId !== evidence.forwardingId ||
      evidence.parcelWeightKg !== evidence.weightKg || evidence.parcelStatus !== "AVAILABLE" ||
      evidence.originAgency === evidence.destinationAgency) {
    blockers.push("PARCEL_IDENTITY_MISMATCH");
  }
  if (!evidence.originAccountActive || !evidence.destinationAccountActive) blockers.push("STORAGE_ACCOUNT_INACTIVE");
  if (evidence.originNativeIdentityCount !== 0) blockers.push("ORIGIN_IDENTITY_COLLISION");
  if (evidence.relatedPaymentCount !== 0 || evidence.relatedCashEventCount !== 0 || evidence.laterPhysicalOperationCount !== 0) {
    blockers.push("SUBSEQUENT_OPERATION_EXISTS");
  }
  if (evidence.relatedCorrectionCount !== 0) blockers.push("CORRECTION_ALREADY_RECORDED");
  if (evidence.originArrivalEvidenceCount !== 1 || evidence.forwardingDepartureCount !== 1 ||
      evidence.forwardingArrivalCount !== 1 || evidence.forwardingOrchestrationCount !== 1) {
    blockers.push("HISTORICAL_CYCLE_UNVERIFIED");
  }
  if (evidence.financialProof !== "VERIFIED" || evidence.historicalExpectedUsd === null ||
      evidence.historicalPaidUsd === null || evidence.historicalExpectedUsd <= 0 ||
      evidence.historicalPaidUsd < 0 || evidence.historicalPaidUsd > evidence.historicalExpectedUsd) {
    blockers.push("HISTORICAL_TERMS_UNVERIFIED");
  }
  if (evidence.financialProof === "VERIFIED" &&
      (evidence.currentNativeExpectedUsd === null || evidence.historicalExpectedUsd !== evidence.currentNativeExpectedUsd)) {
    blockers.push("NATIVE_PRICE_RULE_CONFLICT");
  }
  return blockers;
}
