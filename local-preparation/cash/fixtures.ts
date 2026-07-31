import { createCashEvent, type CashEventInput } from "./cash-contract";

export function cashEvent(overrides: Partial<CashEventInput> = {}) {
  return createCashEvent({
    eventId: "cash-event-001",
    eventType: "PAYMENT_CREDIT_RECORDED",
    agency: "LSHI",
    businessDate: "2026-07-31",
    occurredAt: "2026-07-31T10:00:00.000Z",
    direction: "CREDIT",
    amount: 100,
    currency: "USD",
    sourceId: "payment-row-001",
    requestId: "payment-request-001",
    actorUserId: "agent-a",
    actorName: "Agent A",
    correctsEventId: null,
    reason: null,
    metadata: {},
    ...overrides,
  });
}
