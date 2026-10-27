import assert from "node:assert/strict";
import test from "node:test";

import { collectedPaymentDate, confirmedCooPaymentSnapshot, confirmedDeliveryEvidence, uniqueCompletedPaymentCandidate, verifiedPaymentAgent } from "./agent-collected-payment-match.ts";

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

test("le nom de l'encaisseur exige la concordance P1 et orchestration du paiement exact", () => {
  assert.equal(verifiedPaymentAgent("Maman Deborah", "Maman Deborah"), "Maman Deborah");
  assert.equal(verifiedPaymentAgent(" Maman  Deborah ", "maman deborah"), "Maman Deborah");
  assert.equal(verifiedPaymentAgent("", "Maman Deborah"), null);
  assert.equal(verifiedPaymentAgent("Maman Deborah", "Autre agent"), null);
});

const deliveredParcel = {
  parcelId: "62234fb7-ae8c-4724-8eb1-447ca8b6bf70", deliveredEventId: "delivery-klz-ot01926",
  forwardingId: null, trackingCode: "OT01926", agency: "KLZ", deliveryStatus: "DELIVERED",
  deliveredBy: "agent-klz"
};
const deliveryEvent = {
  eventId: "delivery-klz-ot01926", eventType: "CONFIRMED_DELIVERY_RECORDED",
  trackingCode: "OT01926", agency: "KLZ", actorId: "agent-klz", actorName: "Maman Deborah",
  actorRole: "AGENT", occurredAt: "2026-10-26T21:14:35.000Z"
};

test("remise native OT01926 KLZ : événement et auteur physique exacts", () => {
  assert.deepEqual(confirmedDeliveryEvidence(deliveredParcel, deliveryEvent), {
    deliveredAt: "2026-10-26T21:14:35.000Z", deliveredByName: "Maman Deborah"
  });
  assert.deepEqual(confirmedDeliveryEvidence(deliveredParcel, { ...deliveryEvent, actorName: null }), {
    deliveredAt: "2026-10-26T21:14:35.000Z", deliveredByName: null
  });
  assert.deepEqual(confirmedDeliveryEvidence(deliveredParcel, { ...deliveryEvent, actorId: null }), {
    deliveredAt: "2026-10-26T21:14:35.000Z", deliveredByName: null
  });
  assert.deepEqual(confirmedDeliveryEvidence({ ...deliveredParcel, deliveredBy: null }, deliveryEvent), {
    deliveredAt: "2026-10-26T21:14:35.000Z", deliveredByName: "Maman Deborah"
  });
});

test("une remise non terminée, homonyme, événement contradictoire ou date ambiguë ne peut pas être affirmé", () => {
  assert.equal(confirmedDeliveryEvidence({ ...deliveredParcel, deliveryStatus: "AVAILABLE" }, deliveryEvent), null);
  assert.equal(confirmedDeliveryEvidence({ ...deliveredParcel, parcelId: "other", deliveredEventId: "other" }, deliveryEvent), null);
  assert.equal(confirmedDeliveryEvidence(deliveredParcel, { ...deliveryEvent, agency: "FIH" }), null);
  assert.equal(confirmedDeliveryEvidence(deliveredParcel, { ...deliveryEvent, trackingCode: "OT01926B" }), null);
  assert.equal(confirmedDeliveryEvidence(deliveredParcel, { ...deliveryEvent, actorId: "other-agent" }), null);
  assert.equal(confirmedDeliveryEvidence(deliveredParcel, { ...deliveryEvent, eventType: "SORTIE_POUR_ACHEMINEMENT" }), null);
  assert.equal(confirmedDeliveryEvidence(deliveredParcel, { ...deliveryEvent, occurredAt: "2026-10-26" }), null);
});

test("une remise forwarding exige le type d'événement correspondant", () => {
  const forwarded = { ...deliveredParcel, forwardingId: "forwarding-1" };
  assert.equal(confirmedDeliveryEvidence(forwarded, deliveryEvent), null);
  assert.ok(confirmedDeliveryEvidence(forwarded, { ...deliveryEvent, eventType: "SORTIE_APRES_REMISE_ACHEMINEMENT" }));
});

const cooPayment = {
  id: "COO:19", reference: "", paymentRequestId: "payment-coo-19", codeColis: "OT01926",
  destinationCode: "KLZ", agenceEncaissement: "COO", montantPaye: 11, soldeRestant: 0,
  dateTime: "2026-10-25T12:00:00.000Z"
};
const cooSnapshot = { checked: true, totalPaid: 11, references: ["COO:19"] };

test("la mention COO exige la référence P1 unique et le même code, destination et montant avant la remise", () => {
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [cooPayment], deliveredParcel, deliveryEvent.occurredAt), true);
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [{ ...cooPayment, id: "COO:20" }], deliveredParcel, deliveryEvent.occurredAt), false);
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [cooPayment, cooPayment], deliveredParcel, deliveryEvent.occurredAt), false);
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [{ ...cooPayment, destinationCode: "FIH" }], deliveredParcel, deliveryEvent.occurredAt), false);
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [{ ...cooPayment, codeColis: "OT01926B" }], deliveredParcel, deliveryEvent.occurredAt), false);
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [{ ...cooPayment, agenceEncaissement: "KLZ" }], deliveredParcel, deliveryEvent.occurredAt), false);
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [{ ...cooPayment, montantPaye: 12 }], deliveredParcel, deliveryEvent.occurredAt), false);
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [{ ...cooPayment, soldeRestant: 1 }], deliveredParcel, deliveryEvent.occurredAt), false);
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [{ ...cooPayment, dateTime: "2026-10-27T12:00:00.000Z" }], deliveredParcel, deliveryEvent.occurredAt), false);
  assert.equal(confirmedCooPaymentSnapshot(cooSnapshot, [cooPayment, { ...cooPayment, id: "COO:20" }], deliveredParcel, deliveryEvent.occurredAt), false);
  assert.equal(confirmedCooPaymentSnapshot({ ...cooSnapshot, references: ["COO:19", "COO:19"] }, [cooPayment], deliveredParcel, deliveryEvent.occurredAt), false);
});
