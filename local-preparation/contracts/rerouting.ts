import { normalizeCanonicalAgency, type CanonicalAgency } from "./agencies";
import {
  deepFreeze,
  validateIdentifier,
  validateOccurredAt,
} from "./common";
import { contractError } from "./errors";
import {
  createLogisticsCommandBase,
  resolveIdempotency,
  stableCommandFingerprint,
  validateRequiredReason,
  type LogisticsCommandBase,
  type LogisticsCommandBaseInput,
} from "./logistics-command";
import {
  transitionParcelPosition,
  type ParcelPosition,
} from "./parcel-position";
import { normalizeParcelCode } from "./stock-event";

export const REROUTING_STATUSES = [
  "PROPOSED",
  "APPROVED",
  "DEPARTED",
  "ARRIVED",
  "CANCELLED",
] as const;
export type ReroutingStatus = (typeof REROUTING_STATUSES)[number];

export type Rerouting = Readonly<{
  reroutingId: string;
  parcelId: string;
  trackingCode: string;
  fromAgency: CanonicalAgency;
  toAgency: CanonicalAgency;
  destinationInitiale: CanonicalAgency;
  destinationCouranteAvant: CanonicalAgency;
  destinationCouranteApres: CanonicalAgency;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  reason: string;
  tariffId: string;
  tariffVersion: number;
  feeAmount: number;
  currency: "USD";
  status: ReroutingStatus;
  version: number;
  physicalArrivalConfirmed: boolean;
  cancellationCompensatesEventId: string | null;
}>;

export type ReroutingInput = {
  reroutingId: string;
  parcelId: string;
  trackingCode: string;
  fromAgency: unknown;
  toAgency: unknown;
  destinationInitiale: unknown;
  destinationCouranteAvant: unknown;
  destinationCouranteApres: unknown;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  reason: string;
  tariffId: string;
  tariffVersion: number;
  feeAmount: number;
  currency: string;
  status: ReroutingStatus;
  version: number;
  physicalArrivalConfirmed?: boolean;
  cancellationCompensatesEventId?: string | null;
};

type ReroutingCommand = Omit<LogisticsCommandBase, "requestId"> &
  Readonly<{ requestId: string; reroutingRequestId: string; reroutingId: string }>;

export type ProposeReroutingCommand = ReroutingCommand &
  Readonly<{
    fromAgency: CanonicalAgency;
    toAgency: CanonicalAgency;
    reason: string;
    tariffId: string;
    tariffVersion: number;
  }>;
export type ApproveReroutingCommand = ReroutingCommand;
export type StartReroutingCommand = ReroutingCommand;
export type ConfirmReroutingArrivalCommand = ReroutingCommand &
  Readonly<{ physicalArrivalConfirmed: true }>;
export type CancelReroutingCommand = ReroutingCommand &
  Readonly<{ reason: string; compensatesEventId: string | null }>;

export type ReroutingCommandInput = Omit<
  LogisticsCommandBaseInput,
  "requestId"
> & {
  reroutingRequestId: string;
  reroutingId: string;
};

export function createRerouting(input: ReroutingInput): Rerouting {
  if (!REROUTING_STATUSES.includes(input.status)) {
    throw contractError("INVALID_REROUTING", "Statut de réacheminement invalide.");
  }
  const fromAgency = normalizeCanonicalAgency(input.fromAgency);
  const toAgency = normalizeCanonicalAgency(input.toAgency);
  if (fromAgency === toAgency) {
    throw contractError("INVALID_REROUTING", "Agences identiques interdites.");
  }
  if (
    typeof input.feeAmount !== "number" ||
    !Number.isFinite(input.feeAmount) ||
    input.feeAmount < 0 ||
    Math.abs(input.feeAmount * 100 - Math.round(input.feeAmount * 100)) > 1e-9
  ) {
    throw contractError("INVALID_AMOUNT", "Frais de réacheminement invalides.");
  }
  if (input.currency !== "USD") {
    throw contractError("INVALID_CURRENCY", "Devise invalide.");
  }
  if (!Number.isInteger(input.tariffVersion) || input.tariffVersion <= 0) {
    throw contractError("INVALID_TARIFF", "Version tarifaire invalide.");
  }
  if (!Number.isInteger(input.version) || input.version <= 0) {
    throw contractError("INVALID_VERSION", "Version invalide.");
  }
  if (input.status === "ARRIVED" && input.physicalArrivalConfirmed !== true) {
    throw contractError("INVALID_REROUTING", "Entrée physique non confirmée.");
  }
  if (
    input.status === "CANCELLED" &&
    input.approvedAt !== null &&
    input.approvedAt !== undefined &&
    input.cancellationCompensatesEventId == null
  ) {
    throw contractError(
      "INVALID_REVERSAL",
      "Une annulation engagée exige une compensation.",
    );
  }

  return deepFreeze({
    reroutingId: validateIdentifier(
      input.reroutingId,
      "INVALID_SOURCE_ID",
      "Identifiant de réacheminement invalide.",
    ),
    parcelId: validateIdentifier(
      input.parcelId,
      "INVALID_SOURCE_ID",
      "Identifiant colis invalide.",
    ),
    trackingCode: normalizeParcelCode(input.trackingCode),
    fromAgency,
    toAgency,
    destinationInitiale: normalizeCanonicalAgency(input.destinationInitiale),
    destinationCouranteAvant: normalizeCanonicalAgency(
      input.destinationCouranteAvant,
    ),
    destinationCouranteApres: normalizeCanonicalAgency(
      input.destinationCouranteApres,
    ),
    requestedBy: validateIdentifier(
      input.requestedBy,
      "INVALID_ACTOR",
      "Identité acteur invalide.",
    ),
    requestedAt: validateOccurredAt(input.requestedAt),
    approvedBy:
      input.approvedBy == null
        ? null
        : validateIdentifier(
            input.approvedBy,
            "INVALID_ACTOR",
            "Identité approbateur invalide.",
          ),
    approvedAt:
      input.approvedAt == null ? null : validateOccurredAt(input.approvedAt),
    reason: validateRequiredReason(input.reason),
    tariffId: validateIdentifier(
      input.tariffId,
      "INVALID_TARIFF",
      "Tarif invalide.",
    ),
    tariffVersion: input.tariffVersion,
    feeAmount: input.feeAmount,
    currency: "USD",
    status: input.status,
    version: input.version,
    physicalArrivalConfirmed: input.physicalArrivalConfirmed === true,
    cancellationCompensatesEventId:
      input.cancellationCompensatesEventId == null
        ? null
        : validateIdentifier(
            input.cancellationCompensatesEventId,
            "INVALID_REVERSAL",
            "Événement compensé invalide.",
          ),
  });
}

