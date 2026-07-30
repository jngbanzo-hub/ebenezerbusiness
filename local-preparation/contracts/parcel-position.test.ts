import assert from "node:assert/strict";
import test from "node:test";

import { ContractValidationError } from "./errors";
import {
  createParcelPosition,
  transitionParcelPosition,
  type ParcelPositionInput,
} from "./parcel-position";

const base = (
  overrides: Partial<ParcelPositionInput> = {},
): ParcelPositionInput => ({
  parcelId: "parcel-001",
  trackingCode: "mr-001",
  destinationInitiale: "FIH",
  destinationCourante: "FIH",
  locationState: "AT_AGENCY",
  currentAgency: "FIH",
  transitFrom: null,
  transitTo: null,
  lastEventId: "event-001",
  version: 1,
  updatedAt: "2026-07-30T10:15:30.000Z",
  ...overrides,
});

test("3. accepte les quatre états de position valides", () => {
  assert.equal(createParcelPosition(base()).locationState, "AT_AGENCY");
  assert.equal(
    createParcelPosition(
      base({
        locationState: "IN_TRANSIT",
        currentAgency: null,
        transitFrom: "FIH",
        transitTo: "LSHI",
      }),
    ).locationState,
    "IN_TRANSIT",
  );
  assert.equal(
    createParcelPosition(
      base({ locationState: "DELIVERED", currentAgency: null }),
    ).locationState,
    "DELIVERED",
  );
  assert.equal(
    createParcelPosition(
      base({ locationState: "UNKNOWN", currentAgency: null }),
    ).locationState,
    "UNKNOWN",
  );
});

test("4. refuse AT_AGENCY sans currentAgency", () => {
  assert.throws(
    () => createParcelPosition(base({ currentAgency: null })),
    ContractValidationError,
  );
});

test("5. refuse IN_TRANSIT avec currentAgency", () => {
  assert.throws(
    () =>
      createParcelPosition(
        base({ locationState: "IN_TRANSIT", transitFrom: "FIH", transitTo: "KLZ" }),
      ),
    ContractValidationError,
  );
});

test("6. refuse IN_TRANSIT sans transitFrom", () => {
  assert.throws(
    () =>
      createParcelPosition(
        base({
          locationState: "IN_TRANSIT",
          currentAgency: null,
          transitTo: "KLZ",
        }),
      ),
    ContractValidationError,
  );
});

test("7. refuse IN_TRANSIT sans transitTo", () => {
  assert.throws(
    () =>
      createParcelPosition(
        base({
          locationState: "IN_TRANSIT",
          currentAgency: null,
          transitFrom: "FIH",
        }),
      ),
    ContractValidationError,
  );
});

test("8. refuse DELIVERED avec currentAgency", () => {
  assert.throws(
    () => createParcelPosition(base({ locationState: "DELIVERED" })),
    ContractValidationError,
  );
});

test("9. conserve destinationInitiale lors d'une transition", () => {
  const previous = createParcelPosition(base());
  const next = transitionParcelPosition(previous, {
    ...base({
      destinationInitiale: "FIH",
      destinationCourante: "KLZ",
      locationState: "IN_TRANSIT",
      currentAgency: null,
      transitFrom: "FIH",
      transitTo: "KLZ",
      version: 2,
      lastEventId: "event-002",
    }),
  });
  assert.equal(next.destinationInitiale, "FIH");
  assert.equal(next.destinationCourante, "KLZ");
});

test("9b. refuse l'écrasement de destinationInitiale", () => {
  const previous = createParcelPosition(base());
  assert.throws(
    () =>
      transitionParcelPosition(
        previous,
        base({
          destinationInitiale: "KLZ",
          locationState: "IN_TRANSIT",
          currentAgency: null,
          transitFrom: "FIH",
          transitTo: "KLZ",
          version: 2,
        }),
      ),
    ContractValidationError,
  );
});

test("10. refuse une version négative ou incohérente", () => {
  assert.throws(
    () => createParcelPosition(base({ version: -1 })),
    ContractValidationError,
  );
  const previous = createParcelPosition(base());
  assert.throws(
    () =>
      transitionParcelPosition(
        previous,
        base({
          locationState: "IN_TRANSIT",
          currentAgency: null,
          transitFrom: "FIH",
          transitTo: "KLZ",
          version: 4,
        }),
      ),
    ContractValidationError,
  );
});

test("10b. refuse les transitions physiques directes interdites", () => {
  const transit = createParcelPosition(
    base({
      locationState: "IN_TRANSIT",
      currentAgency: null,
      transitFrom: "FIH",
      transitTo: "KLZ",
    }),
  );
  assert.throws(
    () =>
      transitionParcelPosition(
        transit,
        base({
          locationState: "DELIVERED",
          currentAgency: null,
          version: 2,
        }),
      ),
    ContractValidationError,
  );
});
