import { normalizeCanonicalAgency, type CanonicalAgency } from "./agencies";
import {
  deepFreeze,
  type JsonObject,
  validateIdentifier,
  validateMetadata,
  validateOccurredAt,
  validatePositiveWeight,
} from "./common";
import { contractError } from "./errors";
import { validateRequiredReason } from "./logistics-command";

export const STOCK_EVENT_TYPES = [
  "ENTREE_COO",
  "SORTIE_COO",
  "ENTREE_DESTINATION",
  "SORTIE_REACHEMINEMENT",
  "ENTREE_REACHEMINEMENT",
  "ARRIVAL_MISMATCH_CONFIRMED",
  "SORTIE_LIVRAISON",
  "SORTIE_DESTINATION",
  "AJUSTEMENT_ADMIN",
  "STOCK_REVERSAL",
] as const;

export const STOCK_SOURCE_TYPES = [
  "MANIFEST_OBSERVATION",
  "DELIVERY_CONFIRMATION",
  "REROUTING",
  "AGENT",
  "ADMIN",
  "SYSTEM",
  "LEGACY_IMPORT",
] as const;

export type StockEventType = (typeof STOCK_EVENT_TYPES)[number];
export type StockSourceType = (typeof STOCK_SOURCE_TYPES)[number];

export type ArrivalMismatchDetails = Readonly<{
  expectedAgency: CanonicalAgency;
  actualAgency: CanonicalAgency;
  confirmedByAgentId: string;
  confirmedByAgentAgency: CanonicalAgency;
  physicalReceiptConfirmed: true;
  evidenceReference: string;
}>;

export type StockEvent = Readonly<{
  eventId: string;
  parcelId: string;
  trackingCode: string;
  eventType: StockEventType;
  agency: CanonicalAgency;
  fromAgency: CanonicalAgency | null;
  toAgency: CanonicalAgency | null;
  weightKg: number;
  sourceType: StockSourceType;
  sourceId: string;
  occurredAt: string;
  recordedAt: string;
  recordedBy: string | null;
  requestId: string | null;
  reason: string | null;
  metadata: JsonObject;
  compensatesEventId: string | null;
  arrivalMismatch: ArrivalMismatchDetails | null;
  versionBefore: number;
  versionAfter: number;
}>;

export type StockEventInput = {
  eventId: string;
  parcelId: string;
  trackingCode: string;
  eventType: StockEventType;
  agency: unknown;
  fromAgency?: unknown | null;
  toAgency?: unknown | null;
  weightKg: number;
  sourceType: StockSourceType;
  sourceId: string;
  occurredAt: string;
  recordedAt: string;
  recordedBy?: string | null;
  requestId?: string | null;
  reason?: string | null;
  metadata: unknown;
  compensatesEventId?: string | null;
  arrivalMismatch?: {
    expectedAgency: unknown;
    actualAgency: unknown;
    confirmedByAgentId: string;
    confirmedByAgentAgency: unknown;
    physicalReceiptConfirmed: boolean;
    evidenceReference: string;
  } | null;
  versionBefore: number;
  versionAfter: number;
};

