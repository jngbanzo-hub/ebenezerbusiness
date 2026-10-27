export type CollectedParcelIdentity = {
  parcelId: string;
  deliveredEventId?: string | null;
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

export type CompletedDeliveryEvidence = {
  eventId: string;
  eventType: string;
  trackingCode: string | null;
  agency: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string;
  occurredAt: string;
};

export function uniqueCompletedPaymentCandidate<T>(current: readonly T[], historical: readonly T[]): T | null {
  const candidates = [...current, ...historical];
  return candidates.length === 1 ? candidates[0] : null;
}

export function verifiedPaymentAgent(canonicalAgent: string, orchestrationAgent: string): string | null {
  const canonical = canonicalAgent.trim().replace(/\s+/g, " ");
  const orchestration = orchestrationAgent.trim().replace(/\s+/g, " ");
  return canonical && orchestration && canonical.toLocaleLowerCase("fr") === orchestration.toLocaleLowerCase("fr")
    ? canonical
    : null;
}

export function confirmedDeliveryEvidence(
  parcel: CollectedParcelIdentity & { deliveryStatus: string; deliveredBy: string | null },
  event: CompletedDeliveryEvidence
): { deliveredAt: string; deliveredByName: string | null } | null {
  if (
    parcel.deliveryStatus !== "DELIVERED" ||
    !parcel.deliveredEventId ||
    event.eventId !== parcel.deliveredEventId ||
    event.eventType !== (parcel.forwardingId ? "SORTIE_APRES_REMISE_ACHEMINEMENT" : "CONFIRMED_DELIVERY_RECORDED") ||
    event.trackingCode !== parcel.trackingCode ||
    event.agency !== parcel.agency ||
    event.actorRole !== "AGENT" ||
    (event.actorId && parcel.deliveredBy && event.actorId !== parcel.deliveredBy)
  ) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(event.occurredAt)) return null;
  const timestamp = Date.parse(event.occurredAt);
  return Number.isFinite(timestamp)
    ? { deliveredAt: new Date(timestamp).toISOString(), deliveredByName: event.actorId ? event.actorName?.trim() || null : null }
    : null;
}

export function confirmedCooPaymentSnapshot(
  snapshot: unknown,
  payments: readonly (CanonicalDestinationPayment & { id: string; reference: string })[],
  parcel: CollectedParcelIdentity,
  deliveredAt: string
): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const value = snapshot as { checked?: unknown; totalPaid?: unknown; references?: unknown };
  if (value.checked !== true || typeof value.totalPaid !== "number" || !Number.isFinite(value.totalPaid) ||
    !Array.isArray(value.references) || value.references.length === 0 ||
    value.references.some((reference) => typeof reference !== "string" || !reference.trim()) ||
    new Set(value.references).size !== value.references.length) return false;
  const matching = value.references.map((reference) => payments.filter((payment) => (payment.reference || payment.id) === reference));
  if (matching.some((rows) => rows.length !== 1)) return false;
  const rows = matching.map(([payment]) => payment);
  const allCooPaymentsForIdentity = payments.filter((payment) => payment.agenceEncaissement === "COO" &&
    payment.codeColis === parcel.trackingCode && payment.destinationCode === parcel.agency);
  const deliveryTimestamp = Date.parse(deliveredAt);
  if (rows.some((payment) => payment.agenceEncaissement !== "COO" ||
    payment.codeColis !== parcel.trackingCode || payment.destinationCode !== parcel.agency ||
    !Number.isFinite(Date.parse(payment.dateTime)) || Date.parse(payment.dateTime) > deliveryTimestamp) ||
    !Number.isFinite(deliveryTimestamp) || allCooPaymentsForIdentity.length !== rows.length) return false;
  const sum = rows.reduce((amount, payment) => amount + payment.montantPaye, 0);
  return Math.round(sum * 100) === Math.round(value.totalPaid * 100) && rows.at(-1)?.soldeRestant === 0;
}

// This is presentation evidence only. Payment and delivery decisions remain elsewhere.
export function collectedPaymentDate(
  parcel: CollectedParcelIdentity,
  orchestration: CompletedDestinationPayment,
  payment: CanonicalDestinationPayment
): string | null {
  const physicalIdentityMatches = orchestration.parcelId === parcel.parcelId || (
    orchestration.parcelId === null &&
    Boolean(parcel.deliveredEventId) &&
    orchestration.storageEventId === parcel.deliveredEventId
  );
  if (
    orchestration.state !== "COMPLETED" ||
    !orchestration.paymentCreated ||
    !orchestration.cashEventId ||
    !orchestration.storageEventId ||
    !physicalIdentityMatches ||
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
