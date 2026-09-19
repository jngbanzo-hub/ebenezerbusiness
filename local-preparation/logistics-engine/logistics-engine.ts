import { deepFreeze, type JsonObject, type JsonValue } from "../contracts/common";
import {
  createParcelPosition,
  type LocationState,
  type ParcelPosition,
  type ParcelPositionInput,
} from "../contracts/parcel-position";
import type { CanonicalAgency } from "../contracts/agencies";
import type { StockEvent } from "../contracts/stock-event";

export const LOGISTICS_ENGINE_ERROR_CODES = [
  "INVALID_TRANSITION",
  "VERSION_CONFLICT",
  "EVENT_ALREADY_APPLIED",
  "EVENT_ORDER_INVALID",
  "PARCEL_ID_MISMATCH",
  "TRACKING_CODE_MISMATCH",
  "AGENCY_MISMATCH",
  "TRANSIT_DESTINATION_MISMATCH",
  "IMMUTABLE_FIELD_CHANGED",
  "ADMIN_REASON_REQUIRED",
  "ADMIN_IDENTITY_REQUIRED",
  "COMPENSATED_EVENT_REQUIRED",
  "ALREADY_DELIVERED",
  "INVALID_HISTORY",
  "ARRIVAL_MISMATCH_EXPECTED_AGENCY_INVALID",
  "ARRIVAL_MISMATCH_ACTUAL_AGENCY_INVALID",
  "ARRIVAL_MISMATCH_AGENT_AGENCY_INVALID",
  "PHYSICAL_RECEIPT_REQUIRED",
  "ARRIVAL_MISMATCH_REASON_REQUIRED",
  "ARRIVAL_MISMATCH_EVIDENCE_REQUIRED",
] as const;

export type LogisticsEngineErrorCode =
  (typeof LOGISTICS_ENGINE_ERROR_CODES)[number];

export class LogisticsEngineError extends Error {
  readonly code: LogisticsEngineErrorCode;

  constructor(code: LogisticsEngineErrorCode, message: string) {
    super(message);
    this.name = "LogisticsEngineError";
    this.code = code;
  }
}

export type ApplyLogisticsEventOptions = Readonly<{
  appliedEventIds?: ReadonlySet<string>;
}>;

