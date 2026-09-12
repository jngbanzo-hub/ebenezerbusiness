import type { AdminSite } from "@/features/admin/types";

export type OperationalSeverity = "INFO" | "ATTENTION" | "CRITICAL";
export type OperationalStatus = "NOUVEAU" | "A_VERIFIER" | "CONFIRME" | "RESOLU" | "INFORMATION";
export type OperationalCategory = "CAISSE" | "ENCAISSEMENTS" | "STOCKAGE" | "ORCHESTRATION" | "CONTINUITE" | "PAGINATION" | "DOUBLON";
export type OperationalTemporalClass = "HISTORIQUE" | "NOUVELLE_APRES_PROTECTIONS";
export const OPERATIONAL_PROTECTIONS_DEPLOYED_AT = "2026-09-12T02:39:40.000Z";

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
  parcelId: string | null;
  forwardingId: string | null;
  originAgency: AdminSite | null;
  destinationAgency: AdminSite | null;
  nature: "NATIF" | "FORWARDING" | "INDETERMINE";
  dossierKey: string;
  temporalClass: OperationalTemporalClass;
};

type ReconciliationIdentity = { parcelId?: string | null; forwardingId?: string | null; originAgency?: AdminSite | null; destinationAgency?: AdminSite | null };
export type ReconciliationPayment = ReconciliationIdentity & { requestId: string; trackingCode: string; agency: AdminSite; amountUsd: number; occurredAt: string };
export type ReconciliationCash = ReconciliationIdentity & { eventId: string; requestId: string; agency: AdminSite; amountUsd: number; occurredAt: string };
export type ReconciliationStorage = ReconciliationIdentity & { eventId: string; requestId: string; agency: AdminSite; trackingCode: string | null; weightKg: number | null; occurredAt: string };
export type ReconciliationOrchestration = ReconciliationIdentity & { requestId: string; trackingCode: string; agency: AdminSite; state: string; paymentCreated: boolean; cashEventId: string | null; storageEventId: string | null; lastError: string | null; attemptCount: number; createdAt: string; updatedAt: string; completedAt: string | null };
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
  protectionsDeployedAt?: Date;
  availability?: { payments?: boolean; cash?: boolean; storage?: boolean; orchestrations?: boolean; closures?: boolean };
}) {
  const anomalies: OperationalAnomaly[] = [];
  const information: OperationalAnomaly[] = [];
  const pendingMinutes = input.pendingMinutes ?? 15;
  const payments = group(input.payments, (row) => row.requestId);
  const cash = group(input.cash, (row) => row.requestId);
  const storage = group(input.storage, (row) => row.requestId);
  const orchestrations = new Map(input.orchestrations.map((row) => [row.requestId, row]));
  const available = { payments: true, cash: true, storage: true, orchestrations: true, closures: true, ...input.availability };

  for (const payment of input.payments) {
    const orchestration = orchestrations.get(payment.requestId);
    if (!available.orchestrations || !orchestration) continue;
    const identifiedPayment = { ...payment, ...identity(orchestration) };
    if (available.cash && !hasEffect(payment.requestId, orchestration, cash)) anomalies.push(anomaly(identifiedPayment, "ENCAISSEMENTS", "PAIEMENT_SANS_CASH_EVENT", "CAISSE", "Vérifier l’orchestration et le journal Caisse, sans recréer le paiement.", input.now, "CRITICAL"));
    if (available.storage && !hasEffect(payment.requestId, orchestration, storage)) anomalies.push(anomaly(identifiedPayment, "ENCAISSEMENTS", "PAIEMENT_SANS_SORTIE_STOCKAGE", "STOCKAGE", "Vérifier le checkpoint Stockage avant toute reprise idempotente.", input.now, "CRITICAL"));
  }
  if (available.payments) for (const row of input.cash) if (!hasPayment(row, payments, orchestrations)) anomalies.push(anomaly(row, "CAISSE", "CASH_EVENT_SANS_PAIEMENT_CANONIQUE", "PAIEMENT", "Contrôler la source canonique avant toute action.", input.now, "CRITICAL"));
  if (available.payments) for (const row of input.storage) if (!hasPayment(row, payments, orchestrations)) anomalies.push(anomaly(row, "STOCKAGE", "SORTIE_SANS_PAIEMENT_CANONIQUE", "PAIEMENT", "Contrôler le paiement canonique et l’identité colis.", input.now, "CRITICAL"));
  addDuplicates(anomalies, cash, "CASH_EVENT_DUPLIQUE", "CAISSE", input.now);
  addDuplicates(anomalies, storage, "SORTIE_STOCKAGE_DUPLIQUEE", "STOCKAGE", input.now);

  for (const row of input.orchestrations) {
    const age = ageMinutes(row.updatedAt, input.now);
    const stage = orchestrationStage(row);
    if (stage === "COMPLETED") continue;
    if (stage === "PENDING" && !payments.has(row.requestId) && !row.lastError) {
      information.push({ ...anomaly(row, "ORCHESTRATION", "ORCHESTRATION_EN_ATTENTE_LEGITIME", null, "Aucune action : aucun paiement canonique n’existe pour cette tentative.", input.now, "INFO"), status: "INFORMATION" });
      continue;
    }
    if (stage === "ATTENTION" || age >= pendingMinutes) {
      const projected = anomaly(row, "ORCHESTRATION", stage === "ATTENTION" ? "ORCHESTRATION_EN_ATTENTION" : "ORCHESTRATION_PENDING_TROP_LONGTEMPS", stage, "Contrôler les checkpoints persistants puis utiliser uniquement la reprise idempotente existante.", input.now, stage === "ATTENTION" ? "CRITICAL" : "ATTENTION");
      anomalies.push({ ...projected, id: `orchestration:${row.requestId}:${stage}`, status: stage === "ATTENTION" ? "CONFIRME" : "A_VERIFIER", cause: row.lastError ?? `Checkpoint ${stage}` });
    }
  }

  for (const continuity of available.closures ? cashContinuity(input.closures) : []) if (continuity.difference !== 0) {
    anomalies.push({
      id: `continuity:${continuity.agency}:${continuity.currentDate}`, category: "CONTINUITE", agency: continuity.agency,
      trackingCode: null, paymentRequestId: null, type: "ECART_CLOSING_J1_OPENING_J", occurredAt: continuity.occurredAt,
      ageMinutes: ageMinutes(continuity.occurredAt, input.now), interruptedStep: null, severity: "CRITICAL", status: "A_VERIFIER",
      cause: `Clôture ${continuity.previousDate}: ${continuity.expected}; ouverture ${continuity.currentDate}: ${continuity.observed}; écart ${continuity.difference}.`,
      recommendation: "Vérifier les clôtures et ajustements autorisés. Ne pas corriger automatiquement.", amountUsd: continuity.difference, weightKg: null,
      parcelId: null, forwardingId: null, originAgency: null, destinationAgency: null, nature: "INDETERMINE",
      dossierKey: `CONTINUITE:${continuity.agency}:${continuity.currentDate}`, temporalClass: "HISTORIQUE"
    });
  }

  const deployedAt = input.protectionsDeployedAt ?? new Date(OPERATIONAL_PROTECTIONS_DEPLOYED_AT);
  const active = deduplicate(anomalies).map((row) => classify(row, deployedAt));
  const informational = deduplicate(information).map((row) => classify(row, deployedAt));
  const oldest = active.reduce((max, row) => Math.max(max, row.ageMinutes), 0);
  return { anomalies: active, information: informational, metrics: {
    pending: active.filter((row) => row.type === "ORCHESTRATION_PENDING_TROP_LONGTEMPS").length,
    legitimatePending: informational.length,
    failed: input.orchestrations.filter((row) => orchestrationStage(row) === "ATTENTION").length,
    paymentsWithoutCash: anomalies.filter((row) => row.type === "PAIEMENT_SANS_CASH_EVENT").length,
    paymentsWithoutStorage: anomalies.filter((row) => row.type === "PAIEMENT_SANS_SORTIE_STOCKAGE").length,
    cashContinuityGaps: anomalies.filter((row) => row.type === "ECART_CLOSING_J1_OPENING_J").length,
    oldestAnomalyMinutes: oldest,
    realDossiers: new Set(active.map((row) => row.dossierKey)).size,
    historical: active.filter((row) => row.temporalClass === "HISTORIQUE").length,
    newAfterProtections: active.filter((row) => row.temporalClass === "NOUVELLE_APRES_PROTECTIONS").length
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

function anomaly(row: ReconciliationPayment | ReconciliationCash | ReconciliationStorage | ReconciliationOrchestration, category: OperationalCategory, type: string, step: string | null, recommendation: string, now: Date, severity: OperationalSeverity): OperationalAnomaly {
  const occurredAt = "occurredAt" in row ? row.occurredAt : row.updatedAt;
  const rowIdentity = identity(row);
  return { id: `${type}:${row.requestId}`, category, agency: row.agency, trackingCode: "trackingCode" in row ? row.trackingCode : null, paymentRequestId: row.requestId, type, occurredAt, ageMinutes: ageMinutes(occurredAt, now), interruptedStep: step, severity, status: "A_VERIFIER", cause: type.replaceAll("_", " "), recommendation, amountUsd: "amountUsd" in row ? row.amountUsd : null, weightKg: "weightKg" in row ? row.weightKg : null, ...rowIdentity, nature: rowIdentity.forwardingId ? "FORWARDING" : rowIdentity.parcelId ? "NATIF" : "INDETERMINE", dossierKey: dossierKey(row), temporalClass: "HISTORIQUE" };
}
function addDuplicates<T extends ReconciliationCash | ReconciliationStorage>(target: OperationalAnomaly[], rows: Map<string, T[]>, type: string, category: OperationalCategory, now: Date) { for (const values of Array.from(rows.values())) if (values.length > 1) target.push(anomaly(values[0], category, type, category, "Bloquer toute nouvelle écriture et auditer la contrainte d’unicité.", now, "CRITICAL")); }
function group<T>(rows: readonly T[], key: (row: T) => string) { const result = new Map<string, T[]>(); for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]); return result; }
function deduplicate(rows: OperationalAnomaly[]) { return Array.from(new Map(rows.map((row) => [row.id, row])).values()).sort((a, b) => b.severity.localeCompare(a.severity) || b.occurredAt.localeCompare(a.occurredAt)); }
function ageMinutes(value: string, now: Date) { const time = new Date(value).getTime(); return Number.isFinite(time) ? Math.max(0, Math.floor((now.getTime() - time) / 60_000)) : 0; }
function cents(value: number) { return Math.round(value * 100) / 100; }
function identity(row: ReconciliationIdentity) { return { parcelId: row.parcelId ?? null, forwardingId: row.forwardingId ?? null, originAgency: row.originAgency ?? null, destinationAgency: row.destinationAgency ?? null }; }
function dossierKey(row: { requestId: string } & ReconciliationIdentity) { return row.forwardingId ? `FORWARDING:${row.forwardingId}` : row.parcelId ? `PARCEL:${row.parcelId}` : `REQUEST:${row.requestId}`; }
function sameIdentity(left: ReconciliationIdentity, right: ReconciliationIdentity) { return Boolean((left.forwardingId && right.forwardingId === left.forwardingId) || (left.parcelId && right.parcelId === left.parcelId)); }
function hasEffect<T extends ReconciliationCash | ReconciliationStorage>(requestId: string, orchestration: ReconciliationOrchestration, effects: Map<string, T[]>) { return effects.has(requestId) || Array.from(effects.values()).some((rows) => rows.some((row) => sameIdentity(orchestration, row))); }
function hasPayment(effect: ReconciliationCash | ReconciliationStorage, payments: Map<string, ReconciliationPayment[]>, orchestrations: Map<string, ReconciliationOrchestration>) { if (payments.has(effect.requestId)) return true; return Array.from(orchestrations.values()).some((row) => payments.has(row.requestId) && sameIdentity(row, effect)); }
function classify(row: OperationalAnomaly, deployedAt: Date): OperationalAnomaly { return { ...row, temporalClass: new Date(row.occurredAt) < deployedAt ? "HISTORIQUE" : "NOUVELLE_APRES_PROTECTIONS" }; }
