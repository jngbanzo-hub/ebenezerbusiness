import type { CanonicalPaymentLookup } from "./admin-payments-sheets";
import type { ReconciliationCash, ReconciliationOrchestration, ReconciliationPayment, ReconciliationStorage } from "./operational-reconciliation";

export type CanonicalPaymentStatus = "PRESENT" | "ABSENT" | "UNKNOWN";

export async function resolveLshiPendingCanonical(
  orchestrations: readonly ReconciliationOrchestration[],
  read: (ids: readonly string[]) => Promise<Map<string, CanonicalPaymentLookup>>,
  effects: readonly (ReconciliationCash | ReconciliationStorage)[] = []
) {
  const pending = orchestrations.filter((row) => row.agency === "LSHI" && (row.state !== "COMPLETED" || !row.cashEventId || !row.storageEventId));
  const targets = new Map(pending.map((row) => [row.requestId, row]));
  const references = new Map<string, Array<ReconciliationCash | ReconciliationStorage>>();
  const ambiguous = new Set<string>();
  for (const effect of effects.filter((row) => row.agency === "LSHI")) {
    // A forwarding exit may carry a different request id: use strong identity,
    // never tracking_code alone. Ambiguity remains UNKNOWN, not absent.
    const matches = orchestrations.filter((row) => row.agency === "LSHI" && (row.requestId === effect.requestId || row.cashEventId === effect.eventId || row.storageEventId === effect.eventId || (effect.forwardingId && row.forwardingId === effect.forwardingId) || (effect.parcelId && row.parcelId === effect.parcelId)));
    const exact = matches.find((row) => row.requestId === effect.requestId);
    const match = exact ?? (matches.length === 1 ? matches[0] : undefined);
    const id = match?.requestId ?? effect.requestId;
    if (!match && matches.length > 1) ambiguous.add(id);
    if (match) targets.set(id, match);
    references.set(id, [...(references.get(id) ?? []), effect]);
  }
  const statuses = new Map<string, CanonicalPaymentStatus>([...Array.from(targets.keys()), ...Array.from(references.keys())].map((id) => [id, "UNKNOWN"]));
  const payments: ReconciliationPayment[] = [];
  const effectOrchestrations = Array.from(targets.values());
  if (!statuses.size) return { pending, effectOrchestrations, statuses, payments };
  try {
    const results = await read(Array.from(statuses.keys()));
    for (const id of Array.from(statuses.keys())) {
      if (ambiguous.has(id)) continue;
      const row = targets.get(id);
      const result = results.get(id);
      if (result?.status === "ABSENT") {
        // A persisted payment checkpoint conflicts with absence: manual review.
        statuses.set(id, row?.paymentCreated ? "UNKNOWN" : "ABSENT");
      } else if (result?.status === "FOUND") {
        const payment = result.payment;
        if (payment.paymentRequestId !== id || (row && payment.codeColis !== row.trackingCode) || payment.destinationCode !== "LSHI" || payment.statutPaiement !== "SOLDÉ" || payment.soldeRestant !== 0 || payment.montantAttendu === null || payment.montantPaye < payment.montantAttendu) continue;
        if ((references.get(id) ?? []).some((effect) => "trackingCode" in effect && effect.trackingCode && effect.trackingCode !== payment.codeColis)) continue;
        statuses.set(id, "PRESENT");
        payments.push({ requestId: id, trackingCode: payment.codeColis, agency: "LSHI", amountUsd: payment.montantPaye, weightKg: payment.poidsKg, occurredAt: payment.dateTime });
      }
    }
  } catch {
    // No credentials, network details or source data are logged.
  }
  return { pending, effectOrchestrations, statuses, payments };
}

export function replacePendingPayments(recent: readonly ReconciliationPayment[], resolved: Awaited<ReturnType<typeof resolveLshiPendingCanonical>>) {
  return [...recent.filter((row) => !resolved.statuses.has(row.requestId)), ...resolved.payments];
}