export function applyLogisticsEvent(
  currentPosition: ParcelPosition,
  event: StockEvent,
  options: ApplyLogisticsEventOptions = {},
): ParcelPosition {
  validateIdentity(currentPosition, event);
  validateNotApplied(currentPosition, event, options.appliedEventIds);
  validateEventVersion(currentPosition, event);
  validateEventOrder(currentPosition, event);

  const invariant = {
    parcelId: currentPosition.parcelId,
    trackingCode: currentPosition.trackingCode,
    destinationInitiale: currentPosition.destinationInitiale,
    lastEventId: event.eventId,
    version: event.versionAfter,
    updatedAt: event.occurredAt,
  } as const;

  switch (event.eventType) {
    case "ENTREE_COO":
      requireState(currentPosition, "UNKNOWN");
      return createParcelPosition({
        ...invariant,
        destinationCourante: currentPosition.destinationCourante,
        locationState: "AT_AGENCY",
        currentAgency: "COO",
        transitFrom: null,
        transitTo: null,
      });

    case "SORTIE_COO":
      requireAtAgency(currentPosition, "COO");
      if (
        event.fromAgency !== "COO" ||
        event.toAgency !== currentPosition.destinationCourante
      ) {
        throw engineError(
          "TRANSIT_DESTINATION_MISMATCH",
          "Destination de transit incohérente.",
        );
      }
      return createParcelPosition({
        ...invariant,
        destinationCourante: currentPosition.destinationCourante,
        locationState: "IN_TRANSIT",
        currentAgency: null,
        transitFrom: "COO",
        transitTo: event.toAgency,
      });

    case "ENTREE_DESTINATION":
      requireTransitArrival(currentPosition, event);
      return createParcelPosition({
        ...invariant,
        destinationCourante: currentPosition.destinationCourante,
        locationState: "AT_AGENCY",
        currentAgency: event.agency,
        transitFrom: null,
        transitTo: null,
      });

    case "SORTIE_REACHEMINEMENT":
      if (event.fromAgency === null || event.toAgency === null) {
        throw engineError("AGENCY_MISMATCH", "Circuit de départ incomplet.");
      }
      requireAtAgency(currentPosition, event.fromAgency);
      if (event.agency !== event.fromAgency) {
        throw engineError("AGENCY_MISMATCH", "Agence de départ incohérente.");
      }
      return createParcelPosition({
        ...invariant,
        destinationCourante: event.toAgency,
        locationState: "IN_TRANSIT",
        currentAgency: null,
        transitFrom: event.fromAgency,
        transitTo: event.toAgency,
      });

    case "ENTREE_REACHEMINEMENT":
      requireTransitArrival(currentPosition, event);
      return createParcelPosition({
        ...invariant,
        destinationCourante: currentPosition.destinationCourante,
        locationState: "AT_AGENCY",
        currentAgency: event.agency,
        transitFrom: null,
        transitTo: null,
      });

    case "ARRIVAL_MISMATCH_CONFIRMED": {
      requireState(currentPosition, "IN_TRANSIT");
      const mismatch = event.arrivalMismatch;
      if (mismatch === null) {
        throw engineError(
          "ARRIVAL_MISMATCH_EVIDENCE_REQUIRED",
          "Détails d’arrivée inattendue obligatoires.",
        );
      }
      if (
        mismatch.expectedAgency !== currentPosition.transitTo ||
        event.fromAgency !== currentPosition.transitFrom
      ) {
        throw engineError(
          "ARRIVAL_MISMATCH_EXPECTED_AGENCY_INVALID",
          "Agence attendue incohérente.",
        );
      }
      if (
        mismatch.actualAgency === mismatch.expectedAgency ||
        event.agency !== mismatch.actualAgency ||
        event.toAgency !== mismatch.actualAgency
      ) {
        throw engineError(
          "ARRIVAL_MISMATCH_ACTUAL_AGENCY_INVALID",
          "Agence réelle incohérente.",
        );
      }
      if (
        mismatch.confirmedByAgentAgency !== mismatch.actualAgency ||
        mismatch.confirmedByAgentId !== event.recordedBy
      ) {
        throw engineError(
          "ARRIVAL_MISMATCH_AGENT_AGENCY_INVALID",
          "Agence du confirmateur incohérente.",
        );
      }
      if (mismatch.physicalReceiptConfirmed !== true) {
        throw engineError(
          "PHYSICAL_RECEIPT_REQUIRED",
          "Confirmation physique obligatoire.",
        );
      }
      if (event.reason === null) {
        throw engineError(
          "ARRIVAL_MISMATCH_REASON_REQUIRED",
          "Motif d’arrivée inattendue obligatoire.",
        );
      }
      if (mismatch.evidenceReference.length < 3) {
        throw engineError(
          "ARRIVAL_MISMATCH_EVIDENCE_REQUIRED",
          "Référence de preuve obligatoire.",
        );
      }
      return createParcelPosition({
        ...invariant,
        destinationCourante: currentPosition.destinationCourante,
        locationState: "AT_AGENCY",
        currentAgency: mismatch.actualAgency,
        transitFrom: null,
        transitTo: null,
      });
    }

    case "SORTIE_LIVRAISON":
    case "SORTIE_DESTINATION":
      if (currentPosition.locationState === "DELIVERED") {
        throw engineError("ALREADY_DELIVERED", "Colis déjà livré.");
      }
      requireAtAgency(currentPosition, event.agency);
      if (event.fromAgency !== event.agency || event.toAgency !== null) {
        throw engineError("AGENCY_MISMATCH", "Agence de livraison incohérente.");
      }
      return createParcelPosition({
        ...invariant,
        destinationCourante: currentPosition.destinationCourante,
        locationState: "DELIVERED",
        currentAgency: null,
        transitFrom: null,
        transitTo: null,
      });

    case "AJUSTEMENT_ADMIN":
    case "STOCK_REVERSAL":
      return applyAdminCompensation(currentPosition, event, invariant, options);
  }
}

