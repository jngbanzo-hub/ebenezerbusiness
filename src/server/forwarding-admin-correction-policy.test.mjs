import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./forwarding-admin-correction-policy.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { correctionBlockers } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

const ready = {
  forwardingId: "forwarding-test", parcelId: "parcel-test", trackingCode: "TEST04426",
  originAgency: "KLZ", destinationAgency: "LSHI", weightKg: 3,
  forwardingStatus: "ARRIVAL_CONFIRMED", forwardingAmountPaid: 0,
  forwardingCashEventId: null, forwardingDeliveryEventId: null,
  parcelAgency: "LSHI", parcelTrackingCode: "TEST04426", parcelForwardingId: "forwarding-test",
  parcelWeightKg: 3, parcelStatus: "AVAILABLE", originAccountActive: true,
  destinationAccountActive: true, originNativeIdentityCount: 0,
  relatedPaymentCount: 0, relatedCashEventCount: 0, laterPhysicalOperationCount: 0,
  relatedCorrectionCount: 0, originArrivalEvidenceCount: 1, forwardingDepartureCount: 1,
  forwardingArrivalCount: 1, forwardingOrchestrationCount: 1,
  financialProof: "VERIFIED", historicalExpectedUsd: 33,
  historicalPaidUsd: 0, currentNativeExpectedUsd: 33
};

test("une correction d'acheminement exact et financièrement vérifiée est admissible", () => {
  assert.deepEqual(correctionBlockers(ready), []);
});

test("mêmes garde-fous pour les trois agences, sans code ni trajet privilégié", () => {
  for (const [originAgency, destinationAgency] of [["FIH", "LSHI"], ["LSHI", "KLZ"], ["KLZ", "FIH"]]) {
    assert.deepEqual(correctionBlockers({ ...ready, originAgency, destinationAgency,
      parcelAgency: destinationAgency, trackingCode: "EXACT126", parcelTrackingCode: "EXACT126" }), []);
  }
});

test("une identité de colis, un cycle ou une agence contradictoire est refusé", () => {
  for (const patch of [
    { parcelId: "" }, { parcelAgency: "FIH" }, { parcelTrackingCode: "TEST04426B" },
    { parcelForwardingId: "autre" }, { parcelWeightKg: 4 }, { parcelStatus: "DELIVERED" },
    { originAgency: "LSHI" }
  ]) assert.ok(correctionBlockers({ ...ready, ...patch }).includes("PARCEL_IDENTITY_MISMATCH"));
});

test("paiement, Caisse, livraison ou action physique ultérieure bloquent", () => {
  for (const patch of [
    { forwardingAmountPaid: 1 }, { forwardingCashEventId: "cash" },
    { forwardingDeliveryEventId: "delivery" }, { relatedPaymentCount: 1 },
    { relatedCashEventCount: 1 }, { laterPhysicalOperationCount: 1 }
  ]) assert.notDeepEqual(correctionBlockers({ ...ready, ...patch }), []);
});

test("aucun prix n'est inventé et un tarif natif contradictoire bloque", () => {
  assert.ok(correctionBlockers({ ...ready, financialProof: "UNAVAILABLE", historicalExpectedUsd: null }).includes("HISTORICAL_TERMS_UNVERIFIED"));
  assert.ok(correctionBlockers({ ...ready, financialProof: "AMBIGUOUS" }).includes("HISTORICAL_TERMS_UNVERIFIED"));
  assert.ok(correctionBlockers({ ...ready, currentNativeExpectedUsd: 36 }).includes("NATIVE_PRICE_RULE_CONFLICT"));
});

test("une correction répétée ou une identité native d'origine existante bloque", () => {
  assert.ok(correctionBlockers({ ...ready, relatedCorrectionCount: 1 }).includes("CORRECTION_ALREADY_RECORDED"));
  assert.ok(correctionBlockers({ ...ready, originNativeIdentityCount: 1 }).includes("ORIGIN_IDENTITY_COLLISION"));
});

test("la chaîne unique arrivée initiale → départ → arrivée → orchestration est obligatoire", () => {
  for (const field of ["originArrivalEvidenceCount", "forwardingDepartureCount", "forwardingArrivalCount", "forwardingOrchestrationCount"]) {
    assert.ok(correctionBlockers({ ...ready, [field]: 0 }).includes("HISTORICAL_CYCLE_UNVERIFIED"));
    assert.ok(correctionBlockers({ ...ready, [field]: 2 }).includes("HISTORICAL_CYCLE_UNVERIFIED"));
  }
});