export function createStockEvent(input: StockEventInput): StockEvent {
  if (!STOCK_EVENT_TYPES.includes(input.eventType)) {
    throw contractError("INVALID_EVENT_TYPE", "Type d’événement invalide.");
  }
  if (!STOCK_SOURCE_TYPES.includes(input.sourceType)) {
    throw contractError("INVALID_SOURCE_ID", "Source de stock invalide.");
  }

  const sourceIsSystem =
    input.sourceType === "SYSTEM" || input.sourceType === "LEGACY_IMPORT";
  const agency = normalizeCanonicalAgency(input.agency);
  const fromAgency = normalizeOptionalAgency(input.fromAgency);
  const toAgency = normalizeOptionalAgency(input.toAgency);
  const recordedBy =
    input.recordedBy === null || input.recordedBy === undefined
      ? null
      : validateIdentifier(
          input.recordedBy,
          "INVALID_ACTOR",
          "Identité acteur invalide.",
        );
  if (!sourceIsSystem && recordedBy === null) {
    throw contractError("INVALID_ACTOR", "Identité acteur invalide.");
  }

  const requestId =
    input.requestId === null || input.requestId === undefined
      ? null
      : validateIdentifier(
          input.requestId,
          "INVALID_REQUEST_ID",
          "Identifiant de requête invalide.",
        );
  if (!sourceIsSystem && requestId === null) {
    throw contractError("INVALID_REQUEST_ID", "Identifiant de requête invalide.");
  }

  validateVersions(input.versionBefore, input.versionAfter);
  validateEventAgencies(input.eventType, agency, fromAgency, toAgency);
  validateEventSource(input.eventType, input.sourceType);

  const needsReason =
    input.eventType === "AJUSTEMENT_ADMIN" ||
    input.eventType === "STOCK_REVERSAL";
  const reason =
    input.eventType === "ARRIVAL_MISMATCH_CONFIRMED"
      ? validateArrivalMismatchReason(input.reason)
      : input.reason === null || input.reason === undefined
      ? null
      : validateRequiredReason(input.reason);
  if (needsReason && reason === null) {
    throw contractError("INVALID_COMMAND", "Motif obligatoire.");
  }

  const compensatesEventId =
    input.compensatesEventId === null ||
    input.compensatesEventId === undefined
      ? null
      : validateIdentifier(
          input.compensatesEventId,
          "INVALID_REVERSAL",
          "Événement compensé invalide.",
        );
  if (input.eventType === "STOCK_REVERSAL" && compensatesEventId === null) {
    throw contractError("INVALID_REVERSAL", "Événement compensé obligatoire.");
  }
  if (
    input.eventType !== "STOCK_REVERSAL" &&
    input.eventType !== "AJUSTEMENT_ADMIN" &&
    compensatesEventId !== null
  ) {
    throw contractError("INVALID_REVERSAL", "Compensation interdite.");
  }
  const arrivalMismatch = validateArrivalMismatch(
    input.eventType,
    input.sourceType,
    input.reason,
    input.arrivalMismatch,
    recordedBy,
  );

  return deepFreeze({
    eventId: validateIdentifier(
      input.eventId,
      "INVALID_EVENT_ID",
      "Identifiant d’événement invalide.",
    ),
    parcelId: validateIdentifier(
      input.parcelId,
      "INVALID_SOURCE_ID",
      "Identifiant colis invalide.",
    ),
    trackingCode: normalizeParcelCode(input.trackingCode),
    eventType: input.eventType,
    agency,
    fromAgency,
    toAgency,
    weightKg: validatePositiveWeight(input.weightKg),
    sourceType: input.sourceType,
    sourceId: validateIdentifier(
      input.sourceId,
      "INVALID_SOURCE_ID",
      "Identifiant source invalide.",
    ),
    occurredAt: validateOccurredAt(input.occurredAt),
    recordedAt: validateOccurredAt(input.recordedAt),
    recordedBy,
    requestId,
    reason,
    metadata: validateMetadata(input.metadata),
    compensatesEventId,
    arrivalMismatch,
    versionBefore: input.versionBefore,
    versionAfter: input.versionAfter,
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

function normalizeOptionalAgency(value: unknown | null | undefined) {
  return value === null || value === undefined
    ? null
    : normalizeCanonicalAgency(value);
}

function validateVersions(before: unknown, after: unknown): void {
  if (
    !Number.isInteger(before) ||
    (before as number) < 0 ||
    !Number.isInteger(after) ||
    after !== (before as number) + 1
  ) {
    throw contractError("INVALID_VERSION", "Versions de position incohérentes.");
  }
}

function validateEventSource(
  type: StockEventType,
  source: StockSourceType,
): void {
  if (
    (type === "SORTIE_LIVRAISON" || type === "SORTIE_DESTINATION") &&
    source !== "DELIVERY_CONFIRMATION"
  ) {
    throw contractError(
      "INVALID_EVENT_TYPE",
      "Une livraison exige une confirmation physique.",
    );
  }
  if (
    (type === "SORTIE_REACHEMINEMENT" ||
      type === "ENTREE_REACHEMINEMENT") &&
    source !== "REROUTING"
  ) {
    throw contractError("INVALID_EVENT_TYPE", "Source de réacheminement requise.");
  }
  if (
    (type === "AJUSTEMENT_ADMIN" || type === "STOCK_REVERSAL") &&
    source !== "ADMIN"
  ) {
    throw contractError("INVALID_EVENT_TYPE", "Source Admin requise.");
  }
  if (
    type === "ARRIVAL_MISMATCH_CONFIRMED" &&
    source !== "AGENT" &&
    source !== "ADMIN"
  ) {
    throw contractError(
      "INVALID_EVENT_TYPE",
      "Source de constat d’arrivée invalide.",
    );
  }
}

function validateEventAgencies(
  type: StockEventType,
  agency: CanonicalAgency,
  from: CanonicalAgency | null,
  to: CanonicalAgency | null,
): void {
  if (from !== null && to !== null && from === to) {
    throw contractError("INVALID_EVENT_TYPE", "Agences identiques interdites.");
  }

  const valid =
    (type === "ENTREE_COO" && agency === "COO" && from === null && to === "COO") ||
    (type === "SORTIE_COO" &&
      agency === "COO" &&
      from === "COO" &&
      to !== null) ||
    (type === "ENTREE_DESTINATION" &&
      from !== null &&
      to === agency) ||
    (type === "SORTIE_REACHEMINEMENT" &&
      from === agency &&
      to !== null) ||
    (type === "ENTREE_REACHEMINEMENT" &&
      from !== null &&
      to === agency) ||
    (type === "ARRIVAL_MISMATCH_CONFIRMED" &&
      from !== null &&
      to === agency) ||
    ((type === "SORTIE_LIVRAISON" || type === "SORTIE_DESTINATION") &&
      from === agency &&
      to === null) ||
    type === "AJUSTEMENT_ADMIN" ||
    type === "STOCK_REVERSAL";

  if (!valid) {
    throw contractError("INVALID_EVENT_TYPE", "Agences d’événement incohérentes.");
  }
}

function validateArrivalMismatchReason(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 3) {
    throw contractError(
      "ARRIVAL_MISMATCH_REASON_REQUIRED",
      "Motif d’arrivée inattendue obligatoire.",
    );
  }
  return value.trim();
}

function validateArrivalMismatch(
  eventType: StockEventType,
  sourceType: StockSourceType,
  reason: string | null | undefined,
  input: StockEventInput["arrivalMismatch"],
  recordedBy: string | null,
): ArrivalMismatchDetails | null {
  if (eventType !== "ARRIVAL_MISMATCH_CONFIRMED") {
    if (input !== null && input !== undefined) {
      throw contractError(
        "INVALID_EVENT_TYPE",
        "Détails d’arrivée inattendue interdits.",
      );
    }
    return null;
  }
  if (input === null || input === undefined) {
    throw contractError(
      "ARRIVAL_MISMATCH_EVIDENCE_REQUIRED",
      "Détails d’arrivée inattendue obligatoires.",
    );
  }
  if (sourceType !== "AGENT" && sourceType !== "ADMIN") {
    throw contractError(
      "INVALID_EVENT_TYPE",
      "Source de constat d’arrivée invalide.",
    );
  }
  if (reason === null || reason === undefined || reason.trim().length < 3) {
    throw contractError(
      "ARRIVAL_MISMATCH_REASON_REQUIRED",
      "Motif d’arrivée inattendue obligatoire.",
    );
  }

  const expectedAgency = normalizeCanonicalAgency(input.expectedAgency);
  const actualAgency = normalizeCanonicalAgency(input.actualAgency);
  const confirmedByAgentAgency = normalizeCanonicalAgency(
    input.confirmedByAgentAgency,
  );
  if (actualAgency === expectedAgency) {
    throw contractError(
      "ARRIVAL_MISMATCH_ACTUAL_AGENCY_INVALID",
      "L’agence réelle doit différer de l’agence attendue.",
    );
  }
  if (confirmedByAgentAgency !== actualAgency) {
    throw contractError(
      "ARRIVAL_MISMATCH_AGENT_AGENCY_INVALID",
      "L’agence du confirmateur est incohérente.",
    );
  }
  const confirmedByAgentId = validateIdentifier(
    input.confirmedByAgentId,
    "INVALID_ACTOR",
    "Identité du confirmateur invalide.",
  );
  if (recordedBy !== confirmedByAgentId) {
    throw contractError(
      "INVALID_ACTOR",
      "Identité du confirmateur incohérente.",
    );
  }
  if (input.physicalReceiptConfirmed !== true) {
    throw contractError(
      "PHYSICAL_RECEIPT_REQUIRED",
      "Confirmation physique obligatoire.",
    );
  }
  if (
    typeof input.evidenceReference !== "string" ||
    input.evidenceReference.trim().length < 3 ||
    input.evidenceReference.trim().length > 256
  ) {
    throw contractError(
      "ARRIVAL_MISMATCH_EVIDENCE_REQUIRED",
      "Référence de preuve obligatoire.",
    );
  }

  return deepFreeze({
    expectedAgency,
    actualAgency,
    confirmedByAgentId,
    confirmedByAgentAgency,
    physicalReceiptConfirmed: true,
    evidenceReference: input.evidenceReference.trim(),
  });
}
