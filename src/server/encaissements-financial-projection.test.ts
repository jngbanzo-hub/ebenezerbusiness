import assert from "node:assert/strict";
import test from "node:test";

import type { AdminPayment, ManifestShipperRow } from "@/features/admin/types";
import { buildEncaissementsFinancialProjection } from "./encaissements-financial-projection";

const manifest = (overrides: Partial<ManifestShipperRow> = {}): ManifestShipperRow => ({ sourceSite: "KLZ", rowNumber: 2, dateRaw: "2026-08-01", codeColisRaw: "JL100", expediteurRaw: "Confidentiel", poidsRaw: 2, montantAttenduRaw: 100, statutRaw: "ARRIVÉ", ...overrides });
const payment = (overrides: Partial<AdminPayment> = {}): AdminPayment => ({ id: "COO:2", dateTime: "2026-08-01T10:00:00Z", dateKey: "2026-08-01", codeColis: "JL100", poidsKg: 2, montantAttendu: 100, montantPaye: 40, soldeRestant: 60, agenceEncaissement: "COO", destinationCode: "KLZ", destination: "Kolwezi", statutPaiement: "PARTIELLEMENT PAYÉ", agent: "Agent COO", modePaiement: "ESPÈCES", reference: "REF", observation: "", paymentRequestId: "req-1", ...overrides });

test("montant canonique connu sans paiement produit un solde exact", () => {
  const projection = buildEncaissementsFinancialProjection({ trackingCode: "jl100", destination: "KLZ", manifestRows: [manifest()], payments: [] });
  assert.equal(projection.amountExpected, 100); assert.equal(projection.totalPaid, 0); assert.equal(projection.remainingBalance, 100); assert.equal(projection.collectionEligible, true);
});

test("paiements COO et destination sont agrégés sans doublon requestId", () => {
  const payments = [payment(), payment({ id: "COO:3" }), payment({ id: "KLZ:2", paymentRequestId: "req-2", agenceEncaissement: "KLZ", montantPaye: 60, soldeRestant: 0 })];
  const projection = buildEncaissementsFinancialProjection({ trackingCode: "JL100", destination: "KLZ", manifestRows: [manifest()], payments });
  assert.equal(projection.paymentCount, 2); assert.equal(projection.totalPaid, 100); assert.equal(projection.remainingBalance, 0); assert.deepEqual(projection.paymentSites.sort(), ["COO", "KLZ"]);
});

test("trop-perçu et divergence de destination sont bloquants", () => {
  const projection = buildEncaissementsFinancialProjection({ trackingCode: "JL100", destination: "KLZ", manifestRows: [manifest(), manifest({ sourceSite: "LSHI", rowNumber: 9 })], payments: [payment({ montantPaye: 120 })] });
  assert.equal(projection.financialState, "CONFLICT"); assert.equal(projection.remainingBalance, null); assert.ok(projection.anomalies.includes("PAYMENT_OVERPAID")); assert.ok(projection.anomalies.includes("DESTINATION_CONFLICT"));
});

test("la ligne source la plus récente est canonique mais une divergence reste visible", () => {
  const projection = buildEncaissementsFinancialProjection({ trackingCode: "JL100", destination: "KLZ", manifestRows: [manifest({ rowNumber: 2, montantAttenduRaw: 90 }), manifest({ rowNumber: 8, montantAttenduRaw: 100 })], payments: [] });
  assert.equal(projection.amountExpected, 100); assert.equal(projection.financialState, "CONFLICT"); assert.ok(projection.anomalies.includes("EXPECTED_AMOUNT_CONFLICT"));
});
