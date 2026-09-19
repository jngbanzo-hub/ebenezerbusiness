import { deepFreeze, validateBusinessDate, validateOccurredAt } from "../contracts/common";
import { CASH_AGENCIES, createCashEvent, normalizeCashAgency, type CashAgency } from "./cash-contract";
import type { DailyCashProjection } from "./cash-projection";

export type CashAdminIdentity = Readonly<{
  userId: string;
  name: string;
  role: "ADMIN";
}>;

export type CashAdminChange = Readonly<{
  changeId: string;
  auditId: string;
  kind: "INITIAL_BALANCE_VALIDATED" | "ADMIN_ADJUSTMENT_ADDED" | "ERROR_CORRECTED";
  agency: CashAgency;
  targetId: string;
  previousValue: number | null;
  newValue: number;
  reason: string;
  adminUserId: string;
  adminName: string;
  occurredAt: string;
}>;

export type CashDayDecision = Readonly<{
  decisionId: string;
  auditId: string;
  action: "CLOSED" | "REOPENED";
  agency: CashAgency;
  businessDate: string;
  balance: number;
  previousStatus: "OPEN" | "CLOSED";
  newStatus: "OPEN" | "CLOSED";
  reason: string;
  adminUserId: string;
  adminName: string;
  occurredAt: string;
}>;

export type CashAnomaly = Readonly<{
  code: "PAYMENTS_TOTAL_MISMATCH" | "EXPENSES_TOTAL_MISMATCH";
  agency: CashAgency;
  businessDate: string;
  expectedValue: number;
  actualValue: number;
  difference: number;
}>;

export function createAdminCashChange(input: Omit<CashAdminChange, "agency" | "adminUserId" | "adminName"> & Readonly<{
  agency: unknown;
  admin: CashAdminIdentity;
}>): CashAdminChange {
  const agency = normalizeCashAgency(input.agency);
  assertAdmin(input.admin);
  requireText(input.changeId, "INVALID_CHANGE_ID");
  requireText(input.auditId, "INVALID_AUDIT_ID");
  requireText(input.targetId, "INVALID_TARGET_ID");
  requireText(input.reason, "INVALID_REASON");
  validateOccurredAt(input.occurredAt);
  assertMoney(input.newValue);
  if (input.previousValue !== null) assertMoney(input.previousValue);
  if (input.kind === "INITIAL_BALANCE_VALIDATED" && input.previousValue !== null) throw new Error("INITIAL_BALANCE_ALREADY_DEFINED");
  if (input.kind !== "INITIAL_BALANCE_VALIDATED" && input.previousValue === null) throw new Error("PREVIOUS_VALUE_REQUIRED");
  if (input.previousValue === input.newValue) throw new Error("UNCHANGED_ADMIN_VALUE");

  return deepFreeze({
    changeId: input.changeId,
    auditId: input.auditId,
    kind: input.kind,
    agency,
    targetId: input.targetId,
    previousValue: input.previousValue,
    newValue: input.newValue,
    reason: input.reason.trim(),
    adminUserId: input.admin.userId,
    adminName: input.admin.name,
    occurredAt: input.occurredAt,
  });
}

export function adminChangeToCashEvent(change: CashAdminChange, input: Readonly<{
  eventId: string;
  requestId: string;
  businessDate: string;
}>) {
  if (change.kind === "INITIAL_BALANCE_VALIDATED") throw new Error("INITIAL_BALANCE_IS_NOT_A_DAILY_MOVEMENT");
  validateBusinessDate(input.businessDate);
  const previous = change.previousValue as number;
  const delta = Math.round((change.newValue - previous) * 100) / 100;
  return createCashEvent({
    eventId: input.eventId,
    eventType: change.kind === "ERROR_CORRECTED" ? "CASH_CORRECTION_RECORDED" : "ADMIN_ADJUSTMENT_RECORDED",
    agency: change.agency,
    businessDate: input.businessDate,
    occurredAt: change.occurredAt,
    direction: delta > 0 ? "CREDIT" : "DEBIT",
    amount: Math.abs(delta),
    currency: "USD",
    sourceId: change.changeId,
    requestId: input.requestId,
    actorUserId: change.adminUserId,
    actorName: change.adminName,
    correctsEventId: change.kind === "ERROR_CORRECTED" ? change.targetId : null,
    reason: change.reason,
    metadata: {
      auditId: change.auditId,
      previousValue: previous,
      newValue: change.newValue,
    },
  });
}

