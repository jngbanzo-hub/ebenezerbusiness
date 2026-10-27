import assert from "node:assert/strict";
import test from "node:test";

import { collectedPaymentDate, uniqueCompletedPaymentCandidate } from "./agent-collected-payment-match.ts";

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

test("orchestration historique sans parcel_id : seul l'événement de sortie exact rattache le colis", () => {
  const historicalParcel = { ...parcel, deliveredEventId: "exit-1" };
  assert.equal(collectedPaymentDate(historicalParcel, { ...orchestration, parcelId: null }, payment), payment.dateTime);
  assert.equal(collectedPaymentDate(historicalParcel, { ...orchestration, parcelId: null, storageEventId: "other-exit" }, payment), null);
  assert.equal(collectedPaymentDate({ ...historicalParcel, deliveredEventId: null }, { ...orchestration, parcelId: null }, payment), null);
});

test("un parcel_id renseigné mais contradictoire ne peut pas être contourné par l'événement", () => {
  assert.equal(collectedPaymentDate(
    { ...parcel, deliveredEventId: "exit-1" },
    { ...orchestration, parcelId: "other-parcel" }, payment
  ), null);
});

test("le rattachement historique conserve l'agence, le code et l'identité forwarding", () => {
  const historicalParcel = { ...parcel, deliveredEventId: "exit-1" };
  const historical = { ...orchestration, parcelId: null };
  assert.equal(collectedPaymentDate(historicalParcel, { ...historical, agency: "KLZ" }, payment), null);
  assert.equal(collectedPaymentDate(historicalParcel, { ...historical, trackingCode: "SE22426B" }, payment), null);
  assert.equal(collectedPaymentDate({ ...historicalParcel, forwardingId: "forwarding-1" }, historical, payment), null);
  assert.equal(collectedPaymentDate(historicalParcel, historical, { ...payment, agenceEncaissement: "COO" }), null);
});

test("aucune preuve ou plusieurs candidats restent ambigus", () => {
  assert.equal(uniqueCompletedPaymentCandidate([], []), null);
  assert.equal(uniqueCompletedPaymentCandidate([orchestration], []), orchestration);
  assert.equal(uniqueCompletedPaymentCandidate([], [orchestration]), orchestration);
  assert.equal(uniqueCompletedPaymentCandidate([orchestration], [{ ...orchestration, requestId: "request-2" }]), null);
  assert.equal(uniqueCompletedPaymentCandidate([], [orchestration, { ...orchestration, requestId: "request-2" }]), null);
});

test("checkpoint incomplet, paiement partiel, montant incohérent ou date invalide restent sans preuve", () => {
  assert.equal(collectedPaymentDate(parcel, { ...orchestration, state: "PENDING" }, payment), null);
  assert.equal(collectedPaymentDate(parcel, { ...orchestration, storageEventId: null }, payment), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, soldeRestant: 1 }), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, montantPaye: 55 }), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, dateTime: "date inconnue" }), null);
  assert.equal(collectedPaymentDate(parcel, orchestration, { ...payment, dateTime: "2026-10-27" }), null);
});
