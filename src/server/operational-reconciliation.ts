import type { AdminSite } from "@/features/admin/types";

export type OperationalSeverity = "INFO" | "ATTENTION" | "CRITICAL";
export type OperationalStatus = "NOUVEAU" | "A_VERIFIER" | "CONFIRME" | "RESOLU";
export type OperationalCategory = "CAISSE" | "ENCAISSEMENTS" | "STOCKAGE" | "ORCHESTRATION" | "CONTINUITE" | "PAGINATION" | "DOUBLON";

export type OperationalAnomaly = {
  id: string;
  category: OperationalCategory;
  agency: AdminSite | null;
  trackingCode: string | null;
  paymentRequestId: string | null;
  type: string;
  occurredAt: string;
  ageMinutes: number;
  interruptedStep: string | null;
  severity: OperationalSeverity;
  status: OperationalStatus;
  cause: string;
  recommendation: string;
  amountUsd: number | null;
  weightKg: number | null;
};

export type ReconciliationPayment = { requestId: string; trackingCode: string; agency: AdminSite; amountUsd: number; occurredAt: string };
export type ReconciliationCash = { eventId: string; requestId: string; agency: AdminSite; amountUsd: number; occurredAt: string };
export type ReconciliationStorage = { eventId: string; requestId: string; agency: AdminSite; trackingCode: string | null; weightKg: number | null; occurredAt: string };
export type ReconciliationOrchestration = { requestId: string; trackingCode: string; agency: AdminSite; state: string; paymentCreated: boolean; cashEventId: string | null; storageEventId: string | null; lastError: string | null; attemptCount: number; createdAt: string; updatedAt: string; completedAt: string | null };
export type CashClosure = { closureId: string; agency: AdminSite; businessDate: string; openingBalance: number; closingBalance: number; status: string; version: number; occurredAt: string };

export function orchestrationStage(row: ReconciliationOrchestration) {
  if (row.state === "COMPLETED" && row.cashEventId && row.storageEventId) return "COMPLETED" as const;
  if (row.state === "FAILED" || row.state === "COMPENSATION_REQUIRED" || row.lastError) return "ATTENTION" as const;
  if (row.storageEventId) return "STORAGE_CONFIRMED" as const;
  if (row.cashEventId) return "CASH_CONFIRMED" as const;
  if (row.paymentCreated) return "PAYMENT_CONFIRMED" as const;
  return "PENDING" as const;
}

export function reconcileOperations(input: {
  payments: readonly ReconciliationPayment[];
  cash: readonly ReconciliationCash[];
  storage: readonly ReconciliationStorage[];
  orchestrations: readonly ReconciliationOrchestration[];
  closures: readonly CashClosure[];
  now: Date;
  pendingMinutes?: number;
  availability?: { payments?: boolean; cash?: boolean; storage?: boolean; orchestrations?: boolean; closures?: boolean };
}) {
  const anomalies: OperationalAnomaly[] = [];
  const pendingMinutes = input.pendingMinutes ?? 15;
  const payments = group(input.payments, (row) => row.requestId);
  const cash = group(input.cash, (row) => row.requestId);
  const storage = group(input.storage, (row) => row.requestId);
  const orchestrations = new Map(input.orchestrations.map((row) => [row.requestId, row]));
  const available = { payments: true, cash: true, storage: true, orchestrations: true, closures: true, ...input.availability };

  for (const payment of input.payments) {
    if (!available.orchestrations || !orchestrations.has(payment.requestId)) continue;
    if (available.cash && !cash.has(payment.requestId)) anomalies.push(anomaly(payment, "ENCAISSEMENTS", "PAIEMENT_SANS_CASH_EVENT", "CAISSE", "Vérifier l’orchestration et le journal Caisse, sans recréer le paiement.", input.now, "CRITICAL"));
    if (available.storage && !storage.has(payment.requestId)) anomalies.push(anomaly(payment, "ENCAISSEMENTS", "PAIEMENT_SANS_SORTIE_STOCKAGE", "STOCKAGE", "Vérifier le checkpoint Stockage avant toute reprise idempotente.", input.now, "CRITICAL"));
  }
  if (available.payments) for (const row of input.cash) if (!payments.has(row.requestId)) anomalies.push(anomaly(row, "CAISSE", "CASH_EVENT_SANS_PAIEMENT_CANONIQUE", "PAIEMENT", "Contrôler la source canonique avant toute action.", input.now, "CRITICAL"));
  if (available.payments) for (const row of input.storage) if (!payments.has(row.requestId)) anomalies.push(anomaly(row, "STOCKAGE", "SORTIE_SANS_PAIEMENT_CANONIQUE", "PAIEMENT", "Contrôler le paiement canonique et l’identité colis.", input.now, "CRITICAL"));
  addDuplicates(anomalies, cash, "CASH_EVENT_DUPLIQUE", "CAISSE", input.now);
  addDuplicates(anomalies, storage, "SORTIE_STOCKAGE_DUPLIQUEE", "STOCKAGE", input.now);

  for (const row of input.orchestrations) {
    const age = ageMinutes(row.updatedAt, input.now);
    const stage = orchestrationStage(row);
    if (stage === "COMPLETED") continue;
    if (stage === "ATTENTION" || age >= pendingMinutes) {
      anomalies.push({
        id: `orchestration:${row.requestId}:${stage}`,
        category: "ORCHESTRATION", agency: row.agency, trackingCode: row.trackingCode,
        paymentRequestId: row.requestId, type: stage === "ATTENTION" ? "ORCHESTRATION_EN_ATTENTION" : "ORCHESTRATION_PENDING_TROP_LONGTEMPS",
        occurredAt: row.updatedAt, ageMinutes: age, interruptedStep: stage, severity: stage === "ATTENTION" ? "CRITICAL" : "ATTENTION",
        status: stage === "ATTENTION" ? "CONFIRME" : "A_VERIFIER", cause: row.lastError ?? `Checkpoint ${stage}`,
        recommendation: "Contrôler les checkpoints persistants puis utiliser uniquement la reprise idempotente existante.", amountUsd: null, weightKg: null
      });
    }
  }

  for (const continuity of available.closures ? cashContinuity(input.closures) : []) if (continuity.difference !== 0) {
    anomalies.push({
      id: `continuity:${continuity.agency}:${continuity.currentDate}`, category: "CONTINUITE", agency: continuity.agency,
      trackingCode: null, paymentRequestId: null, type: "ECART_CLOSING_J1_OPENING_J", occurredAt: continuity.occurredAt,
      ageMinutes: ageMinutes(continuity.occurredAt, input.now), interruptedStep: null, severity: "CRITICAL", status: "A_VERIFIER",
      cause: `Clôture ${continuity.previousDate}: ${continuity.expected}; ouverture ${continuity.currentDate}: ${continuity.observed}; écart ${continuity.difference}.`,
      recommendation: "Vérifier les clôtures et ajustements autorisés. Ne pas corriger automatiquement.", amountUsd: continuity.difference, weightKg: null
    });
  }

  const oldest = anomalies.reduce((max, row) => Math.max(max, row.ageMinutes), 0);
  return { anomalies: deduplicate(anomalies), metrics: {
    pending: input.orchestrations.filter((row) => orchestrationStage(row) === "PENDING").length,
    failed: input.orchestrations.filter((row) => orchestrationStage(row) === "ATTENTION").length,
    paymentsWithoutCash: anomalies.filter((row) => row.type === "PAIEMENT_SANS_CASH_EVENT").length,
    paymentsWithoutStorage: anomalies.filter((row) => row.type === "PAIEMENT_SANS_SORTIE_STOCKAGE").length,
    cashContinuityGaps: anomalies.filter((row) => row.type === "ECART_CLOSING_J1_OPENING_J").length,
    oldestAnomalyMinutes: oldest
  }};
}

