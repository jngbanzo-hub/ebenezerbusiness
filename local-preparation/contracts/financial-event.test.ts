import assert from "node:assert/strict";
import test from "node:test";

import { ContractValidationError } from "./errors";
import {
  createFinancialEvent,
  createLegacyFinancialRecord,
  createSupplementalReceivable,
  projectParcelFinancials,
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

const receivableInput = {
  receivableId: "receivable-001",
  parcelId: "parcel-001",
  reroutingId: "rerouting-001",
  eventType: "REROUTING_FEE_ASSESSED" as const,
  amount: 5,
  currency: "USD",
  tariffId: "tariff-001",
  tariffVersion: 1,
  calculationBasis: { route: "FIH-KLZ" },
  assessedAt: "2026-07-30T10:15:30.000Z",
  assessedBy: "system-001",
  requestId: "financial-request-001",
};

test("44. REROUTING_FEE_ASSESSED valide", () => {
  const event = createFinancialEvent(
    validFinancialEventInput({
      eventType: "REROUTING_FEE_ASSESSED",
      sourceType: "ADMIN",
      sourceId: "rerouting-001",
    }),
  );
  assert.equal(event.eventType, "REROUTING_FEE_ASSESSED");
  assert.equal(createSupplementalReceivable(receivableInput).amount, 5);
});

test("45. REROUTING_FEE_REVERSED valide", () => {
  const event = createSupplementalReceivable({
    ...receivableInput,
    receivableId: "receivable-reversal-001",
    eventType: "REROUTING_FEE_REVERSED",
    reversedBy: "admin-001",
    reversalReason: "Tarif appliqué par erreur",
    reversalOfReceivableId: "receivable-001",
  });
  assert.equal(event.reversalOfReceivableId, "receivable-001");
});

test("46. reversal sans frais initial refusé", () => {
  assert.throws(
    () =>
      createSupplementalReceivable({
        ...receivableInput,
        eventType: "REROUTING_FEE_REVERSED",
        reversedBy: "admin-001",
        reversalReason: "Tarif appliqué par erreur",
      }),
    ContractValidationError,
  );
});

test("47. montant initial reste inchangé", () => {
  const projection = projectParcelFinancials({
    initialAmount: 100,
    assessedFees: [createSupplementalReceivable(receivableInput)],
    reversedReceivableIds: [],
    paymentsApplied: 0,
  });
  assert.equal(projection.montantInitial, 100);
  assert.equal(projection.totalDu, 105);
});

test("48. total dû et nouveau solde sont des projections séparées", () => {
  const projection = projectParcelFinancials({
    initialAmount: 100,
    assessedFees: [createSupplementalReceivable(receivableInput)],
    reversedReceivableIds: [],
    paymentsApplied: 20,
  });
  assert.deepEqual(projection, {
    montantInitial: 100,
    totalDu: 105,
    nouveauSolde: 85,
  });
});

test("49. un frais de réacheminement n'est pas un paiement", () => {
  const receivable = createSupplementalReceivable(receivableInput);
  assert.equal(receivable.eventType, "REROUTING_FEE_ASSESSED");
  assert.notEqual(receivable.eventType, "PAYMENT_RECORDED");
});

test("50. financialRequestId dédié n'utilise pas paymentRequestId", () => {
  const receivable = createSupplementalReceivable(receivableInput);
  assert.equal(receivable.requestId, "financial-request-001");
  assert.equal("paymentRequestId" in receivable, false);
});
