import type { FinancialEventInput } from "./financial-event";
import type { StockEventInput } from "./stock-event";

export function validFinancialEventInput(
  overrides: Partial<FinancialEventInput> = {},
): FinancialEventInput {
  return {
    eventId: "financial-event-001",
    eventType: "PAYMENT_RECORDED",
    agency: "COO",
    amount: 12.5,
    currency: "USD",
    sourceType: "PAYMENT_ENGINE",
    sourceId: "payment-001",
    requestId: "request-001",
    occurredAt: "2026-07-30T10:15:30.000Z",
    businessDate: "2026-07-30",
    actorUserId: "user-001",
    status: "RECORDED",
    reversalOf: null,
    version: 1,
    metadata: { channel: "LOCAL_TEST" },
    ...overrides,
  };
}

export function validStockEventInput(
  overrides: Partial<StockEventInput> = {},
): StockEventInput {
  return {
    eventId: "stock-event-001",
    parcelId: "parcel-001",
    eventType: "ENTREE_COO",
    agency: "COO",
    fromAgency: null,
    toAgency: "COO",
    trackingCode: " mr-001 ",
    weightKg: 2.5,
    sourceType: "MANIFEST_OBSERVATION",
    sourceId: "manifest-row-001",
    requestId: "request-001",
    occurredAt: "2026-07-30T10:15:30.000Z",
    recordedAt: "2026-07-30T10:16:00.000Z",
    recordedBy: "user-001",
    reason: null,
    compensatesEventId: null,
    arrivalMismatch: null,
    versionBefore: 0,
    versionAfter: 1,
    metadata: { channel: "LOCAL_TEST" },
    ...overrides,
  };
}
