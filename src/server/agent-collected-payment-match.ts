export type CollectedParcelIdentity = {
  parcelId: string;
  forwardingId: string | null;
  trackingCode: string;
  agency: string;
};

export type CompletedDestinationPayment = {
  requestId: string;
  parcelId: string | null;
  forwardingId: string | null;
  trackingCode: string;
  agency: string;
  paidAmount: number;
  paymentCreated: boolean;
  state: string;
  cashEventId: string | null;
  storageEventId: string | null;
};

export type CanonicalDestinationPayment = {
  paymentRequestId?: string;
  codeColis: string;
  destinationCode: string;
  agenceEncaissement: string;
  montantPaye: number;
  soldeRestant: number | null;
  dateTime: string;
};

// This is presentation evidence only. Payment and delivery decisions remain elsewhere.
export function collectedPaymentDate(
  parcel: CollectedParcelIdentity,
  orchestration: CompletedDestinationPayment,
  payment: CanonicalDestinationPayment
): string | null {
  if (
    orchestration.state !== "COMPLETED" ||
    !orchestration.paymentCreated ||
    !orchestration.cashEventId ||
    !orchestration.storageEventId ||
    orchestration.parcelId !== parcel.parcelId ||
    orchestration.forwardingId !== parcel.forwardingId ||
    orchestration.trackingCode !== parcel.trackingCode ||
    orchestration.agency !== parcel.agency ||
    payment.paymentRequestId?.toLowerCase() !== orchestration.requestId.toLowerCase() ||
    payment.codeColis !== parcel.trackingCode ||
    payment.destinationCode !== parcel.agency ||
    payment.agenceEncaissement !== parcel.agency ||
    payment.soldeRestant !== 0 ||
    Math.round(payment.montantPaye * 100) !== Math.round(orchestration.paidAmount * 100)
  ) return null;

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(payment.dateTime)) return null;
  const timestamp = Date.parse(payment.dateTime);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
