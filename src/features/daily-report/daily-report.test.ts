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
  const report = buildDailyAgencyReport({ agency: "COO", payments: [{ ...payment("Agent COO", 25), agenceEncaissement: "COO" }], expenses: [], storageEvents: [], cash: null });
  assert.equal(report.paymentsTotal, 25); assert.equal(report.cash, null);
});