export function rebuildParcelPosition(
  orderedEvents: readonly StockEvent[],
): ParcelPosition {
  if (orderedEvents.length === 0) {
    throw engineError("INVALID_HISTORY", "Historique vide.");
  }

  const sourceEvents = [...orderedEvents];
  const first = sourceEvents[0];
  validateCanonicalHistoryOrder(sourceEvents);
  const destinationInitiale = readAgencyMetadata(
    first.metadata,
    "destinationInitiale",
  );
  const initialUpdatedAt = readOptionalStringMetadata(
    first.metadata,
    "initialUpdatedAt",
  ) ?? first.occurredAt;
  let position = createParcelPosition({
    parcelId: first.parcelId,
    trackingCode: first.trackingCode,
    destinationInitiale,
    destinationCourante: destinationInitiale,
    locationState: "UNKNOWN",
    currentAgency: null,
    transitFrom: null,
    transitTo: null,
    lastEventId: null,
    version: first.versionBefore,
    updatedAt: initialUpdatedAt,
  });

  const appliedEventIds = new Set<string>();
  let previousOccurredAt: string | null = null;
  for (const event of sourceEvents) {
    if (
      previousOccurredAt !== null &&
      Date.parse(event.occurredAt) < Date.parse(previousOccurredAt)
    ) {
      throw engineError("EVENT_ORDER_INVALID", "Historique désordonné.");
    }
    position = applyLogisticsEvent(position, event, { appliedEventIds });
    appliedEventIds.add(event.eventId);
    previousOccurredAt = event.occurredAt;
  }

  return position;
}

export type ArrivalAnomalyProjection = Readonly<{
  mismatchEventId: string;
  parcelId: string;
  expectedAgency: CanonicalAgency;
  actualAgency: CanonicalAgency;
  confirmedByActorId: string;
  confirmedByActorAgency: CanonicalAgency;
  occurredAt: string;
  reason: string;
  evidenceReference: string;
  status: "ACTIVE" | "CLOSED_BY_REROUTING";
  closedByEventId: string | null;
}>;

export function projectArrivalAnomalies(
  orderedEvents: readonly StockEvent[],
): readonly ArrivalAnomalyProjection[] {
  const anomalies = orderedEvents.flatMap((event, index) => {
    if (
      event.eventType !== "ARRIVAL_MISMATCH_CONFIRMED" ||
      event.arrivalMismatch === null ||
      event.reason === null
    ) {
      return [];
    }
    const closure = orderedEvents
      .slice(index + 1)
      .find(
        (candidate) =>
          candidate.eventType === "SORTIE_REACHEMINEMENT" &&
          candidate.parcelId === event.parcelId &&
          candidate.fromAgency === event.arrivalMismatch?.actualAgency,
      );
    return [
      {
        mismatchEventId: event.eventId,
        parcelId: event.parcelId,
        expectedAgency: event.arrivalMismatch.expectedAgency,
        actualAgency: event.arrivalMismatch.actualAgency,
        confirmedByActorId: event.arrivalMismatch.confirmedByAgentId,
        confirmedByActorAgency:
          event.arrivalMismatch.confirmedByAgentAgency,
        occurredAt: event.occurredAt,
        reason: event.reason,
        evidenceReference: event.arrivalMismatch.evidenceReference,
        status: closure === undefined ? "ACTIVE" : "CLOSED_BY_REROUTING",
        closedByEventId: closure?.eventId ?? null,
      } satisfies ArrivalAnomalyProjection,
    ];
  });
  return deepFreeze(anomalies);
}

