import assert from "node:assert/strict";
import test from "node:test";

import { ContractValidationError } from "./errors";
import { validStockEventInput } from "./fixtures";
import {
  createStockEvent,
  STOCK_SOURCE_TYPES,
  type StockEventInput,
} from "./stock-event";

function rejects(
  overrides: Partial<StockEventInput>,
  code: ContractValidationError["code"],
) {
  assert.throws(
    () => createStockEvent(validStockEventInput(overrides)),
    (error) => error instanceof ContractValidationError && error.code === code,
  );
}

test("crée un mouvement immutable et normalise le code colis", () => {
  const event = createStockEvent(validStockEventInput());
  assert.equal(event.parcelCode, "MR-001");
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.metadata), true);
});

test("refuse un poids nul ou négatif et un code colis vide", () => {
  rejects({ weightKg: 0 }, "INVALID_WEIGHT");
  rejects({ weightKg: -1 }, "INVALID_WEIGHT");
  rejects({ parcelCode: "" }, "INVALID_PARCEL_CODE");
});

test("refuse une agence inconnue et les types étrangers", () => {
  rejects({ agency: "AUTRE" }, "INVALID_AGENCY");
  rejects({ eventType: "TRANSFER" as never }, "INVALID_EVENT_TYPE");
  rejects({ sourceType: "PAYMENT_ENGINE" as never }, "INVALID_SOURCE_ID");
  assert.equal(STOCK_SOURCE_TYPES.includes("PAYMENT_ENGINE" as never), false);
});

test("une sortie destination exige une confirmation physique explicite", () => {
  rejects(
    {
      eventType: "SORTIE_DESTINATION",
      sourceType: "MANIFEST_OBSERVATION",
    },
    "INVALID_EVENT_TYPE",
  );

  const event = createStockEvent(
    validStockEventInput({
      eventType: "SORTIE_DESTINATION",
      sourceType: "DELIVERY_CONFIRMATION",
    }),
  );
  assert.equal(event.eventType, "SORTIE_DESTINATION");
  assert.equal(event.sourceType, "DELIVERY_CONFIRMATION");
});

test("valide les compensations et l’immutabilité profonde", () => {
  rejects(
    {
      eventType: "STOCK_REVERSAL",
      status: "RECORDED",
      reversalOf: "movement-000",
    },
    "INVALID_EVENT_STATUS",
  );
  rejects(
    { eventType: "STOCK_REVERSAL", status: "REVERSED", reversalOf: null },
    "INVALID_REVERSAL",
  );
  rejects({ reversalOf: "movement-000" }, "INVALID_REVERSAL");

  const event = createStockEvent(
    validStockEventInput({ metadata: { nested: { value: 1 } } }),
  );
  assert.equal(Object.isFrozen(event.metadata.nested), true);
});
