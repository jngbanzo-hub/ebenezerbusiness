import { deepFreeze, validateBusinessDate, validateOccurredAt } from "../contracts/common";

export const CASH_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;
export const CASH_EVENT_TYPES = [
  "OPENING_BALANCE_RECORDED",
  "PAYMENT_CREDIT_RECORDED",
  "EXPENSE_DEBIT_RECORDED",
  "ADMIN_ADJUSTMENT_RECORDED",
  "CASH_CORRECTION_RECORDED",
] as const;

export type CashAgency = (typeof CASH_AGENCIES)[number];
export type CashEventType = (typeof CASH_EVENT_TYPES)[number];
export type CashCurrency = "USD";
export type CashDirection = "CREDIT" | "DEBIT";

export type CashEvent = Readonly<{
  eventId: string;
  eventType: CashEventType;
  agency: CashAgency;
  businessDate: string;
  occurredAt: string;
  direction: CashDirection;
  amount: number;
  currency: CashCurrency;
  sourceId: string;
  requestId: string;
  actorUserId: string;
  actorName: string;
  correctsEventId: string | null;
  reason: string | null;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type CashEventInput = Omit<CashEvent, "agency" | "currency"> &
  Readonly<{ agency: unknown; currency: unknown }>;

export class CashContractError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CashContractError";
  }
}

export function normalizeCashAgency(value: unknown): CashAgency {
  if (typeof value !== "string") throw cashError("INVALID_CASH_AGENCY", "Agence de caisse invalide.");
  const normalized = value.trim().toUpperCase();
  if (normalized === "COO" || normalized === "COTONOU") {
    throw cashError("COO_HAS_NO_CASH", "COO ne possède aucune caisse.");
  }
  if (!CASH_AGENCIES.includes(normalized as CashAgency)) {
    throw cashError("INVALID_CASH_AGENCY", "Agence de caisse invalide.");
  }
  return normalized as CashAgency;
}

export function createCashEvent(input: CashEventInput): CashEvent {
  const agency = normalizeCashAgency(input.agency);
  requireText(input.eventId, "INVALID_EVENT_ID");
  requireText(input.sourceId, "INVALID_SOURCE_ID");
  requireText(input.requestId, "INVALID_REQUEST_ID");
  requireText(input.actorUserId, "INVALID_ACTOR");
  requireText(input.actorName, "INVALID_ACTOR");
  validateBusinessDate(input.businessDate);
  validateOccurredAt(input.occurredAt);
  if (!CASH_EVENT_TYPES.includes(input.eventType)) throw cashError("INVALID_EVENT_TYPE", "Type d’événement invalide.");
  if (input.currency !== "USD") throw cashError("INVALID_CURRENCY", "La caisse canonique utilise uniquement USD.");
  assertMoney(input.amount);
  assertEventSemantics(input);

  return deepFreeze({
    ...structuredClone(input),
    agency,
    currency: "USD" as const,
    metadata: structuredClone(input.metadata),
  });
}

export function classifyCooFinancialActivity(kind: "PAYMENT" | "EXPENSE") {
  return kind === "PAYMENT" ? "COO_REVENUE_OUTSIDE_CASH" : "PDG_FUNDED_EXPENSE_OUTSIDE_CASH";
}

function assertEventSemantics(input: CashEventInput) {
  const expectedDirection: Record<CashEventType, CashDirection | null> = {
    OPENING_BALANCE_RECORDED: "CREDIT",
    PAYMENT_CREDIT_RECORDED: "CREDIT",
    EXPENSE_DEBIT_RECORDED: "DEBIT",
    ADMIN_ADJUSTMENT_RECORDED: null,
    CASH_CORRECTION_RECORDED: null,
  };
  const expected = expectedDirection[input.eventType];
  if ((expected !== null && input.direction !== expected) || !["CREDIT", "DEBIT"].includes(input.direction)) {
    throw cashError("INVALID_DIRECTION", "Sens de mouvement invalide.");
  }
  if (input.eventType === "CASH_CORRECTION_RECORDED") {
    requireText(input.correctsEventId, "INVALID_CORRECTION");
    requireText(input.reason, "INVALID_CORRECTION");
  } else if (input.eventType === "ADMIN_ADJUSTMENT_RECORDED") {
    requireText(input.reason, "INVALID_ADJUSTMENT");
    if (input.correctsEventId !== null) {
      throw cashError("INVALID_ADJUSTMENT", "Un ajustement ne remplace aucun événement existant.");
    }
  } else if (input.correctsEventId !== null) {
    throw cashError("INVALID_CORRECTION", "Une correction est compensatoire et explicite.");
  }
}

function assertMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0 || Math.round(value * 100) !== value * 100) {
    throw cashError("INVALID_AMOUNT", "Montant de caisse invalide.");
  }
}

function requireText(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw cashError(code, "Champ obligatoire invalide.");
}

function cashError(code: string, message: string) {
  return new CashContractError(code, message);
}