function validateCanonicalHistoryOrder(events: readonly StockEvent[]): void {
  const eventIds = new Set<string>();
  let previousOccurredAt: string | null = null;
  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      throw engineError(
        "EVENT_ALREADY_APPLIED",
        "Événement dupliqué dans l’historique.",
      );
    }
    if (
      previousOccurredAt !== null &&
      Date.parse(event.occurredAt) < Date.parse(previousOccurredAt)
    ) {
      throw engineError("EVENT_ORDER_INVALID", "Historique désordonné.");
    }
    eventIds.add(event.eventId);
    previousOccurredAt = event.occurredAt;
  }
}

function applyAdminCompensation(
  current: ParcelPosition,
  event: StockEvent,
  invariant: Pick<
    ParcelPositionInput,
    | "parcelId"
    | "trackingCode"
    | "destinationInitiale"
    | "lastEventId"
    | "version"
    | "updatedAt"
  >,
  options: ApplyLogisticsEventOptions,
): ParcelPosition {
  if (event.sourceType !== "ADMIN" || event.recordedBy === null) {
    throw engineError(
      "ADMIN_IDENTITY_REQUIRED",
      "Identité Admin obligatoire.",
    );
  }
  if (event.reason === null || event.reason.trim().length < 3) {
    throw engineError("ADMIN_REASON_REQUIRED", "Motif Admin obligatoire.");
  }
  if (event.compensatesEventId === null) {
    throw engineError(
      "COMPENSATED_EVENT_REQUIRED",
      "Événement compensé obligatoire.",
    );
  }
  if (
    options.appliedEventIds !== undefined &&
    !options.appliedEventIds.has(event.compensatesEventId)
  ) {
    throw engineError(
      "COMPENSATED_EVENT_REQUIRED",
      "Événement compensé absent de l’historique.",
    );
  }

  const before = readPositionSnapshot(event.metadata, "beforePosition");
  assertSnapshotMatches(current, before);
  const after = readPositionSnapshot(event.metadata, "afterPosition");
  if (after.destinationInitiale !== current.destinationInitiale) {
    throw engineError(
      "IMMUTABLE_FIELD_CHANGED",
      "Destination initiale immutable.",
    );
  }

  return createParcelPosition({
    ...invariant,
    destinationCourante: after.destinationCourante,
    locationState: after.locationState,
    currentAgency: after.currentAgency,
    transitFrom: after.transitFrom,
    transitTo: after.transitTo,
  });
}

function validateIdentity(position: ParcelPosition, event: StockEvent): void {
  if (event.parcelId !== position.parcelId) {
    throw engineError("PARCEL_ID_MISMATCH", "Colis incohérent.");
  }
  if (event.trackingCode !== position.trackingCode) {
    throw engineError("TRACKING_CODE_MISMATCH", "Code de suivi incohérent.");
  }
}

function validateEventVersion(
  position: ParcelPosition,
  event: StockEvent,
): void {
  if (
    event.versionBefore !== position.version ||
    event.versionAfter !== event.versionBefore + 1
  ) {
    throw engineError("VERSION_CONFLICT", "Version d’événement incohérente.");
  }
}

function validateEventOrder(
  position: ParcelPosition,
  event: StockEvent,
): void {
  if (Date.parse(event.occurredAt) < Date.parse(position.updatedAt)) {
    throw engineError("EVENT_ORDER_INVALID", "Événement ancien ou désordonné.");
  }
}

function validateNotApplied(
  position: ParcelPosition,
  event: StockEvent,
  appliedEventIds?: ReadonlySet<string>,
): void {
  if (
    position.lastEventId === event.eventId ||
    appliedEventIds?.has(event.eventId)
  ) {
    throw engineError(
      "EVENT_ALREADY_APPLIED",
      "Événement déjà appliqué.",
    );
  }
}

