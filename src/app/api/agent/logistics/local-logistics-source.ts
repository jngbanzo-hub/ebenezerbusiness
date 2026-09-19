import {
  createStockEvent,
  type StockEvent,
  type StockEventInput,
} from "../../../../../local-preparation/contracts/stock-event";

import type { LogisticsEventSource } from "./logistics-event-source";

type LocalParcelHistory = Readonly<{
  trackingCode: string;
  events: readonly StockEvent[];
}>;

const at = (minute: number) =>
  `2026-07-31T16:${String(minute).padStart(2, "0")}:00.000Z`;

function createEvent(
  versionBefore: number,
  eventType: StockEventInput["eventType"],
  overrides: Partial<StockEventInput> = {},
): StockEvent {
  const variants: Partial<
    Record<StockEventInput["eventType"], Partial<StockEventInput>>
  > = {
    ENTREE_COO: {
      agency: "COO",
      fromAgency: null,
      toAgency: "COO",
      sourceType: "SYSTEM",
    },
    SORTIE_COO: {
      agency: "COO",
      fromAgency: "COO",
      toAgency: "FIH",
      sourceType: "SYSTEM",
    },
    ARRIVAL_MISMATCH_CONFIRMED: {
      agency: "LSHI",
      fromAgency: "COO",
      toAgency: "LSHI",
      sourceType: "AGENT",
      recordedBy: "local-agent-lshi",
      reason: "Arrivée physique inattendue à LSHI",
      arrivalMismatch: {
        expectedAgency: "FIH",
        actualAgency: "LSHI",
        confirmedByAgentId: "local-agent-lshi",
        confirmedByAgentAgency: "LSHI",
        physicalReceiptConfirmed: true,
        evidenceReference: "local-observation-001",
      },
    },
  };

  return createStockEvent({
    eventId: `local-event-${versionBefore + 1}`,
    parcelId: "local-parcel-001",
    trackingCode: "LOCAL-LOG-001",
    eventType,
    agency: "COO",
    fromAgency: null,
    toAgency: "COO",
    weightKg: 2,
    sourceType: "SYSTEM",
    sourceId: `local-source-${versionBefore + 1}`,
    requestId: `local-request-${versionBefore + 1}`,
    occurredAt: at(versionBefore + 1),
    recordedAt: at(versionBefore + 1),
    recordedBy: "local-agent-coo",
    reason: null,
    metadata: versionBefore === 0 ? { destinationInitiale: "FIH" } : {},
    compensatesEventId: null,
    arrivalMismatch: null,
    versionBefore,
    versionAfter: versionBefore + 1,
    ...variants[eventType],
    ...overrides,
  });
}

const validHistory = Object.freeze([
  createEvent(0, "ENTREE_COO"),
  createEvent(1, "SORTIE_COO"),
  createEvent(2, "ARRIVAL_MISMATCH_CONFIRMED"),
]);

const invalidHistory = Object.freeze([
  createEvent(0, "ENTREE_COO", {
    eventId: "invalid-local-event-1",
    parcelId: "invalid-local-parcel",
    trackingCode: "LOCAL-INVALID-001",
  }),
  createEvent(1, "SORTIE_COO", {
    eventId: "invalid-local-event-2",
    parcelId: "invalid-local-parcel",
    trackingCode: "LOCAL-INVALID-001",
    versionBefore: 7,
    versionAfter: 8,
  }),
]);

const LOCAL_PARCEL_HISTORIES: readonly LocalParcelHistory[] = Object.freeze([
  Object.freeze({
    trackingCode: "LOCAL-LOG-001",
    events: validHistory,
  }),
  Object.freeze({
    trackingCode: "LOCAL-INVALID-001",
    events: invalidHistory,
  }),
]);

export function findLocalParcelHistory(
  trackingCode: string,
): readonly StockEvent[] | null {
  return (
    LOCAL_PARCEL_HISTORIES.find(
      (history) => history.trackingCode === trackingCode,
    )?.events ?? null
  );
}

export class LocalLogisticsEventSource implements LogisticsEventSource {
  async readEventsByTrackingCode(
    trackingCode: string,
  ): Promise<readonly StockEvent[] | null> {
    return findLocalParcelHistory(trackingCode);
  }
}

export const localLogisticsEventSource = new LocalLogisticsEventSource();
