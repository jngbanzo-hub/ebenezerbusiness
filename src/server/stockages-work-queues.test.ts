import assert from "node:assert/strict";
import test from "node:test";

import type { AdminPayment, ManifestShipperRow } from "@/features/admin/types";
import { buildParcelWorkQueues, parseQueueFilters } from "./stockages-work-queues";

const manifest = (code: string, weight: number): ManifestShipperRow => ({ sourceSite: "LSHI", rowNumber: 2, dateRaw: "2026-08-01", codeColisRaw: code, expediteurRaw: "TEST", poidsRaw: weight });
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

test("livraison confirmée exclut le colis des prêts et conserve Agent/date/poids", () => {
  const [item] = buildParcelWorkQueues({ payments: [payment()], manifest: [manifest("TEST001", 2)], deliveries: [{ tracking_code: "TEST001", agency: "LSHI", business_date: "2026-08-01", occurred_at: "2026-08-01T12:00:00Z", actor_name: "Agent LSHI", weight_kg_delta: -2 }], agency: "LSHI", accountActive: true });
  assert.equal(item.deliveryStatus, "DELIVERED"); assert.equal(item.deliveredBy, "Agent LSHI"); assert.equal(item.businessDate, "2026-08-01"); assert.equal(item.canConfirmDelivery, false);
});

test("mauvaise agence absente et poids ambigu bloque la livraison", () => {
  const items = buildParcelWorkQueues({ payments: [payment(), payment({ id: "FIH:2", codeColis: "OTHER", destinationCode: "FIH" })], manifest: [manifest("TEST001", 2), { ...manifest("TEST001", 3), rowNumber: 3 }], deliveries: [], agency: "LSHI", accountActive: true });
  assert.equal(items.length, 1); assert.equal(items[0].weightState, "AMBIGUOUS"); assert.equal(items[0].canConfirmDelivery, false);
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
});