function requireState(
  position: ParcelPosition,
  expected: LocationState,
): void {
  if (position.locationState !== expected) {
    if (position.locationState === "DELIVERED") {
      throw engineError("ALREADY_DELIVERED", "Colis déjà livré.");
    }
    throw engineError("INVALID_TRANSITION", "Transition physique interdite.");
  }
}

function requireAtAgency(
  position: ParcelPosition,
  agency: CanonicalAgency,
): void {
  requireState(position, "AT_AGENCY");
  if (position.currentAgency !== agency) {
    throw engineError("AGENCY_MISMATCH", "Agence physique incohérente.");
  }
}

function requireTransitArrival(
  position: ParcelPosition,
  event: StockEvent,
): void {
  requireState(position, "IN_TRANSIT");
  if (
    position.transitTo !== event.agency ||
    event.toAgency !== event.agency ||
    event.fromAgency !== position.transitFrom
  ) {
    throw engineError(
      "TRANSIT_DESTINATION_MISMATCH",
      "Agence d’arrivée incohérente.",
    );
  }
}

type PositionSnapshot = Readonly<{
  destinationInitiale: CanonicalAgency;
  destinationCourante: CanonicalAgency;
  locationState: LocationState;
  currentAgency: CanonicalAgency | null;
  transitFrom: CanonicalAgency | null;
  transitTo: CanonicalAgency | null;
}>;

function readPositionSnapshot(
  metadata: JsonObject,
  key: string,
): PositionSnapshot {
  const value = metadata[key];
  if (!isJsonObject(value)) {
    throw engineError("INVALID_HISTORY", "Trace de position Admin invalide.");
  }
  return {
    destinationInitiale: readAgencyMetadata(value, "destinationInitiale"),
    destinationCourante: readAgencyMetadata(value, "destinationCourante"),
    locationState: readLocationState(value.locationState),
    currentAgency: readNullableAgency(value.currentAgency),
    transitFrom: readNullableAgency(value.transitFrom),
    transitTo: readNullableAgency(value.transitTo),
  };
}

function assertSnapshotMatches(
  position: ParcelPosition,
  snapshot: PositionSnapshot,
): void {
  const actual = positionSnapshot(position);
  if (JSON.stringify(actual) !== JSON.stringify(snapshot)) {
    throw engineError(
      "INVALID_HISTORY",
      "État avant correction incohérent.",
    );
  }
}

export function positionSnapshot(position: ParcelPosition): PositionSnapshot {
  return deepFreeze({
    destinationInitiale: position.destinationInitiale,
    destinationCourante: position.destinationCourante,
    locationState: position.locationState,
    currentAgency: position.currentAgency,
    transitFrom: position.transitFrom,
    transitTo: position.transitTo,
  });
}

function readAgencyMetadata(
  metadata: JsonObject,
  key: string,
): CanonicalAgency {
  const value = metadata[key];
  if (value === "COO" || value === "FIH" || value === "LSHI" || value === "KLZ") {
    return value;
  }
  throw engineError("INVALID_HISTORY", "Agence historique invalide.");
}

function readOptionalStringMetadata(
  metadata: JsonObject,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function readNullableAgency(value: JsonValue | undefined): CanonicalAgency | null {
  if (value === null) return null;
  if (value === "COO" || value === "FIH" || value === "LSHI" || value === "KLZ") {
    return value;
  }
  throw engineError("INVALID_HISTORY", "Agence de position invalide.");
}

function readLocationState(value: JsonValue | undefined): LocationState {
  if (
    value === "AT_AGENCY" ||
    value === "IN_TRANSIT" ||
    value === "DELIVERED" ||
    value === "UNKNOWN"
  ) {
    return value;
  }
  throw engineError("INVALID_HISTORY", "État historique invalide.");
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function engineError(
  code: LogisticsEngineErrorCode,
  message: string,
): LogisticsEngineError {
  return new LogisticsEngineError(code, message);
}
