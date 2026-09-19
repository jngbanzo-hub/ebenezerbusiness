import { normalizeCanonicalAgency, type CanonicalAgency } from "./agencies";
import {
  deepFreeze,
  validateIdentifier,
  validateOccurredAt,
} from "./common";
import { contractError } from "./errors";

export const IDEMPOTENCY_OUTCOMES = [
  "CREATED",
  "REPLAYED",
  "CONFLICT",
] as const;

export type IdempotencyOutcome = (typeof IDEMPOTENCY_OUTCOMES)[number];

export type LogisticsCommandBase = Readonly<{
  requestId: string;
  parcelId: string;
  expectedPositionVersion: number;
  actorId: string;
  actorAgency: CanonicalAgency;
  requestedAt: string;
}>;

export type LogisticsCommandBaseInput = {
  requestId: string;
  parcelId: string;
  expectedPositionVersion: number;
  actorId: string;
  actorAgency: unknown;
  requestedAt: string;
};

export type ConfirmArrivalCommand = LogisticsCommandBase &
  Readonly<{ stockMovementRequestId: string }>;

export type StartReroutingCommand = LogisticsCommandBase &
  Readonly<{ reroutingRequestId: string; reroutingId: string }>;

export type ConfirmReroutingArrivalCommand = LogisticsCommandBase &
  Readonly<{ reroutingRequestId: string; reroutingId: string }>;

export type AdminAdjustmentCommand = LogisticsCommandBase &
  Readonly<{
    stockMovementRequestId: string;
    compensatedEventId: string;
    reason: string;
  }>;

export function createLogisticsCommandBase(
  input: LogisticsCommandBaseInput,
): LogisticsCommandBase {
  if (
    !Number.isInteger(input.expectedPositionVersion) ||
    input.expectedPositionVersion < 0
  ) {
    throw contractError("INVALID_VERSION", "Version attendue invalide.");
  }
  return deepFreeze({
    requestId: validateIdentifier(
      input.requestId,
      "INVALID_REQUEST_ID",
      "Identifiant de requête invalide.",
    ),
    parcelId: validateIdentifier(
      input.parcelId,
      "INVALID_SOURCE_ID",
      "Identifiant colis invalide.",
    ),
    expectedPositionVersion: input.expectedPositionVersion,
    actorId: validateIdentifier(
      input.actorId,
      "INVALID_ACTOR",
      "Identité acteur invalide.",
    ),
    // Donnée déclarée uniquement : l'autorité future restera le profil serveur.
    actorAgency: normalizeCanonicalAgency(input.actorAgency),
    requestedAt: validateOccurredAt(input.requestedAt),
  });
}

export function resolveIdempotency(
  storedFingerprint: string | null,
  incomingFingerprint: string,
): IdempotencyOutcome {
  if (storedFingerprint === null) return "CREATED";
  return storedFingerprint === incomingFingerprint ? "REPLAYED" : "CONFLICT";
}

export function stableCommandFingerprint(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function validateRequiredReason(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 3) {
    throw contractError("INVALID_COMMAND", "Motif obligatoire.");
  }
  return value.trim();
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
}
