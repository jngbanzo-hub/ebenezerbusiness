import { normalizeCanonicalAgency, type CanonicalAgency } from "./agencies";
import {
  deepFreeze,
  validateIdentifier,
  validateOccurredAt,
} from "./common";
import { contractError } from "./errors";
import { normalizeParcelCode } from "./stock-event";

export const LOCATION_STATES = [
  "AT_AGENCY",
  "IN_TRANSIT",
  "DELIVERED",
  "UNKNOWN",
] as const;

export type LocationState = (typeof LOCATION_STATES)[number];

export type ParcelPosition = Readonly<{
  parcelId: string;
  trackingCode: string;
  destinationInitiale: CanonicalAgency;
  destinationCourante: CanonicalAgency;
  locationState: LocationState;
  currentAgency: CanonicalAgency | null;
  transitFrom: CanonicalAgency | null;
  transitTo: CanonicalAgency | null;
  lastEventId: string | null;
  version: number;
  updatedAt: string;
}>;

export type ParcelPositionInput = {
  parcelId: string;
  trackingCode: string;
  destinationInitiale: unknown;
  destinationCourante: unknown;
  locationState: LocationState;
  currentAgency?: unknown | null;
  transitFrom?: unknown | null;
  transitTo?: unknown | null;
  lastEventId?: string | null;
  version: number;
  updatedAt: string;
};

export function createParcelPosition(
  input: ParcelPositionInput,
): ParcelPosition {
  if (!LOCATION_STATES.includes(input.locationState)) {
    throw contractError("INVALID_POSITION", "État de position invalide.");
  }

  const currentAgency = normalizeOptionalAgency(input.currentAgency);
  const transitFrom = normalizeOptionalAgency(input.transitFrom);
  const transitTo = normalizeOptionalAgency(input.transitTo);
  validateLocationShape(input.locationState, currentAgency, transitFrom, transitTo);

  if (
    input.locationState === "IN_TRANSIT" &&
    transitFrom === transitTo
  ) {
    throw contractError("INVALID_POSITION", "Trajet physique invalide.");
  }

  return deepFreeze({
    parcelId: validateIdentifier(
      input.parcelId,
      "INVALID_SOURCE_ID",
      "Identifiant colis invalide.",
    ),
    trackingCode: normalizeParcelCode(input.trackingCode),
    destinationInitiale: normalizeCanonicalAgency(input.destinationInitiale),
    destinationCourante: normalizeCanonicalAgency(input.destinationCourante),
    locationState: input.locationState,
    currentAgency,
    transitFrom,
    transitTo,
    lastEventId:
      input.lastEventId === null || input.lastEventId === undefined
        ? null
        : validateIdentifier(
            input.lastEventId,
            "INVALID_EVENT_ID",
            "Identifiant d’événement invalide.",
          ),
    version: validatePositionVersion(input.version),
    updatedAt: validateOccurredAt(input.updatedAt),
  });
}

export function transitionParcelPosition(
  previous: ParcelPosition,
  nextInput: ParcelPositionInput,
  options: { readonly adminCompensation?: boolean } = {},
): ParcelPosition {
  const next = createParcelPosition(nextInput);

  if (next.parcelId !== previous.parcelId) {
    throw contractError("INVALID_TRANSITION", "Transition de colis invalide.");
  }
  if (next.destinationInitiale !== previous.destinationInitiale) {
    throw contractError(
      "INVALID_TRANSITION",
      "La destination initiale est immutable.",
    );
  }
  if (next.version !== previous.version + 1) {
    throw contractError("INVALID_VERSION", "Version de position incohérente.");
  }

  const transition = `${previous.locationState}->${next.locationState}`;
  const allowed = new Set([
    "UNKNOWN->AT_AGENCY",
    "AT_AGENCY->IN_TRANSIT",
    "IN_TRANSIT->AT_AGENCY",
    "AT_AGENCY->DELIVERED",
  ]);

  if (!allowed.has(transition)) {
    if (
      !(
        options.adminCompensation === true &&
        previous.locationState === "DELIVERED" &&
        next.locationState === "AT_AGENCY"
      )
    ) {
      throw contractError("INVALID_TRANSITION", "Transition physique interdite.");
    }
  }

  if (
    previous.locationState === "AT_AGENCY" &&
    next.locationState === "IN_TRANSIT" &&
    next.transitFrom !== previous.currentAgency
  ) {
    throw contractError("INVALID_TRANSITION", "Agence de départ incohérente.");
  }
  if (
    previous.locationState === "IN_TRANSIT" &&
    next.locationState === "AT_AGENCY" &&
    next.currentAgency !== previous.transitTo
  ) {
    throw contractError("INVALID_TRANSITION", "Agence d’arrivée incohérente.");
  }

  return next;
}

function validatePositionVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw contractError("INVALID_VERSION", "Version de position invalide.");
  }
  return value as number;
}

function normalizeOptionalAgency(value: unknown | null | undefined) {
  return value === null || value === undefined
    ? null
    : normalizeCanonicalAgency(value);
}

function validateLocationShape(
  state: LocationState,
  currentAgency: CanonicalAgency | null,
  transitFrom: CanonicalAgency | null,
  transitTo: CanonicalAgency | null,
): void {
  if (
    state === "AT_AGENCY" &&
    (currentAgency === null || transitFrom !== null || transitTo !== null)
  ) {
    throw contractError("INVALID_POSITION", "Position en agence invalide.");
  }
  if (
    state === "IN_TRANSIT" &&
    (currentAgency !== null || transitFrom === null || transitTo === null)
  ) {
    throw contractError("INVALID_POSITION", "Position en transit invalide.");
  }
  if (
    (state === "DELIVERED" || state === "UNKNOWN") &&
    (currentAgency !== null || transitFrom !== null || transitTo !== null)
  ) {
    throw contractError("INVALID_POSITION", "Position terminale invalide.");
  }
}
