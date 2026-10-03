import { createHash } from "crypto";

export type PendingPaymentIdentity = Readonly<{
  actorId: string;
  agency: string;
  trackingCode: string;
  parcelId: string;
  expectedAmount: number;
  paidAmount: number;
  fingerprint: string;
}>;

export type PendingPaymentCandidate = Readonly<{
  requestId: string;
  actorId: string;
  agency: string;
  trackingCode: string;
  parcelId: string | null;
  forwardingId: string | null;
  expectedAmount: number;
  paidAmount: number;
  fingerprint: string;
  state: string;
  paymentCreated: boolean;
  paymentResponse: unknown;
  cashEventId: string | null;
  storageEventId: string | null;
}>;

export type PendingPaymentEffects = Readonly<{
  canonicalPayment: boolean;
  sheetsPayment: boolean;
  cashEvent: boolean;
  storageEvent: boolean;
  concurrentCompleted: boolean;
}>;

export function destinationPaymentFingerprint(input: {
  actorUserId: string;
  agency: string;
  codeColis: string;
  destinationCode: string;
  modePaiement: string;
  montantPaye: number;
  observation: string;
  referencePaiement: string;
  operationContext: Record<string, unknown>;
}): string {
  // Preserve the Edge paymentFingerprint property order and normalized values.
  return createHash("sha256").update(JSON.stringify({
    actorUserId: input.actorUserId,
    agency: input.agency,
    codeColis: input.codeColis,
    destinationCode: input.destinationCode,
    modePaiement: input.modePaiement,
    montantPaye: input.montantPaye,
    observation: input.observation,
    referencePaiement: input.referencePaiement,
    operationContext: input.operationContext
  })).digest("hex");
}

export function originalPendingRequestId(
  identity: PendingPaymentIdentity,
  candidate: PendingPaymentCandidate | null,
  effects: PendingPaymentEffects
): string | null {
  if (!candidate) return null;
  if (candidate.fingerprint !== identity.fingerprint ||
      candidate.actorId !== identity.actorId ||
      candidate.agency !== identity.agency ||
      candidate.trackingCode !== identity.trackingCode ||
      candidate.forwardingId !== null ||
      (candidate.parcelId !== null && candidate.parcelId !== identity.parcelId) ||
      candidate.expectedAmount !== identity.expectedAmount ||
      candidate.paidAmount !== identity.paidAmount ||
      candidate.state !== "PENDING" || candidate.paymentCreated ||
      candidate.paymentResponse !== null || candidate.cashEventId !== null ||
      candidate.storageEventId !== null || effects.canonicalPayment ||
      effects.sheetsPayment || effects.cashEvent || effects.storageEvent ||
      effects.concurrentCompleted) return null;
  return candidate.requestId;
}
