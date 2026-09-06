import assert from "node:assert/strict";
import test from "node:test";

import type { AdminExpense } from "../expenses";
import type { AdminPayment } from "../types";
import { adaptExpenses, adaptPayments, readBilanExpenses, readBilanPayments } from "./financial-readers";
import { createBilanGoogleSheetsRangeReader } from "./google-sheets-read-only";
import { adaptManifestParcelRows, adaptOfficialTransitRows, adaptShipmentRows, readBilanOfficialTransit, reconcileOfficialTransit } from "./manifest-readers";

test("lit FIH, LSHI et KLZ avec date, code, colonne E et montant attendu", () => {
  for (const agency of ["FIH", "LSHI", "KLZ"] as const) {
    const result = adaptManifestParcelRows([["01/08/2026", "AT12326B", "", "", "5 Kgs", "65"]], agency);
    assert.deepEqual(result.rows[0], { date: "2026-08-01", rawCode: "AT12326B", code: "AT12326B", weightKg: 5, expectedAmount: 65, agency, sourceSheet: agency, sourceRow: 2 });
  }
});

test("signale code et poids invalides sans corriger la source", () => {
  const result = adaptManifestParcelRows([["01/08/2026", "", "", "", "inconnu", ""]], "FIH");
  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.anomalies.map(({ code }) => code), ["CODE_ABSENT", "POIDS_INVALIDE"]);
});

test("lit EXPÉDITION et segmente ses groupages", () => {
  const result = adaptShipmentRows([["02/08/2026", "DHL", "LSHI", 2, 10, "GROUPAGE 1\nAT10126 : 4kgs\nGROUPAGE 2\nAT10226 : 6kgs"]]);
  assert.equal(result.rows[0].groups.length, 2);
  assert.deepEqual(result.rows[0].groups.map(({ parcels }) => parcels[0].weightKg), [4, 6]);
});

test("MANIFESTE PUBLIC conserve uniquement DHL + LSHI et le poids officiel colonne E", () => {
  const result = adaptOfficialTransitRows([
    ["01/08/2026", "DHL", "LSHI", 1, 775, "GROUPAGE 1 AT12326 : 775kgs"],
    ["01/08/2026", "DHL", "FIH", 1, 500, "GROUPAGE 2 AT2 : 500kgs"],
    ["01/08/2026", "ASKY", "LSHI", 1, 300, "GROUPAGE 3 AT3 : 300kgs"]
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].officialWeightKg, 775);
  assert.deepEqual(result.rows[0].groupIdentifiers, ["GROUPAGE 1"]);
});

test("rapproche 23/23 lignes août DHL LSHI sans ambiguïté", () => {
  const raw = Array.from({ length: 23 }, (_, index) => ["01/08/2026", "DHL", "LSHI", 1, index + 1, `GROUPAGE ${index + 1}\nAT${100 + index}26 : ${index + 1}kgs`]);
  const official = adaptOfficialTransitRows(raw).rows;
  const shipments = adaptShipmentRows(raw).rows;
  const reconciliation = reconcileOfficialTransit(official, shipments);
  assert.equal(reconciliation.matches.length, 23);
  assert.equal(reconciliation.ambiguous.length, 0);
  assert.equal(reconciliation.missing.length, 0);
});

test("conserve paymentRequestId et la référence d’audit Encaissements", () => {
  const result = adaptPayments([payment()]);
  assert.equal(result.rows[0].paymentRequestId, "request-1");
  assert.equal(result.rows[0].sourceReference, "LSHI:2");
});

test("refuse un paiement sans identité complète", () => {
  const result = adaptPayments([payment({ paymentRequestId: undefined })]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.anomalies[0].code, "PAIEMENT_SANS_IDENTITE");
});

test("conserve TF Bénin et Expédition KLZ sans leur attribuer une sémantique", () => {
  const result = adaptExpenses([expense({ categorie: "TF Bénin" }), expense({ id: "expense-2", categorie: "Expédition KLZ" })]);
  assert.deepEqual(result.rows.map(({ category }) => category), ["TF Bénin", "Expédition KLZ"]);
});

test("signale une devise absente", () => {
  const result = adaptExpenses([expense({ devise: "" as AdminExpense["devise"] })]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.anomalies[0].code, "DEVISE_ABSENTE");
});

test("signale les sources indisponibles sans mutation ni correction", async () => {
  assert.equal((await readBilanPayments(async () => { throw new Error("offline"); })).anomalies[0].code, "SOURCE_INDISPONIBLE");
  assert.equal((await readBilanExpenses(async () => { throw new Error("offline"); })).anomalies[0].code, "SOURCE_INDISPONIBLE");
  const source = { mode: "READ_ONLY" as const, read: async () => { throw new Error("offline"); } };
  assert.equal((await readBilanOfficialTransit(source)).anomalies[0].code, "SOURCE_INDISPONIBLE");
});

test("le lecteur Google n'expose qu'une lecture GET no-store", async () => {
  let init: RequestInit | undefined;
  const reader = createBilanGoogleSheetsRangeReader({
    spreadsheetIds: { MANIFESTE_EXPEDITION_COO: "coo", MANIFESTE_PUBLIC: "public" },
    getAccessToken: async () => "token",
    fetcher: async (_url, requestInit) => { init = requestInit; return new Response(JSON.stringify({ values: [[1]] }), { status: 200 }); }
  });
  assert.equal(reader.mode, "READ_ONLY");
  assert.equal("write" in reader, false);
  assert.deepEqual(await reader.read({ spreadsheet: "MANIFESTE_PUBLIC", range: "A1:E2" }), [[1]]);
  assert.equal(init?.method, "GET");
  assert.equal(init?.cache, "no-store");
});

function payment(overrides: Partial<AdminPayment> = {}): AdminPayment {
  return { id: "LSHI:2", dateTime: "2026-08-01T00:00:00.000Z", dateKey: "2026-08-01", codeColis: "AT12326", poidsKg: 5, montantAttendu: 65, montantPaye: 65, soldeRestant: 0, agenceEncaissement: "LSHI", destinationCode: "LSHI", destination: "Lubumbashi", statutPaiement: "PAYÉ", agent: "Agent", modePaiement: "CASH", reference: "REF", observation: "", paymentRequestId: "request-1", ...overrides };
}

function expense(overrides: Partial<AdminExpense> = {}): AdminExpense {
  return { id: "expense-1", expenseRequestId: "request-1", date: "2026-08-01", dateHeure: "2026-08-01T00:00:00Z", agence: "FIH", categorie: "Déclarant", montant: 40, devise: "USD", description: "Description", observation: "", agent: "Agent", statut: "ACTIVE", reference: "REF", dateCreation: "2026-08-01", dateMiseAJour: "2026-08-01", annulee: false, corrigee: false, ...overrides };
}
