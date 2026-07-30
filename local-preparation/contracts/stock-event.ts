import { normalizeCanonicalAgency, type CanonicalAgency } from "./agencies";
import {
  deepFreeze,
  type JsonObject,
  validateBusinessDate,
  validateIdentifier,
  validateMetadata,
  validateOccurredAt,
  validateOptionalRequestId,
  validatePositiveWeight,
  validateVersion,
} from "./common";
import { contractError } from "./errors";

export const STOCK_EVENT_TYPES = [
  "ENTREE_COO",
  "SORTIE_COO",
  "ENTREE_DESTINATION",
  "SORTIE_DESTINATION",
  "AJUSTEMENT_ADMIN",
  "STOCK_REVERSAL",
] as const;

export const STOCK_SOURCE_TYPES = [
  "MANIFEST_OBSERVATION",
  "DELIVERY_CONFIRMATION",
  "ADMIN",
  "SYSTEM",
  "LEGACY_IMPORT",
] as const;

export const STOCK_EVENT_STATUSES = ["RECORDED", "REVERSED"] as const;

export type StockEventType = (typeof STOCK_EVENT_TYPES)[number];
export type StockSourceType = (typeof STOCK_SOURCE_TYPES)[number];
export type StockEventStatus = (typeof STOCK_EVENT_STATUSES)[number];

export type StockEvent = Readonly<{
  eventId: string;
  movementId: string;
  eventType: StockEventType;
  agency: CanonicalAgency;
  parcelCode: string;
  weightKg: number;
  sourceType: StockSourceType;
  sourceId: string;
  requestId: string | null;
  occurredAt: string;
  businessDate: string;
  actorUserId: string | null;
  status: StockEventStatus;
  reversalOf: string | null;
  version: number;
  metadata: JsonObject;
}>;

export type StockEventInput = {
  eventId: string;
  movementId: string;
  eventType: StockEventType;
  agency: unknown;
  parcelCode: string;
  weightKg: number;
  sourceType: StockSourceType;
  sourceId: string;
  requestId?: string | null;
  occurredAt: string;
  businessDate: string;
  actorUserId?: string | null;
  status: StockEventStatus;
  reversalOf?: string | null;
  version: number;
  metadata: unknown;
};

export function createStockEvent(input: StockEventInput): StockEvent {
  if (!STOCK_EVENT_TYPES.includes(input.eventType)) {
    throw contractError("INVALID_EVENT_TYPE", "Type d’événement invalide.");
  }
  if (!STOCK_EVENT_STATUSES.includes(input.status)) {
    throw contractError("INVALID_EVENT_STATUS", "Statut d’événement invalide.");
  }
  if (
    (input.eventType === "STOCK_REVERSAL") !==
    (input.status === "REVERSED")
  ) {
    throw contractError("INVALID_EVENT_STATUS", "Statut d’événement invalide.");
  }
  if (!STOCK_SOURCE_TYPES.includes(input.sourceType)) {
    throw contractError("INVALID_SOURCE_ID", "Source de stock invalide.");
  }
  if (
    input.eventType === "SORTIE_DESTINATION" &&
    input.sourceType !== "DELIVERY_CONFIRMATION"
  ) {
    throw contractError(
      "INVALID_EVENT_TYPE",
      "Une sortie destination exige une confirmation physique.",
    );
  }

  const sourceIsSystem =
    input.sourceType === "SYSTEM" || input.sourceType === "LEGACY_IMPORT";
  const actorUserId =
    input.actorUserId === null || input.actorUserId === undefined
      ? null
      : validateIdentifier(
          input.actorUserId,
          "INVALID_ACTOR",
          "Identité acteur invalide.",
        );
  if (!sourceIsSystem && actorUserId === null) {
    throw contractError("INVALID_ACTOR", "Identité acteur invalide.");
  }

  return deepFreeze({
    eventId: validateIdentifier(
      input.eventId,
      "INVALID_EVENT_ID",
      "Identifiant d’événement invalide.",
    ),
    movementId: validateIdentifier(
      input.movementId,
      "INVALID_EVENT_ID",
      "Identifiant de mouvement invalide.",
    ),
    eventType: input.eventType,
    agency: normalizeCanonicalAgency(input.agency),
    parcelCode: normalizeParcelCode(input.parcelCode),
    weightKg: validatePositiveWeight(input.weightKg),
    sourceType: input.sourceType,
    sourceId: validateIdentifier(
      input.sourceId,
      "INVALID_SOURCE_ID",
      "Identifiant source invalide.",
    ),
    requestId: validateOptionalRequestId(input.requestId, !sourceIsSystem),
    occurredAt: validateOccurredAt(input.occurredAt),
    businessDate: validateBusinessDate(input.businessDate),
    actorUserId,
    status: input.status,
    reversalOf: validateReversal(input.eventType, input.reversalOf),
    version: validateVersion(input.version),
    metadata: validateMetadata(input.metadata),
  });
}

export function normalizeParcelCode(value: unknown): string {
  if (typeof value !== "string") {
    throw contractError("INVALID_PARCEL_CODE", "Code colis invalide.");
  }

  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(normalized)) {
    throw contractError("INVALID_PARCEL_CODE", "Code colis invalide.");
  }

  return normalized;
}

function validateReversal(
  eventType: StockEventType,
  value: string | null | undefined,
): string | null {
  if (eventType === "STOCK_REVERSAL") {
    return validateIdentifier(
      value,
      "INVALID_REVERSAL",
      "Référence de compensation invalide.",
    );
  }
  if (value !== null && value !== undefined) {
    throw contractError("INVALID_REVERSAL", "Référence de compensation invalide.");
  }
  return null;
}