export function cashContinuity(rows: readonly CashClosure[]) {
  const active = rows.filter((row) => row.status === "CLOSED").sort((a, b) => a.agency.localeCompare(b.agency) || a.businessDate.localeCompare(b.businessDate) || b.version - a.version);
  const latest = new Map<string, CashClosure>();
  for (const row of active) if (!latest.has(`${row.agency}:${row.businessDate}`)) latest.set(`${row.agency}:${row.businessDate}`, row);
  const byAgency = group(Array.from(latest.values()), (row) => row.agency);
  return Array.from(byAgency.values()).flatMap((agencyRows) => agencyRows.sort((a, b) => a.businessDate.localeCompare(b.businessDate)).slice(1).map((current, index) => {
    const previous = agencyRows[index];
    return { agency: current.agency, previousDate: previous.businessDate, currentDate: current.businessDate, expected: previous.closingBalance, observed: current.openingBalance, difference: cents(current.openingBalance - previous.closingBalance), occurredAt: current.occurredAt };
  }));
}

function anomaly(row: ReconciliationPayment | ReconciliationCash | ReconciliationStorage, category: OperationalCategory, type: string, step: string, recommendation: string, now: Date, severity: OperationalSeverity): OperationalAnomaly {
  return { id: `${type}:${row.requestId}`, category, agency: row.agency, trackingCode: "trackingCode" in row ? row.trackingCode : null, paymentRequestId: row.requestId, type, occurredAt: row.occurredAt, ageMinutes: ageMinutes(row.occurredAt, now), interruptedStep: step, severity, status: "A_VERIFIER", cause: type.replaceAll("_", " "), recommendation, amountUsd: "amountUsd" in row ? row.amountUsd : null, weightKg: "weightKg" in row ? row.weightKg : null };
}
function addDuplicates<T extends ReconciliationCash | ReconciliationStorage>(target: OperationalAnomaly[], rows: Map<string, T[]>, type: string, category: OperationalCategory, now: Date) { for (const values of Array.from(rows.values())) if (values.length > 1) target.push(anomaly(values[0], category, type, category, "Bloquer toute nouvelle écriture et auditer la contrainte d’unicité.", now, "CRITICAL")); }
function group<T>(rows: readonly T[], key: (row: T) => string) { const result = new Map<string, T[]>(); for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]); return result; }
function deduplicate(rows: OperationalAnomaly[]) { return Array.from(new Map(rows.map((row) => [row.id, row])).values()).sort((a, b) => b.severity.localeCompare(a.severity) || b.occurredAt.localeCompare(a.occurredAt)); }
function ageMinutes(value: string, now: Date) { const time = new Date(value).getTime(); return Number.isFinite(time) ? Math.max(0, Math.floor((now.getTime() - time) / 60_000)) : 0; }
function cents(value: number) { return Math.round(value * 100) / 100; }
