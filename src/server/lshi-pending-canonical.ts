import type { CanonicalPaymentLookup } from "./admin-payments-sheets";
import type { ReconciliationOrchestration, ReconciliationPayment } from "./operational-reconciliation";

export type CanonicalPaymentStatus = "PRESENT" | "ABSENT" | "UNKNOWN";

export async function resolveLshiPendingCanonical(
  orchestrations: readonly ReconciliationOrchestration[],
  read: (ids: readonly string[]) => Promise<Map<string, CanonicalPaymentLookup>>
) {
  const pending = orchestrations.filter((row) => row.agency === "LSHI" && (row.state !== "COMPLETED" || !row.cashEventId || !row.storageEventId));
  const statuses = new Map<string, CanonicalPaymentStatus>(pending.map((row) => [row.requestId, "UNKNOWN"]));
  const payments: ReconciliationPayment[] = [];
  if (!pending.length) return { pending, statuses, payments };
  try {
    const results = await read(Array.from(statuses.keys()));
    for (const row of pending) {
      const result = results.get(row.requestId);
      if (result?.status === "ABSENT") {
        // A persisted payment checkpoint conflicts with absence: manual review.
        statuses.set(row.requestId, row.paymentCreated ? "UNKNOWN" : "ABSENT");
      } else if (result?.status === "FOUND") {
        const payment = result.payment;
        if (payment.paymentRequestId !== row.requestId || payment.codeColis !== row.trackingCode || payment.destinationCode !== row.agency || payment.statutPaiement !== "SOLDÉ" || payment.soldeRestant !== 0 || payment.montantAttendu === null || payment.montantPaye < payment.montantAttendu) continue;
        statuses.set(row.requestId, "PRESENT");
        payments.push({ requestId: row.requestId, trackingCode: payment.codeColis, agency: row.agency, amountUsd: payment.montantPaye, weightKg: payment.poidsKg, occurredAt: payment.dateTime });
      }
    }
  } catch {
    // No credentials, network details or source data are logged.
  }
  return { pending, statuses, payments };
}

export function replacePendingPayments(recent: readonly ReconciliationPayment[], resolved: Awaited<ReturnType<typeof resolveLshiPendingCanonical>>) {
  return [...recent.filter((row) => !resolved.statuses.has(row.requestId)), ...resolved.payments];
}
