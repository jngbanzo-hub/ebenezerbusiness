import {
  CANONICAL_AGENCIES,
  normalizeCanonicalAgency,
  type CanonicalAgency,
} from "../../../../../local-preparation/contracts/agencies";
import type { StockEvent } from "../../../../../local-preparation/contracts/stock-event";
import { rebuildParcelPosition } from "../../../../../local-preparation/logistics-engine/logistics-engine";

import {
  logisticsEventRowToStockEvent,
  stockEventToLogisticsEventRow,
  type LogisticsEventInsertRow,
} from "./logistics-event-row";
import type { LogisticsSupabaseWriteClient } from "./logistics-supabase-client";

export const LOGISTICS_EVENT_PRODUCER_ERROR_CODES = [
  "INVALID_EVENT",
  "DUPLICATE_EVENT",
  "WRITE_FAILED",
] as const;

export type LogisticsEventProducerErrorCode =
  (typeof LOGISTICS_EVENT_PRODUCER_ERROR_CODES)[number];

export class LogisticsEventProducerError extends Error {
  constructor(
    readonly code: LogisticsEventProducerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LogisticsEventProducerError";
  }
}

export class SupabaseLogisticsEventProducer {
  constructor(private readonly client: LogisticsSupabaseWriteClient) {}

  async appendEvent(
    history: readonly StockEvent[],
    event: StockEvent,
  ): Promise<LogisticsEventInsertRow> {
    const validatedHistory = validateEvents(history);
    const validatedEvent = validateEvent(event);
    assertNotDuplicate(validatedHistory, validatedEvent);

    const orderedEvents = [...validatedHistory, validatedEvent];
    let agencyScope: readonly CanonicalAgency[];
    try {
      const position = rebuildParcelPosition(orderedEvents);
      agencyScope = calculateAgencyScope(orderedEvents, position);
    } catch {
      throw producerError(
        "INVALID_EVENT",
        "L’événement logistique ou son circuit est invalide.",
      );
    }

    const row = Object.freeze({
      ...stockEventToLogisticsEventRow(validatedEvent),
      agency_scope: agencyScope,
    });

    let result;
    try {
      result = await this.client.insertLogisticsEvent({
        table: "logistics_events",
        row,
      });
    } catch {
      throw producerError(
        "WRITE_FAILED",
        "L’écriture de l’événement logistique a échoué.",
      );
    }

    if (result.error !== null) {
      if (result.error.code === "23505") {
        throw producerError(
          "DUPLICATE_EVENT",
          "Cet événement logistique existe déjà.",
        );
      }
      throw producerError(
        "WRITE_FAILED",
        "L’écriture de l’événement logistique a échoué.",
      );
    }
    if (result.data?.id !== validatedEvent.eventId) {
      throw producerError(
        "WRITE_FAILED",
        "L’écriture de l’événement logistique n’a pas été confirmée.",
      );
    }

    return row;
  }
}

function validateEvents(events: readonly StockEvent[]): readonly StockEvent[] {
  if (!Array.isArray(events)) {
    throw producerError("INVALID_EVENT", "Historique logistique invalide.");
  }
  return Object.freeze(events.map(validateEvent));
}

function validateEvent(event: StockEvent): StockEvent {
  try {
    return logisticsEventRowToStockEvent(
      stockEventToLogisticsEventRow(event),
    );
  } catch {
    throw producerError("INVALID_EVENT", "Événement logistique invalide.");
  }
}

function assertNotDuplicate(
  history: readonly StockEvent[],
  event: StockEvent,
): void {
  const duplicate = history.some(
    (existing) =>
      existing.eventId === event.eventId ||
      (existing.parcelId === event.parcelId &&
        existing.versionAfter === event.versionAfter),
  );
  if (duplicate) {
    throw producerError(
      "DUPLICATE_EVENT",
      "Cet événement logistique existe déjà.",
    );
  }
}

function calculateAgencyScope(
  events: readonly StockEvent[],
  position: ReturnType<typeof rebuildParcelPosition>,
): readonly CanonicalAgency[] {
  const scope = new Set<CanonicalAgency>();
  const add = (value: unknown | null) => {
    if (value !== null && value !== undefined) {
      scope.add(normalizeCanonicalAgency(value));
    }
  };

  events.forEach((event) => {
    add(event.agency);
    add(event.fromAgency);
    add(event.toAgency);
    if (event.arrivalMismatch !== null) {
      add(event.arrivalMismatch.expectedAgency);
      add(event.arrivalMismatch.actualAgency);
      add(event.arrivalMismatch.confirmedByAgentAgency);
    }
  });
  add(position.destinationInitiale);
  add(position.destinationCourante);
  add(position.currentAgency);
  add(position.transitFrom);
  add(position.transitTo);

  if (scope.size === 0) {
    throw producerError("INVALID_EVENT", "Portée d’agence invalide.");
  }
  return Object.freeze(
    CANONICAL_AGENCIES.filter((agency) => scope.has(agency)),
  );
}

function producerError(
  code: LogisticsEventProducerErrorCode,
  message: string,
) {
  return new LogisticsEventProducerError(code, message);
}