export function closeCashDay(projection: DailyCashProjection, admin: CashAdminIdentity, input: Readonly<{
  decisionId: string;
  auditId: string;
  occurredAt: string;
}>) {
  if (projection.status !== "OPEN") throw new Error("DAY_ALREADY_CLOSED");
  return createDayDecision(projection, admin, { ...input, action: "CLOSED", reason: "Clôture journalière validée" });
}

export function reopenCashDay(projection: DailyCashProjection, admin: CashAdminIdentity, input: Readonly<{
  decisionId: string;
  auditId: string;
  occurredAt: string;
  reason: string;
}>) {
  if (projection.status !== "CLOSED") throw new Error("DAY_NOT_CLOSED");
  requireText(input.reason, "INVALID_REOPEN_REASON");
  return createDayDecision(projection, admin, { ...input, action: "REOPENED", reason: input.reason });
}

export function canReadCash(identity: Readonly<{ role: "AGENT" | "ADMIN"; agency?: unknown }>, targetAgency: unknown) {
  let target: CashAgency;
  try { target = normalizeCashAgency(targetAgency); } catch { return false; }
  if (identity.role === "ADMIN") return true;
  try { return normalizeCashAgency(identity.agency) === target; } catch { return false; }
}

export function buildAdminCashOverview(projections: readonly DailyCashProjection[], cooRevenueOutsideCash: number) {
  assertMoney(cooRevenueOutsideCash);
  const byAgency = new Map(projections.map((projection) => [projection.agency, projection]));
  if (projections.length !== CASH_AGENCIES.length || CASH_AGENCIES.some((agency) => !byAgency.has(agency))) {
    throw new Error("INCOMPLETE_ADMIN_CASH_SCOPE");
  }
  const cashes = CASH_AGENCIES.map((agency) => byAgency.get(agency) as DailyCashProjection);
  return deepFreeze({
    cashes,
    consolidatedCashBalance: money(cashes.reduce((total, cash) => total + cash.currentBalance, 0)),
    cooRevenueOutsideCash,
  });
}

export function detectCashAnomalies(projection: DailyCashProjection, sourceTotals: Readonly<{
  paymentsTotal: number;
  expensesTotal: number;
}>): readonly CashAnomaly[] {
  assertMoney(sourceTotals.paymentsTotal);
  assertMoney(sourceTotals.expensesTotal);
  const anomalies: CashAnomaly[] = [];
  if (sourceTotals.paymentsTotal !== projection.paymentsTotal) anomalies.push(anomaly("PAYMENTS_TOTAL_MISMATCH", projection, sourceTotals.paymentsTotal, projection.paymentsTotal));
  if (sourceTotals.expensesTotal !== projection.expensesTotal) anomalies.push(anomaly("EXPENSES_TOTAL_MISMATCH", projection, sourceTotals.expensesTotal, projection.expensesTotal));
  return deepFreeze(anomalies);
}

function createDayDecision(projection: DailyCashProjection, admin: CashAdminIdentity, input: Readonly<{
  decisionId: string; auditId: string; occurredAt: string; action: "CLOSED" | "REOPENED"; reason: string;
}>): CashDayDecision {
  assertAdmin(admin);
  requireText(input.decisionId, "INVALID_DECISION_ID");
  requireText(input.auditId, "INVALID_AUDIT_ID");
  validateOccurredAt(input.occurredAt);
  const closed = input.action === "CLOSED";
  return deepFreeze({ decisionId: input.decisionId, auditId: input.auditId, action: input.action, agency: projection.agency, businessDate: projection.businessDate, balance: projection.currentBalance, previousStatus: closed ? "OPEN" : "CLOSED", newStatus: closed ? "CLOSED" : "OPEN", reason: input.reason.trim(), adminUserId: admin.userId, adminName: admin.name, occurredAt: input.occurredAt });
}

function anomaly(code: CashAnomaly["code"], projection: DailyCashProjection, expectedValue: number, actualValue: number): CashAnomaly {
  return { code, agency: projection.agency, businessDate: projection.businessDate, expectedValue, actualValue, difference: money(actualValue - expectedValue) };
}

function assertAdmin(admin: CashAdminIdentity) {
  if (admin.role !== "ADMIN") throw new Error("ADMIN_REQUIRED");
  requireText(admin.userId, "INVALID_ADMIN");
  requireText(admin.name, "INVALID_ADMIN");
}

function assertMoney(value: number) {
  if (!Number.isFinite(value) || value < 0 || Math.round(value * 100) !== value * 100) throw new Error("INVALID_MONEY");
}

function requireText(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(code);
}

function money(value: number) { return Math.round(value * 100) / 100; }
