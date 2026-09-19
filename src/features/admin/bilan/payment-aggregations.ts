import type { CohortId } from "./bilan-contracts";
import type { AggregatedQualityIssue, CohortPaymentsSummary } from "./bilan-aggregation-contracts";
import type { BilanPayment } from "./bilan-readers-contracts";
import { resolveCohort } from "./cohort-registry";

export function aggregateCohortPayments(payments: readonly BilanPayment[], cohortId: CohortId): CohortPaymentsSummary {
  const anomalies: AggregatedQualityIssue[] = [];
  const deduplicated = new Map<string, BilanPayment>();
  let unmatchedPayments = 0;
  for (const payment of payments) {
    const paymentCohort = resolveCohort(payment.code);
    if (paymentCohort.state !== "RESOLVED") {
      unmatchedPayments += 1;
      anomalies.push(issue("PAIEMENT_NON_RAPPROCHE", "ENCAISSEMENTS", payment.sourceReference, payment.collectingAgency, null, "Paiement exclu de la cohorte : code non résolu."));
      continue;
    }
    if (paymentCohort.definition.id !== cohortId) continue;
    const key = payment.paymentRequestId.trim() ? `REQUEST:${payment.paymentRequestId.trim().toLowerCase()}` : `SOURCE:${payment.sourceReference}`;
    if (!deduplicated.has(key)) deduplicated.set(key, payment);
  }
  const rows = Array.from(deduplicated.values());
  let expectedCertified = true;
  for (const payment of rows) if (payment.expectedAmount === null || payment.expectedAmount < 0) {
    expectedCertified = false;
    anomalies.push(issue("TARIF_HISTORIQUE_NON_DISPONIBLE", "ENCAISSEMENTS", payment.sourceReference, payment.collectingAgency, cohortId, "Taux d’encaissement non calculable."));
  }
  const receivedAmount = money(sum(rows.map(({ paidAmount }) => paidAmount)));
  const recordedExpectedAmount = money(sum(rows.map(({ expectedAmount }) => expectedAmount ?? 0)));
  const completePayments = rows.filter((row) => row.expectedAmount !== null && row.paidAmount >= row.expectedAmount).length;
  const partialPayments = rows.filter((row) => row.expectedAmount !== null && row.paidAmount > 0 && row.paidAmount < row.expectedAmount).length;
  return Object.freeze({
    cohortId,
    receivedAmount,
    recordedExpectedAmount,
    historicalRevenueStatus: "NON CERTIFIÉ",
    simulatedCurrentRateRevenue: null,
    paymentCount: rows.length,
    partialPayments,
    completePayments,
    unmatchedPayments,
    collectionRate: expectedCertified && recordedExpectedAmount > 0 ? money(receivedAmount / recordedExpectedAmount * 100) : null,
    anomalies: Object.freeze(anomalies)
  });
}

export function aggregatePeriodReceiptsUsd(payments: readonly BilanPayment[], period: Readonly<{ from: string; to: string }>) {
  return money(sum(payments.filter((payment) => payment.paymentDate.slice(0, 10) >= period.from && payment.paymentDate.slice(0, 10) <= period.to).map(({ paidAmount }) => paidAmount)));
}

function sum(values: readonly number[]) { return values.reduce((total, value) => total + value, 0); }
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function issue(type: string, source: string, reference: string, agency: string | null, cohortId: CohortId | null, impact: string): AggregatedQualityIssue { return Object.freeze({ type, source, reference, agency, cohortId, impact }); }
