import { deepFreeze, validateIdentifier, validateOccurredAt } from "./common";
import { contractError } from "./errors";
import {
  createLogisticsCommandBase,
  resolveIdempotency,
  stableCommandFingerprint,
  type IdempotencyOutcome,
  type LogisticsCommandBase,
  type LogisticsCommandBaseInput,
} from "./logistics-command";
import {
  transitionParcelPosition,
  type ParcelPosition,
} from "./parcel-position";

export const PAYMENT_STATUSES = [
  "NON_PAYE",
  "PARTIELLEMENT_PAYE",
  "PAYE",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type ConfirmDeliveryCommand = Omit<LogisticsCommandBase, "requestId"> &
  Readonly<{
    requestId: string;
    deliveryRequestId: string;
    physicalHandOverConfirmed: true;
  }>;

export type ConfirmDeliveryCommandInput = Omit<
  LogisticsCommandBaseInput,
  "requestId"
> & {
  deliveryRequestId: string;
  physicalHandOverConfirmed: boolean;
};

export type DeliveryResult = Readonly<{
  deliveryId: string;
  eventId: string;
  parcelId: string;
  previousPosition: ParcelPosition;
  newPosition: ParcelPosition;
  idempotencyStatus: IdempotencyOutcome;
  deliveredAt: string;
}>;

export function createConfirmDeliveryCommand(
  input: ConfirmDeliveryCommandInput,
): ConfirmDeliveryCommand {
  if (input.physicalHandOverConfirmed !== true) {
    throw contractError(
      "INVALID_DELIVERY",
      "La remise physique doit être confirmée.",
    );
  }
  const deliveryRequestId = validateIdentifier(
    input.deliveryRequestId,
    "INVALID_REQUEST_ID",
    "Identifiant de livraison invalide.",
  );
  const base = createLogisticsCommandBase({
    ...input,
    requestId: deliveryRequestId,
  });
  return deepFreeze({
    ...base,
    deliveryRequestId,
    physicalHandOverConfirmed: true,
  });
}

export function confirmDelivery(input: {
  position: ParcelPosition;
  command: ConfirmDeliveryCommand;
  deliveryId: string;
  eventId: string;
  deliveredAt: string;
  paymentStatus: PaymentStatus;
  storedFingerprint?: string | null;
}): DeliveryResult {
  const { position, command } = input;
  if (!PAYMENT_STATUSES.includes(input.paymentStatus)) {
    throw contractError("INVALID_EVENT_STATUS", "Statut financier invalide.");
  }
  if (position.version !== command.expectedPositionVersion) {
    throw contractError("INVALID_VERSION", "Version de position obsolète.");
  }
  if (
    position.locationState !== "AT_AGENCY" ||
    position.currentAgency !== command.actorAgency
  ) {
    throw contractError("INVALID_DELIVERY", "Livraison physique interdite.");
  }

  const fingerprint = stableCommandFingerprint(command);
  const idempotencyStatus = resolveIdempotency(
    input.storedFingerprint ?? null,
    fingerprint,
  );
  if (idempotencyStatus === "CONFLICT") {
    throw contractError("INVALID_IDEMPOTENCY", "Conflit d’idempotence.");
  }

  const deliveredAt = validateOccurredAt(input.deliveredAt);
  const newPosition = transitionParcelPosition(position, {
    ...position,
    locationState: "DELIVERED",
    currentAgency: null,
    transitFrom: null,
    transitTo: null,
    lastEventId: input.eventId,
    version: position.version + 1,
    updatedAt: deliveredAt,
  });

  return deepFreeze({
    deliveryId: validateIdentifier(
      input.deliveryId,
      "INVALID_SOURCE_ID",
      "Identifiant de livraison invalide.",
    ),
    eventId: validateIdentifier(
      input.eventId,
      "INVALID_EVENT_ID",
      "Identifiant d’événement invalide.",
    ),
    parcelId: position.parcelId,
    previousPosition: position,
    newPosition,
    idempotencyStatus,
    deliveredAt,
  });
}
