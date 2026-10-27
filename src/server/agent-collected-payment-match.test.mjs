import assert from "node:assert/strict";
import test from "node:test";

import { collectedPaymentDate } from "./agent-collected-payment-match.ts";

const parcel = { parcelId: "parcel-1", forwardingId: null, trackingCode: "SE22426", agency: "FIH" };
const orchestration = {
  requestId: "request-1", parcelId: "parcel-1", forwardingId: null, trackingCode: "SE22426", agency: "FIH",
  paidAmount: 54, paymentCreated: true, state: "COMPLETED", cashEventId: "cash-1", storageEventId: "exit-1"
};
const payment = {
  paymentRequestId: "request-1", codeColis: "SE22426", destinationCode: "FIH", agenceEncaissement: "FIH",
  montantPaye: 54, soldeRestant: 0, dateTime: "2026-10-27T12:00:00.000Z"
};

test("paiement complet à destination avec identité physique exacte : date canonique", () => {
  assert.equal(collectedPaymentDate(parcel, orchestration, payment), payment.dateTime);
});

test("FIH, KLZ et LSHI gardent la même exigence d'agence exacte", () => {
  for (const agency of ["FIH", "KLZ", "LSHI"]) {
    assert.equal(collectedPaymentDate(
      { ...parcel, agency },
      { ...orchestration, agency },
      { ...payment, destinationCode: agency, agenceEncaissement: agency }
    ), payment.dateTime);
    assert.equal(collectedPaymentDate(
      { ...parcel, agency },
      { ...orchestration, agency },
      { ...payment, destinationCode: agency, agenceEncaissement: "COO" }
    ), null);
  }
});

test("paiement COO, homonyme inter-agences et code suffixé ne prouvent pas l'encaissement à destination", () => {
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, agenceEncaissement: "COO" }), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, destinationCode: "LSHI" }), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, codeColis: "SE22426B" }), null);
  assert.equal(collectedPaymentDate(parcel, { ...orchestration, parcelId: "another-parcel" }, payment), null);
});

test("acheminement : forwarding_id doit correspondre exactement", () => {
  const forwardingParcel = { ...parcel, forwardingId: "forwarding-1" };
  assert.equal(collectedPaymentDate(forwardingParcel, { ...orchestration, forwardingId: "forwarding-1" }, payment), payment.dateTime);
  assert.equal(collectedPaymentDate(forwardingParcel, orchestration, payment), null);
});

test("checkpoint incomplet, paiement partiel, montant incohérent ou date invalide restent sans preuve", () => {
  assert.equal(collectedPaymentDate(parcel, { ...orchestration, state: "PENDING" }, payment), null);
  assert.equal(collectedPaymentDate(parcel, { ...orchestration, storageEventId: null }, payment), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, soldeRestant: 1 }), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, montantPaye: 55 }), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, dateTime: "date inconnue" }), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, dateTime: "2026-10-27" }), null);
});
