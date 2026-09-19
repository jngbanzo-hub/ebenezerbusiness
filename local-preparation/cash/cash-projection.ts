import { deepFreeze, validateBusinessDate, validateOccurredAt } from "../contracts/common";
import { createCashEvent, normalizeCashAgency, type CashAgency, type CashEvent } from "./cash-contract";

export type AgentCashBreakdown = Readonly<{
  actorUserId: string;
  actorName: string;
  paymentCount: number;
  amountCollected: number;
}>;

export type DailyCashClosure = Readonly<{
  closureId: string;
  agency: CashAgency;
  businessDate: string;
  closedAt: string;
  closedByAdminId: string;
  balance: number;
}>;

export type DailyCashProjection = Readonly<{
  agency: CashAgency;
  businessDate: string;
  currency: "USD";
  yesterdayBalance: number;
  paymentsTotal: number;
  expensesTotal: number;
  correctionsNet: number;
  currentBalance: number;
  paymentCount: number;
  expenseCount: number;
  byAgent: readonly AgentCashBreakdown[];
  status: "OPEN" | "CLOSED";
  closure: DailyCashClosure | null;
  auditEvents: readonly CashEvent[];
}>;

export function buildDailyCashProjection(input: Readonly<{
  agency: unknown;
  businessDate: string;
  yesterdayBalance: number;
  events: readonly CashEvent[];
  closure?: DailyCashClosure | null;
}>): DailyCashProjection {
  const agency = normalizeCashAgency(input.agency);
  validateBusinessDate(input.businessDate);
  assertNonNegativeMoney(input.yesterdayBalance);
  if (!Array.isArray(input.events)) throw new Error("INVALID_CASH_HISTORY");

  const events = input.events.map((event) => createCashEvent(event));
  assertUnique(events.map((event) => event.eventId), "DUPLICATE_EVENT_ID");
  assertUnique(events.map((event) => event.requestId), "DUPLICATE_REQUEST_ID");
  if (events.some((event) => event.agency !== agency || event.businessDate !== input.businessDate)) {
    throw new Error("CASH_SCOPE_MISMATCH");
  }

  const payments = events.filter((event) => event.eventType === "PAYMENT_CREDIT_RECORDED");
  const expenses = events.filter((event) => event.eventType === "EXPENSE_DEBIT_RECORDED");
  const corrections = events.filter((event) =>
    ["ADMIN_ADJUSTMENT_RECORDED", "CASH_CORRECTION_RECORDED"].includes(event.eventType)
  );
  const paymentsTotal = sum(payments.map((event) => event.amount));
  const expensesTotal = sum(expenses.map((event) => event.amount));
  const correctionsNet = sum(corrections.map((event) => event.direction === "CREDIT" ? event.amount : -event.amount));
  const currentBalance = money(input.yesterdayBalance + paymentsTotal - expensesTotal + correctionsNet);
  if (currentBalance < 0) throw new Error("NEGATIVE_CASH_BALANCE");

  const byAgentMap = new Map<string, AgentCashBreakdown>();
  payments.forEach((event) => {
    const current = byAgentMap.get(event.actorUserId);
    byAgentMap.set(event.actorUserId, {
      actorUserId: event.actorUserId,
      actorName: event.actorName,
      paymentCount: (current?.paymentCount ?? 0) + 1,
      amountCollected: money((current?.amountCollected ?? 0) + event.amount),
    });
  });
  const byAgent = Array.from(byAgentMap.values()).sort((a, b) => a.actorName.localeCompare(b.actorName));
  const closure = input.closure ? validateClosure(input.closure, agency, input.businessDate, currentBalance) : null;

  return deepFreeze({
    agency,
    businessDate: input.businessDate,
    currency: "USD" as const,
    yesterdayBalance: input.yesterdayBalance,
    paymentsTotal,
    expensesTotal,
    correctionsNet,
    currentBalance,
    paymentCount: payments.length,
    expenseCount: expenses.length,
    byAgent,
    status: closure ? "CLOSED" as const : "OPEN" as const,
    closure,
    auditEvents: events,
  });
}

export function getCashCapabilities(role: "AGENT" | "ADMIN", agency?: unknown) {
  if (role === "ADMIN") return deepFreeze({ read: true, open: true, close: true, correct: true });
  normalizeCashAgency(agency);
  return deepFreeze({ read: true, open: false, close: false, correct: false });
}

function validateClosure(closure: DailyCashClosure, agency: CashAgency, date: string, balance: number) {
  validateOccurredAt(closure.closedAt);
  if (!closure.closureId.trim() || !closure.closedByAdminId.trim() || closure.agency !== agency || closure.businessDate !== date || closure.balance !== balance) {
    throw new Error("INVALID_DAILY_CLOSURE");
  }
  return structuredClone(closure);
}

function assertUnique(values: readonly string[], code: string) {
  if (new Set(values).size !== values.length) throw new Error(code);
}

function assertNonNegativeMoney(value: number) {
  if (!Number.isFinite(value) || value < 0 || Math.round(value * 100) !== value * 100) throw new Error("INVALID_OPENING_BALANCE");
}

function sum(values: readonly number[]) {
  return money(values.reduce((total, value) => total + value, 0));
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}
