import assert from "node:assert/strict";
import test from "node:test";

import { ContractValidationError } from "./errors";
import {
  createFinancialEvent,
  createLegacyFinancialRecord,
  type FinancialEventInput,
} from "./financial-event";
import { validFinancialEventInput } from "./fixtures";

function rejects(
  overrides: Partial<FinancialEventInput>,
  code: ContractValidationError["code"],
) {
  assert.throws(
    () => createFinancialEvent(validFinancialEventInput(overrides)),
    (error) => error instanceof ContractValidationError && error.code === code,
  );
}

test("crée un événement USD immutable et normalise COTONOU", () => {
  const event = createFinancialEvent(
    validFinancialEventInput({
      agency: " COTONOU ",
      metadata: { nested: { values: [1, "ok", true, null] } },
    }),
  );

  assert.equal(event.agency, "COO");
  assert.equal(event.currency, "USD");
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.metadata), true);
  assert.equal(Object.isFrozen(event.metadata.nested), true);
});

test("refuse les devises historiques pour un nouvel événement", () => {
  rejects({ currency: "FCFA" }, "INVALID_CURRENCY");
  rejects({ currency: "CDF" }, "INVALID_CURRENCY");
});

test("refuse les montants non strictement positifs ou trop précis", () => {
  rejects({ amount: 0 }, "INVALID_AMOUNT");
  rejects({ amount: -1 }, "INVALID_AMOUNT");
  rejects({ amount: 1.001 }, "INVALID_AMOUNT");
});

test("valide requestId et les règles de compensation", () => {
  rejects({ requestId: undefined }, "INVALID_REQUEST_ID");
  rejects(
    {
      eventType: "FINANCIAL_REVERSAL",
      status: "RECORDED",
      reversalOf: "financial-event-000",
    },
    "INVALID_EVENT_STATUS",
  );
  rejects(
    {
      eventType: "FINANCIAL_REVERSAL",
      status: "REVERSED",
      reversalOf: null,
    },
    "INVALID_REVERSAL",
  );
  rejects({ reversalOf: "financial-event-000" }, "INVALID_REVERSAL");
});

test("refuse les statuts logistiques et les types étrangers", () => {
  rejects({ status: "LIVRÉ" as never }, "INVALID_EVENT_STATUS");
  rejects({ eventType: "TRANSFER" as never }, "INVALID_EVENT_TYPE");
});

test("refuse des métadonnées non JSON-safe ou sensibles", () => {
  rejects({ metadata: { createdAt: new Date() } }, "INVALID_METADATA");
  rejects({ metadata: { value: undefined } }, "INVALID_METADATA");
  rejects({ metadata: { token: "not-allowed" } }, "INVALID_METADATA");
});

test("conserve les devises historiques sans conversion", () => {
  for (const currency of ["USD", "FCFA", "CDF"] as const) {
    const record = createLegacyFinancialRecord({
      sourceId: `legacy-${currency}`,
      agency: "COO",
      originalAmount: 125.555,
      originalCurrency: currency,
      occurredAt: "2026-07-30T10:15:30.000Z",
      metadata: { imported: true },
    });
    assert.equal(record.originalAmount, 125.555);
    assert.equal(record.originalCurrency, currency);

    assert.throws(() => {
      // @ts-expect-error Un relevé historique n'est pas un FinancialEventInput.
      createFinancialEvent(record);
    }, ContractValidationError);
  }
});
