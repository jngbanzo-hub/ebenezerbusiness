import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyAgencyReport } from "./daily-report";

const payment = (agent: string, amount: number, mode = "ESPÈCES") => ({ id: `${agent}-${amount}`, dateTime: "2026-08-08T10:00:00Z", dateKey: "2026-08-08", codeColis: `P-${agent}-${amount}`, poidsKg: 1, montantAttendu: amount, montantPaye: amount, soldeRestant: 0, agenceEncaissement: "KLZ" as const, destinationCode: "KLZ" as const, destination: "Kolwezi", statutPaiement: "PAYÉ", agent, modePaiement: mode, reference: "", observation: "" });
const expenses = [{ id: "11111111-1111-4111-8111-111111111111", expenseRequestId: "22222222-2222-4222-8222-222222222222", date: "2026-08-08", dateHeure: "2026-08-08T11:00:00Z", agence: "KLZ" as const, categorie: "Transport", montant: 10, devise: "USD" as const, description: "Taxi", observation: "", agent: "Agent A", statut: "ACTIVE" as const, reference: "D1", dateCreation: "2026-08-08T11:00:00Z", dateMiseAJour: "2026-08-08T11:00:00Z", annulee: false, corrigee: false }];

test("consolide plusieurs Agents dans une seule agence", () => {
  const report = buildDailyAgencyReport({ agency: "KLZ", payments: [payment("Agent A", 20), payment("Agent A", 30), payment("Agent B", 40, "MOBILE")], expenses, storageEvents: [], cash: { status: "ACTIVE", openingBalance: 472, paymentsTotal: 90, expensesTotal: 10, correctionsNet: 0, currentBalance: 552 } });
  assert.equal(report.paymentCount, 3); assert.equal(report.paymentsTotal, 90); assert.equal(report.byAgent.length, 2); assert.equal(report.byAgent[0].count, 2); assert.equal(report.byAgent[0].amount, 50); assert.equal(report.expenseCount, 1); assert.equal(report.cash?.currentBalance, 552);
});

test("détaille chaque code arrivé et sorti depuis Stockage V2", () => {
  const report = buildDailyAgencyReport({ agency: "KLZ", payments: [], expenses: [], cash: null, storageEvents: [
    { agency: "KLZ", event_type: "MANUAL_ARRIVAL_RECORDED", actor_name: "Agent A", occurred_at: "2026-08-08T08:00:00Z", metadata: { parcels: [{ trackingCode: "AB1", weightKg: 4 }, { trackingCode: "CD2", weightKg: 7 }] } },
    { agency: "KLZ", event_type: "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", tracking_code: "JL1", weight_kg_delta: -3.5, actor_name: "Agent B", occurred_at: "2026-08-08T09:00:00Z" }
  ] });
  assert.deepEqual(report.arrivals.map((row) => row.code), ["AB1", "CD2"]); assert.equal(report.arrivalCount, 2); assert.equal(report.arrivalWeightKg, 11); assert.equal(report.departureCount, 1); assert.equal(report.departureWeightKg, 3.5);
});

test("COO reste hors caisse", () => {
  const report = buildDailyAgencyReport({ agency: "COO", payments: [{ ...payment("Agent COO", 25), agenceEncaissement: "COO" }], expenses: [], storageEvents: [], cash: null, storage: { openingParcels: 1, openingWeightKg: 2, arrivalsParcels: 0, arrivalsWeightKg: 0, departuresParcels: 0, departuresWeightKg: 0, closingParcels: 1, closingWeightKg: 2 } });
  assert.equal(report.paymentsTotal, 25); assert.equal(report.cash, null); assert.equal(report.storage, null);
});

test("expose le report mensuel Stockage sans altérer les détails", () => {
  const storage = { openingParcels: 90, openingWeightKg: 349, arrivalsParcels: 10, arrivalsWeightKg: 50, departuresParcels: 4, departuresWeightKg: 20, closingParcels: 96, closingWeightKg: 379 };
  const report = buildDailyAgencyReport({ agency: "FIH", payments: [], expenses: [], storageEvents: [], cash: null, storage });
  assert.deepEqual(report.storage, storage);
});

test("conserve le code natif et enrichit uniquement une identité forwarding complète", () => {
  const events = [
    { agency: "LSHI", event_type: "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", tracking_code: "AT02326", weight_kg_delta: -5, actor_name: "Agent", occurred_at: "2026-09-01T20:00:00Z" },
    { agency: "LSHI", event_type: "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", tracking_code: "AT02326", weight_kg_delta: -9, actor_name: "Agent", occurred_at: "2026-09-01T22:02:00Z", forwarding_identity: { forwardingId: "f259103f-1e58-4fc8-bcda-e10d5fec7328", trackingCode: "AT02326", originAgency: "KLZ", destinationAgency: "LSHI" } }
  ];
  const report = buildDailyAgencyReport({ agency: "LSHI", payments: [], expenses: [], storageEvents: events, cash: null });
  assert.deepEqual(report.departures.map((row) => row.code), ["AT02326", "AT02326 · KLZ-LSHI"]);
  assert.equal(report.departureCount, 2);
  assert.equal(report.departureWeightKg, 14);
});

test("formate les six trajets forwarding depuis leur identité canonique", () => {
  const routes = [["KLZ", "LSHI"], ["KLZ", "FIH"], ["LSHI", "KLZ"], ["LSHI", "FIH"], ["FIH", "LSHI"], ["FIH", "KLZ"]] as const;
  for (const [originAgency, destinationAgency] of routes) {
    const report = buildDailyAgencyReport({ agency: destinationAgency, payments: [], expenses: [], cash: null, storageEvents: [{ agency: destinationAgency, event_type: "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", tracking_code: "CODE1", weight_kg_delta: -4, actor_name: "Agent", occurred_at: "2026-09-01T22:02:00Z", forwarding_identity: { forwardingId: `${originAgency}-${destinationAgency}-identity`, trackingCode: "CODE1", originAgency, destinationAgency } }] });
    assert.equal(report.departures[0]?.code, `CODE1 · ${originAgency}-${destinationAgency}`);
    assert.equal(report.departureCount, 1);
    assert.equal(report.departureWeightKg, 4);
  }
});

test("une identité forwarding absente ou incomplète n'invente jamais un trajet", () => {
  const report = buildDailyAgencyReport({ agency: "FIH", payments: [], expenses: [], cash: null, storageEvents: [
    { agency: "FIH", event_type: "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", tracking_code: "NATIVE1", weight_kg_delta: -2 },
    { agency: "FIH", event_type: "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", tracking_code: "SAFE1", weight_kg_delta: -3, forwarding_identity: { forwardingId: "forwarding", trackingCode: "SAFE1", originAgency: "KLZ" } }
  ] });
  assert.deepEqual(report.departures.map((row) => row.code), ["NATIVE1", "SAFE1"]);
  assert.equal(report.departureCount, 2);
  assert.equal(report.departureWeightKg, 5);
});
