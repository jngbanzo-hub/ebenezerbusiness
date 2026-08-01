import assert from "node:assert/strict";
import test from "node:test";

import type { AdminPayment, ManifestShipperRow } from "@/features/admin/types";
import { buildParcelWorkQueueAudit, buildParcelWorkQueues, parseQueueFilters } from "./stockages-work-queues";

const manifest = (code: string, weight: number): ManifestShipperRow => ({ sourceSite: "LSHI", rowNumber: 2, dateRaw: "2026-08-01", codeColisRaw: code, expediteurRaw: "TEST", poidsRaw: weight, montantAttenduRaw: 100, statutRaw: "ARRIVÉ" });
const payment = (overrides: Partial<AdminPayment> = {}): AdminPayment => ({ id: "COO:2", dateTime: "2026-08-01T10:00:00.000Z", dateKey: "2026-08-01", codeColis: "TEST001", poidsKg: 2, montantAttendu: 100, montantPaye: 100, soldeRestant: 0, agenceEncaissement: "COO", destinationCode: "LSHI", destination: "Lubumbashi", statutPaiement: "SOLDE", agent: "Agent COO", modePaiement: "ESPECES", reference: "REF", observation: "", ...overrides });

test("paiement intégral COO produit un colis prêt sans sortie automatique", () => {
  const [item] = buildParcelWorkQueues({ payments: [payment()], manifest: [manifest("TEST001", 2)], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(item.deliveryStatus, "READY");
  assert.equal(item.canConfirmDelivery, true);
  assert.match(item.paymentLabel, /COO/);
});

test("paiement total réparti entre deux sites reste un seul colis prêt", () => {
  const rows = [payment({ montantPaye: 60, soldeRestant: 40 }), payment({ id: "LSHI:2", agenceEncaissement: "LSHI", montantPaye: 40, soldeRestant: 0, dateTime: "2026-08-01T11:00:00.000Z" })];
  const [item] = buildParcelWorkQueues({ payments: rows, manifest: [manifest("TEST001", 2)], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(item.amountPaid, 100); assert.equal(item.remainingBalance, 0); assert.deepEqual(item.paymentSites.sort(), ["COO", "LSHI"]);
});

test("paiement partiel reste dans la file solde restant", () => {
  const [item] = buildParcelWorkQueues({ payments: [payment({ montantPaye: 35, soldeRestant: 65, statutPaiement: "PARTIELLEMENT PAYE" })], manifest: [manifest("TEST001", 2)], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(item.deliveryStatus, "PAYMENT_PENDING"); assert.equal(item.remainingBalance, 65); assert.equal(item.canConfirmDelivery, false);
});

test("absence de paiement et de montant attendu exige une vérification sans faux solde", () => {
  const [item] = buildParcelWorkQueues({ payments: [], manifest: [{ ...manifest("TEST001", 2), montantAttenduRaw: "" }], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(item.deliveryStatus, "VERIFICATION_REQUIRED");
  assert.equal(item.amountExpected, null);
  assert.equal(item.remainingBalance, null);
  assert.equal(item.financialState, "INCOMPLETE");
  assert.match(item.paymentLabel, /Vérification nécessaire/);
});

test("montants attendus divergents bloquent l'encaissement et la remise", () => {
  const rows = [payment({ montantPaye: 20, soldeRestant: 80 }), payment({ id: "LSHI:2", agenceEncaissement: "LSHI", montantAttendu: 120, montantPaye: 20, soldeRestant: 80 })];
  const [item] = buildParcelWorkQueues({ payments: rows, manifest: [manifest("TEST001", 2)], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(item.deliveryStatus, "VERIFICATION_REQUIRED");
  assert.equal(item.financialState, "CONFLICT");
  assert.equal(item.remainingBalance, null);
  assert.ok(item.anomalies.includes("PAYMENT_EXPECTED_AMOUNT_CONFLICT"));
});

test("même code dans deux destinations reste scoped par le couple destination/code Encaissements", () => {
  const rows = [manifest("TEST001", 2), { ...manifest("TEST001", 2), sourceSite: "KLZ" as const, rowNumber: 8 }];
  const [item] = buildParcelWorkQueues({ payments: [payment()], manifest: rows, deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(item.trackingCode, "TEST001");
  assert.equal(item.weightState, "VALID");
  assert.doesNotMatch(item.anomalies.join(","), /DESTINATION_CONFLICT|WEIGHT_CONFLICT/);
  assert.equal(item.canConfirmDelivery, true);
});

test("livraison confirmée exclut le colis des prêts et conserve Agent/date/poids", () => {
  const [item] = buildParcelWorkQueues({ payments: [payment()], manifest: [manifest("TEST001", 2)], deliveries: [{ tracking_code: "TEST001", agency: "LSHI", business_date: "2026-08-01", occurred_at: "2026-08-01T12:00:00Z", actor_name: "Agent LSHI", weight_kg_delta: -2 }], agency: "LSHI", accountActive: true });
  assert.equal(item.deliveryStatus, "DELIVERED"); assert.equal(item.deliveredBy, "Agent LSHI"); assert.equal(item.businessDate, "2026-08-01"); assert.equal(item.canConfirmDelivery, false);
});

test("mauvaise agence absente et poids ambigu bloque la livraison", () => {
  const items = buildParcelWorkQueues({ payments: [payment(), payment({ id: "FIH:2", codeColis: "OTHER", destinationCode: "FIH" })], manifest: [manifest("TEST001", 2), { ...manifest("TEST001", 3), rowNumber: 3 }], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(items.length, 1); assert.equal(items[0].weightState, "AMBIGUOUS"); assert.equal(items[0].deliveryStatus, "VERIFICATION_REQUIRED"); assert.equal(items[0].canConfirmDelivery, false);
});

test("poids absent classe toujours le colis en vérification", () => {
  const [item] = buildParcelWorkQueues({ payments: [payment()], manifest: [{ ...manifest("TEST001", 2), poidsRaw: "" }], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(item.weightState, "MISSING"); assert.equal(item.deliveryStatus, "VERIFICATION_REQUIRED"); assert.equal(item.canConfirmDelivery, false);
});

test("statut annulé est exclu de la file Agent et reste visible dans l’audit Admin", () => {
  const result = buildParcelWorkQueueAudit({ payments: [payment()], manifest: [{ ...manifest("TEST001", 2), statutRaw: "ANNULÉ" }], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(result.items.length, 0); assert.equal(result.audit.excludedHistorical, 1); assert.equal(result.audit.exclusions[0]?.reason, "EXCLUDED_HISTORICAL");
});

test("statut LIVRÉ historique sans événement V2 est exclu de la file active", () => {
  const result = buildParcelWorkQueueAudit({ payments: [], manifest: [{ ...manifest("TEST001", 2), montantAttenduRaw: "100 $", statutRaw: "LIVRÉ" }], deliveries: [], agency: "LSHI", accountActive: false });
  assert.equal(result.items.length, 0); assert.equal(result.audit.excludedHistorical, 1);
});

test("un paiement ciblant l’agence sans colis dans sa feuille canonique exclut l’autre agence", () => {
  const result = buildParcelWorkQueueAudit({ payments: [payment()], manifest: [{ ...manifest("TEST001", 2), sourceSite: "FIH" }], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(result.items.length, 0); assert.equal(result.audit.excludedWrongAgency, 1); assert.equal(result.audit.exclusions[0]?.reason, "EXCLUDED_WRONG_AGENCY");
});

test("doublon strict est dédupliqué et doublon divergent reste en vérification", () => {
  const strict = buildParcelWorkQueueAudit({ payments: [], manifest: [manifest("STRICT1", 2), { ...manifest("STRICT1", 2), rowNumber: 3 }], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(strict.items.length, 1); assert.equal(strict.audit.strictDuplicateCodes, 1);
  const divergent = buildParcelWorkQueueAudit({ payments: [], manifest: [manifest("DIVERGE1", 2), { ...manifest("DIVERGE1", 3), rowNumber: 3 }], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(divergent.items[0]?.deliveryStatus, "VERIFICATION_REQUIRED"); assert.equal(divergent.audit.divergentDuplicateCodes, 1);
});

test("compte SUSPENDED laisse les listes lisibles mais bloque la remise", () => {
  const [item] = buildParcelWorkQueues({ payments: [payment()], manifest: [manifest("TEST001", 2)], deliveries: [], agency: "LSHI", accountActive: false });
  assert.equal(item.deliveryStatus, "READY"); assert.equal(item.canConfirmDelivery, false);
});

test("filtres et pagination sont bornés côté serveur", () => {
  const filters = parseQueueFilters(new URL("https://example.test?section=READY&page=2&pageSize=12&paymentSite=COO"));
  assert.equal(filters.page, 2); assert.equal(filters.pageSize, 12); assert.equal(filters.paymentSite, "COO");
  assert.throws(() => parseQueueFilters(new URL("https://example.test?section=READY&pageSize=500")), /INVALID_PAGINATION/);
  assert.throws(() => parseQueueFilters(new URL("https://example.test?section=UNKNOWN")), /INVALID_QUEUE_SECTION/);
  assert.equal(parseQueueFilters(new URL("https://example.test?section=VERIFICATION")).section, "VERIFICATION");
});