export function createProposeReroutingCommand(
  input: ReroutingCommandInput & {
    fromAgency: unknown;
    toAgency: unknown;
    reason: string;
    tariffId: string;
    tariffVersion: number;
    feeAmount?: never;
  },
): ProposeReroutingCommand {
  if ("feeAmount" in input) {
    throw contractError(
      "INVALID_TARIFF",
      "Un Agent ne fixe pas librement le montant.",
    );
  }
  const fromAgency = normalizeCanonicalAgency(input.fromAgency);
  const toAgency = normalizeCanonicalAgency(input.toAgency);
  if (fromAgency === toAgency) {
    throw contractError("INVALID_REROUTING", "Agences identiques interdites.");
  }
  if (!Number.isInteger(input.tariffVersion) || input.tariffVersion <= 0) {
    throw contractError("INVALID_TARIFF", "Version tarifaire invalide.");
  }
  return deepFreeze({
    ...createReroutingCommand(input),
    fromAgency,
    toAgency,
    reason: validateRequiredReason(input.reason),
    tariffId: validateIdentifier(
      input.tariffId,
      "INVALID_TARIFF",
      "Tarif invalide.",
    ),
    tariffVersion: input.tariffVersion,
  });
}

export function createReroutingCommand(
  input: ReroutingCommandInput,
): ReroutingCommand {
  const reroutingRequestId = validateIdentifier(
    input.reroutingRequestId,
    "INVALID_REQUEST_ID",
    "Identifiant de réacheminement invalide.",
  );
  return deepFreeze({
    ...createLogisticsCommandBase({ ...input, requestId: reroutingRequestId }),
    reroutingRequestId,
    reroutingId: validateIdentifier(
      input.reroutingId,
      "INVALID_SOURCE_ID",
      "Identifiant de réacheminement invalide.",
    ),
  });
}

export function startRerouting(
  position: ParcelPosition,
  rerouting: Rerouting,
  command: StartReroutingCommand,
  eventId: string,
): ParcelPosition {
  if (
    rerouting.status !== "APPROVED" ||
    position.locationState !== "AT_AGENCY" ||
    position.currentAgency !== rerouting.fromAgency ||
    command.actorAgency !== rerouting.fromAgency ||
    position.version !== command.expectedPositionVersion
  ) {
    throw contractError("INVALID_REROUTING", "Départ de réacheminement interdit.");
  }
  return transitionParcelPosition(position, {
    ...position,
    destinationCourante: rerouting.destinationCouranteApres,
    locationState: "IN_TRANSIT",
    currentAgency: null,
    transitFrom: rerouting.fromAgency,
    transitTo: rerouting.toAgency,
    lastEventId: eventId,
    version: position.version + 1,
    updatedAt: command.requestedAt,
  });
}

export function confirmReroutingArrival(
  position: ParcelPosition,
  rerouting: Rerouting,
  command: ConfirmReroutingArrivalCommand,
  eventId: string,
): ParcelPosition {
  if (
    rerouting.status !== "DEPARTED" ||
    command.physicalArrivalConfirmed !== true ||
    position.locationState !== "IN_TRANSIT" ||
    position.transitTo !== command.actorAgency
  ) {
    throw contractError("INVALID_REROUTING", "Arrivée de réacheminement interdite.");
  }
  return transitionParcelPosition(position, {
    ...position,
    locationState: "AT_AGENCY",
    currentAgency: rerouting.toAgency,
    transitFrom: null,
    transitTo: null,
    lastEventId: eventId,
    version: position.version + 1,
    updatedAt: command.requestedAt,
  });
}

export function reroutingIdempotency(
  storedFingerprint: string | null,
  command: ReroutingCommand,
) {
  return resolveIdempotency(storedFingerprint, stableCommandFingerprint(command));
}
