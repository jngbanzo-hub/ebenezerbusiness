import assert from "node:assert/strict";
import test from "node:test";

import { ContractValidationError } from "./errors";
import { createParcelPosition } from "./parcel-position";
import {
  confirmReroutingArrival,
  createProposeReroutingCommand,
  createRerouting,
  createReroutingCommand,
  reroutingIdempotency,
  startRerouting,
  type ConfirmReroutingArrivalCommand,
  type ReroutingInput,
  type StartReroutingCommand,
} from "./rerouting";

const reroutingInput = (
  overrides: Partial<ReroutingInput> = {},
): ReroutingInput => ({
  reroutingId: "rerouting-001",
  parcelId: "parcel-001",
  trackingCode: "MR-001",
  fromAgency: "FIH",
  toAgency: "KLZ",
  destinationInitiale: "FIH",
  destinationCouranteAvant: "FIH",
  destinationCouranteApres: "KLZ",
  requestedBy: "agent-001",
  requestedAt: "2026-07-30T10:00:00.000Z",
  approvedBy: null,
  approvedAt: null,
  reason: "Retrait demandé à KLZ",
  tariffId: "tariff-001",
  tariffVersion: 1,
  feeAmount: 5,
  currency: "USD",
  status: "PROPOSED",
  version: 1,
  physicalArrivalConfirmed: false,
  cancellationCompensatesEventId: null,
  ...overrides,
});
const commandInput = {
  reroutingRequestId: "rerouting-request-001",
  reroutingId: "rerouting-001",
  parcelId: "parcel-001",
  expectedPositionVersion: 1,
  actorId: "agent-001",
  actorAgency: "FIH",
  requestedAt: "2026-07-30T11:00:00.000Z",
};
const atFih = () =>
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
    version: 1,
    updatedAt: "2026-07-30T10:00:00.000Z",
  });

test("32. proposition de réacheminement valide", () => {
  assert.equal(createRerouting(reroutingInput()).status, "PROPOSED");
});
test("33. fromAgency égale toAgency refusé", () => {
  assert.throws(
    () => createRerouting(reroutingInput({ toAgency: "FIH" })),
    ContractValidationError,
  );
});
test("34. départ depuis mauvaise agence refusé", () => {
  const rerouting = createRerouting(
    reroutingInput({
      status: "APPROVED",
      approvedBy: "admin-001",
      approvedAt: "2026-07-30T10:30:00.000Z",
    }),
  );
  const command = createReroutingCommand({
    ...commandInput,
    actorAgency: "LSHI",
  }) as StartReroutingCommand;
  assert.throws(
    () => startRerouting(atFih(), rerouting, command, "event-002"),
    ContractValidationError,
  );
});
test("35. ARRIVED sans DEPARTED refusé", () => {
  const rerouting = createRerouting(reroutingInput({ status: "APPROVED" }));
  const position = createParcelPosition({
    ...atFih(),
    locationState: "IN_TRANSIT",
    currentAgency: null,
    transitFrom: "FIH",
    transitTo: "KLZ",
  });
  const command = {
    ...createReroutingCommand({
      ...commandInput,
      actorAgency: "KLZ",
    }),
    physicalArrivalConfirmed: true,
  } as ConfirmReroutingArrivalCommand;
  assert.throws(
    () => confirmReroutingArrival(position, rerouting, command, "event-003"),
    ContractValidationError,
  );
});
test("36. destination initiale n'est jamais écrasée", () => {
  const rerouting = createRerouting(
    reroutingInput({
      status: "APPROVED",
      approvedBy: "admin-001",
      approvedAt: "2026-07-30T10:30:00.000Z",
    }),
  );
  const next = startRerouting(
    atFih(),
    rerouting,
    createReroutingCommand(commandInput) as StartReroutingCommand,
    "event-002",
  );
  assert.equal(next.destinationInitiale, "FIH");
});
test("37. destination courante est mise à jour séparément", () => {
  const rerouting = createRerouting(
    reroutingInput({
      status: "APPROVED",
      approvedBy: "admin-001",
      approvedAt: "2026-07-30T10:30:00.000Z",
    }),
  );
  const next = startRerouting(
    atFih(),
    rerouting,
    createReroutingCommand(commandInput) as StartReroutingCommand,
    "event-002",
  );
  assert.equal(next.destinationCourante, "KLZ");
});
test("38. frais négatif refusé", () => {
  assert.throws(
    () => createRerouting(reroutingInput({ feeAmount: -1 })),
    ContractValidationError,
  );
});
test("39. devise autre que USD refusée", () => {
  assert.throws(
    () => createRerouting(reroutingInput({ currency: "CDF" })),
    ContractValidationError,
  );
});
test("40. tarif non versionné refusé", () => {
  assert.throws(
    () => createRerouting(reroutingInput({ tariffVersion: 0 })),
    ContractValidationError,
  );
});
test("41. Agent ne peut pas imposer un montant libre exécutoire", () => {
  assert.throws(
    () =>
      createProposeReroutingCommand({
        ...commandInput,
        fromAgency: "FIH",
        toAgency: "KLZ",
        reason: "Retrait demandé à KLZ",
        tariffId: "tariff-001",
        tariffVersion: 1,
        feeAmount: 999,
      } as never),
    ContractValidationError,
  );
});
test("42. annulation engagée exige une compensation auditée", () => {
  assert.throws(
    () =>
      createRerouting(
        reroutingInput({
          status: "CANCELLED",
          approvedBy: "admin-001",
          approvedAt: "2026-07-30T10:30:00.000Z",
        }),
      ),
    ContractValidationError,
  );
  assert.equal(
    createRerouting(
      reroutingInput({
        status: "CANCELLED",
        approvedBy: "admin-001",
        approvedAt: "2026-07-30T10:30:00.000Z",
        cancellationCompensatesEventId: "event-002",
      }),
    ).cancellationCompensatesEventId,
    "event-002",
  );
});
test("43. double réacheminement avec même empreinte est rejoué", () => {
  const command = createReroutingCommand(commandInput);
  assert.equal(reroutingIdempotency(null, command), "CREATED");
  const firstFingerprint = JSON.stringify(
    Object.fromEntries(Object.entries(command).sort(([a], [b]) => a.localeCompare(b))),
  );
  assert.equal(reroutingIdempotency(firstFingerprint, command), "REPLAYED");
  assert.equal(reroutingIdempotency("different", command), "CONFLICT");
});
