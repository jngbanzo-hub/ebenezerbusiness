import {
  STOCK_EVENT_TYPES,
  createStockEvent,
  normalizeParcelCode,
  type StockEvent,
  type StockEventInput,
  type StockEventType,
} from "../../../../../local-preparation/contracts/stock-event";
import {
  deepFreeze,
  validateOccurredAt,
} from "../../../../../local-preparation/contracts/common";
import type { CanonicalAgency } from "../../../../../local-preparation/contracts/agencies";

export type LogisticsEventRow = Readonly<{
  id: string;
  parcel_id: string;
  tracking_code: string;
  event_type: StockEventType;
  version_before: number;
  version_after: number;
  occurred_at: string;
  source: string;
  payload: unknown;
  created_at: string;
}>;

export type LogisticsEventInsertRow = LogisticsEventRow &
  Readonly<{
    agency_scope: readonly CanonicalAgency[];
  }>;

export class LogisticsEventRowError extends Error {
  readonly code = "INVALID_LOGISTICS_EVENT_ROW";

  constructor(message = "Ligne d’événement logistique invalide.") {
    super(message);
    this.name = "LogisticsEventRowError";
  }
}

export function stockEventToLogisticsEventRow(
  event: StockEvent,
): LogisticsEventRow {
  const validated = createStockEvent(clonePayload(event));
  return deepFreeze({
    id: validated.eventId,
    parcel_id: validated.parcelId,
    tracking_code: validated.trackingCode,
    event_type: validated.eventType,
    version_before: validated.versionBefore,
    version_after: validated.versionAfter,
    occurred_at: validated.occurredAt,
    source: validated.sourceType,
    payload: clonePayload(validated),
    created_at: validated.recordedAt,
  });
}

export function logisticsEventRowToStockEvent(
  row: LogisticsEventRow,
): StockEvent {
  try {
    validateRowShape(row);
    const event = createStockEvent(clonePayload(row.payload));

    if (
      event.eventId !== row.id ||
      event.parcelId !== row.parcel_id ||
      event.trackingCode !== row.tracking_code ||
      event.eventType !== row.event_type ||
      event.versionBefore !== row.version_before ||
      event.versionAfter !== row.version_after ||
      event.occurredAt !== row.occurred_at ||
      event.sourceType !== row.source
    ) {
      throw new LogisticsEventRowError();
    }

    return event;
  } catch (error) {
    if (error instanceof LogisticsEventRowError) {
      throw error;
    }
    throw new LogisticsEventRowError();
  }
}

export function decodeLogisticsEventRows(
  rows: readonly LogisticsEventRow[],
): readonly StockEvent[] {
  if (!Array.isArray(rows)) {
    throw new LogisticsEventRowError();
  }

  const decoded = rows.map(logisticsEventRowToStockEvent);
  decoded.sort(compareEvents);

  const parcelVersions = new Set<string>();
  const eventIds = new Set<string>();
  decoded.forEach((event) => {
    const parcelVersion = `${event.parcelId}:${event.versionAfter}`;
    if (eventIds.has(event.eventId) || parcelVersions.has(parcelVersion)) {
      throw new LogisticsEventRowError();
    }
    eventIds.add(event.eventId);
    parcelVersions.add(parcelVersion);
  });

  return deepFreeze(decoded);
}

function validateRowShape(row: LogisticsEventRow): void {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new LogisticsEventRowError();
  }
  if (
    !isRequiredText(row.id) ||
    !isRequiredText(row.parcel_id) ||
    !isRequiredText(row.source) ||
    !STOCK_EVENT_TYPES.includes(row.event_type) ||
    normalizeParcelCode(row.tracking_code) !== row.tracking_code ||
    !Number.isInteger(row.version_before) ||
    row.version_before < 0 ||
    !Number.isInteger(row.version_after) ||
    row.version_after !== row.version_before + 1
  ) {
    throw new LogisticsEventRowError();
  }
  validateOccurredAt(row.occurred_at);
  validateOccurredAt(row.created_at);
}

function isRequiredText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function clonePayload(value: unknown): StockEventInput {
  try {
    return structuredClone(value) as StockEventInput;
  } catch {
    throw new LogisticsEventRowError();
  }
}

function compareEvents(left: StockEvent, right: StockEvent): number {
  return (
    left.parcelId.localeCompare(right.parcelId) ||
    left.versionAfter - right.versionAfter ||
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.eventId.localeCompare(right.eventId)
  );
}
