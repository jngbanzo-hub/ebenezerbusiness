import assert from "node:assert/strict";
import test from "node:test";

import { buildCooReport } from "./coo-report.ts";

const payment = (overrides = {}) => ({
  id: "COO:2", dateTime: "2026-08-08T09:00:00+01:00", dateKey: "2026-08-08",
  codeColis: "JL100", poidsKg: 2, montantAttendu: 20, montantPaye: 10,
  soldeRestant: 10, agenceEncaissement: "COO", destinationCode: "KLZ",
  destination: "Kolwezi", statutPaiement: "PARTIELLEMENT PAYÉ", agent: "Agent COO",
  modePaiement: "ESPECES", reference: "REF", observation: "", ...overrides
});

const expense = (overrides = {}) => ({
  id: "123e4567-e89b-42d3-a456-426614174000", expenseRequestId: "123e4567-e89b-42d3-a456-426614174001",
  date: "2026-08-08", dateHeure: "2026-08-08T10:00:00+01:00", agence: "COO",
  categorie: "Transport local", montant: 15, devise: "USD", description: "Taxi agence",
  observation: "Justificatif A", agent: "Agent COO", statut: "ACTIVE", reference: "DEP-1",
  dateCreation: "2026-08-08T10:00:00+01:00", dateMiseAJour: "2026-08-08T10:00:00+01:00",
  annulee: false, corrigee: false, ...overrides
});

test("limite strictement le rapport aux données COO et à la période inclusive", () => {
  const report = buildCooReport({
    from: "2026-08-08", to: "2026-08-08",
    payments: [payment(), payment({ id: "FIH:2", agenceEncaissement: "FIH" }), payment({ id: "COO:3", dateKey: "2026-08-07" })],
    expenses: [expense(), expense({ id: "223e4567-e89b-42d3-a456-426614174000", agence: "FIH" }), expense({ id: "323e4567-e89b-42d3-a456-426614174000", annulee: true })]
  });
  assert.equal(report.readOnly, true);
  assert.equal(report.payments.length, 1);
  assert.equal(report.expenses.length, 1);
  assert.equal(report.summary.paymentsTotalUsd, 10);
  assert.deepEqual(report.summary.expensesByCurrency, { USD: 15 });
});

test("filtre le code et le libellé sans tenir compte de la casse, des accents ou des espaces", () => {
  const report = buildCooReport({
    from: "2026-08-01", to: "2026-08-31", code: "  jl 100 ", label: "  transpôrt   local ",
    payments: [payment({ codeColis: "JL 100" }), payment({ id: "COO:4", codeColis: "AUTRE" })],
    expenses: [expense(), expense({ id: "423e4567-e89b-42d3-a456-426614174000", categorie: "Communication" })]
  });
  assert.deepEqual(report.payments.map((row) => row.codeColis), ["JL 100"]);
  assert.deepEqual(report.expenses.map((row) => row.categorie), ["Transport local"]);
});

test("conserve séparément les totaux de dépenses par devise et ne crée aucune Caisse COO", () => {
  const report = buildCooReport({
    from: "2026-08-08", to: "2026-08-08", payments: [],
    expenses: [expense(), expense({ id: "523e4567-e89b-42d3-a456-426614174000", devise: "FCFA", montant: 5000 })]
  });
  assert.deepEqual(report.summary.expensesByCurrency, { USD: 15, FCFA: 5000 });
  assert.equal("cash" in report, false);
});
