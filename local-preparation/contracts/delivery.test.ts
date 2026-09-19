import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmDelivery,
  createConfirmDeliveryCommand,
  type ConfirmDeliveryCommandInput,
  type PaymentStatus,
} from "./delivery";
import { ContractValidationError } from "./errors";
import { stableCommandFingerprint } from "./logistics-command";
import { createParcelPosition } from "./parcel-position";

const position = () =>
  createParcelPosition({
    parcelId: "parcel-001",
    trackingCode: "MR-001",
    destinationInitiale: "FIH",
    destinationCourante: "FIH",
    locationState: "AT_AGENCY",
    currentAgency: "FIH",
    transitFrom: null,
    transitTo: null,
    lastEventId: "event-001",
    version: 3,
    updatedAt: "2026-07-30T10:00:00.000Z",
  });
const commandInput = (
  overrides: Partial<ConfirmDeliveryCommandInput> = {},
): ConfirmDeliveryCommandInput => ({
  deliveryRequestId: "delivery-request-001",
  parcelId: "parcel-001",
  expectedPositionVersion: 3,
  physicalHandOverConfirmed: true,
  actorId: "agent-001",
  actorAgency: "FIH",
  requestedAt: "2026-07-30T11:00:00.000Z",
  ...overrides,
});
function deliver(paymentStatus: PaymentStatus = "NON_PAYE") {
  return confirmDelivery({
    position: position(),
    command: createConfirmDeliveryCommand(commandInput()),
    deliveryId: "delivery-001",
    eventId: "event-delivery-001",
    deliveredAt: "2026-07-30T11:00:00.000Z",
    paymentStatus,
  });
}

test("21. livraison AT_AGENCY dans la même agence valide", () => {
  assert.equal(deliver().newPosition.locationState, "DELIVERED");
});
test("22. livraison depuis une mauvaise agence refusée", () => {
  const command = createConfirmDeliveryCommand(
    commandInput({ actorAgency: "LSHI" }),
  );
  assert.throws(
    () =>
      confirmDelivery({
        position: position(),
        command,
        deliveryId: "delivery-001",
        eventId: "event-delivery-001",
        deliveredAt: "2026-07-30T11:00:00.000Z",
        paymentStatus: "PAYE",
      }),
    ContractValidationError,
  );
});
test("23. livraison IN_TRANSIT refusée", () => {
  const transit = createParcelPosition({
    ...position(),
    locationState: "IN_TRANSIT",
    currentAgency: null,
    transitFrom: "FIH",
    transitTo: "KLZ",
  });
  assert.throws(
    () =>
      confirmDelivery({
        position: transit,
        command: createConfirmDeliveryCommand(commandInput()),
        deliveryId: "delivery-001",
        eventId: "event-delivery-001",
        deliveredAt: "2026-07-30T11:00:00.000Z",
        paymentStatus: "PAYE",
      }),
    ContractValidationError,
  );
});
test("24. livraison déjà DELIVERED refusée", () => {
  const delivered = createParcelPosition({
    ...position(),
    locationState: "DELIVERED",
    currentAgency: null,
  });
  assert.throws(
    () =>
      confirmDelivery({
        position: delivered,
        command: createConfirmDeliveryCommand(commandInput()),
        deliveryId: "delivery-001",
        eventId: "event-delivery-001",
        deliveredAt: "2026-07-30T11:00:00.000Z",
        paymentStatus: "PAYE",
      }),
    ContractValidationError,
  );
});
test("25. physicalHandOverConfirmed false refusé", () => {
  assert.throws(
    () =>
      createConfirmDeliveryCommand(
        commandInput({ physicalHandOverConfirmed: false }),
      ),
    ContractValidationError,
  );
});
test("26. livraison PAYE valide", () => {
  assert.equal(deliver("PAYE").newPosition.locationState, "DELIVERED");
});
test("27. livraison NON_PAYE valide car PAYÉ est distinct de LIVRÉ", () => {
  assert.equal(deliver("NON_PAYE").newPosition.locationState, "DELIVERED");
});
test("28. livraison ne modifie pas le statut financier", () => {
  const paymentStatus: PaymentStatus = "PARTIELLEMENT_PAYE";
  deliver(paymentStatus);
  assert.equal(paymentStatus, "PARTIELLEMENT_PAYE");
});
test("29. deliveryRequestId est distinct de paymentRequestId", () => {
  const command = createConfirmDeliveryCommand(commandInput());
  assert.equal(command.deliveryRequestId, "delivery-request-001");
  assert.equal("paymentRequestId" in command, false);
});
test("30. double commande avec même empreinte est rejouée", () => {
  const command = createConfirmDeliveryCommand(commandInput());
  const result = confirmDelivery({
    position: position(),
    command,
    deliveryId: "delivery-001",
    eventId: "event-delivery-001",
    deliveredAt: "2026-07-30T11:00:00.000Z",
    paymentStatus: "NON_PAYE",
    storedFingerprint: stableCommandFingerprint(command),
  });
  assert.equal(result.idempotencyStatus, "REPLAYED");
});
test("31. même ID avec contenu différent produit un conflit", () => {
  const command = createConfirmDeliveryCommand(commandInput());
  assert.throws(
    () =>
      confirmDelivery({
        position: position(),
        command,
        deliveryId: "delivery-001",
        eventId: "event-delivery-001",
        deliveredAt: "2026-07-30T11:00:00.000Z",
        paymentStatus: "NON_PAYE",
        storedFingerprint: "different-fingerprint",
      }),
    ContractValidationError,
  );
});
