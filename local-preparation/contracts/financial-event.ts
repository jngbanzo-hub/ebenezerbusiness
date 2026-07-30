import type { CanonicalAgency } from "./agencies";

export type FinancialEvent = {
  eventId: string;
  eventType:
    | "PAYMENT_RECORDED"
    | "PAYMENT_REVERSED"
    | "EXPENSE_RECORDED"
    | "EXPENSE_REVERSED"
    | "INITIAL_BALANCE"
    | "ADMIN_ADJUSTMENT";
  agency: CanonicalAgency;
  currency: "USD";
  amount: number;
  sourceType:
    | "PAYMENT"
    | "EXPENSE"
    | "INITIAL_BALANCE"
    | "ADMIN_ADJUSTMENT";
  sourceId: string;
  requestId: string;
  occurredAt: string;
  businessDate: string;
  actorUserId: string;
  status: "ACTIVE" | "REVERSED";
  reversalOf: string | null;
  version: number;
};
