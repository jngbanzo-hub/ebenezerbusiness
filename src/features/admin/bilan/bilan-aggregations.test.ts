import assert from "node:assert/strict";
import test from "node:test";

import { aggregateCohortActivity } from "./activity-aggregations";
import type { CohortDirectCost } from "./bilan-aggregation-contracts";
import type { BilanExpense, BilanManifestParcel, BilanPayment, BilanShipment } from "./bilan-readers-contracts";
import { calculateDirectMargin, aggregatePeriodExpenses, resultOperationalPeriodUsd } from "./expense-aggregations";
import { adaptOfficialTransitRows, adaptShipmentRows, reconcileOfficialTransit } from "./manifest-readers";
import { aggregateCohortPayments, aggregatePeriodReceiptsUsd } from "./payment-aggregations";
import { aggregateReadAnomalies } from "./quality-aggregations";
import { aggregateCohortShipment, calculateDeclarantDirectCosts, calculateLshiDhlDeclarantDirectCosts, calculateTransitDirectCosts, summarizeOfficialTransit } from "./shipment-aggregations";

const august = { from: "2026-08-01", to: "2026-08-31" };

test("sépare poids daté de période et poids de cohorte", () => {
  const result = aggregateCohortActivity([
    manifest("AT10026", 7892, "LSHI", "2026-08-01"),
    manifest("JL10026", 1, "FIH", "2026-08-02")
  ], "2026-08", august);
  assert.equal(result.periodWeightKg, 7893);
  assert.equal(result.cohortWeightKg, 7892);
  assert.equal(result.scopeDifferenceKg, 1);
});

test("respecte la priorité KLZ et compte occurrence et identité certifiée séparément", () => {
  const result = aggregateCohortActivity([
    manifest("AT10026KLZ", 5, "LSHI"), manifest("AT10026KLZ", 5, "LSHI")
  ], "2026-08", august);
  assert.equal(result.agencies.KLZ.occurrences, 2);
  assert.equal(result.agencies.KLZ.certifiedUniqueIdentities, 1);
  assert.equal(result.agencies.KLZ.cohortWeightKg, 5);
});

test("exclut du poids certifié une identité à poids divergent", () => {
  const result = aggregateCohortActivity([manifest("AT10026", 5), manifest("AT10026", 6)], "2026-08", august);
  assert.equal(result.cohortWeightKg, 0);
  assert.equal(result.anomalies[0].type, "POIDS_DIVERGENT");
});

test("un code de cohorte expédié le mois suivant reste dans sa cohorte", () => {
  const shipments = shipmentRows([["01/09/2026", "DHL", "LSHI", 1, 5, "GROUPAGE 1\nAT10026 : 5kgs"]]);
  const result = aggregateCohortShipment(shipments, "2026-08", 10);
  assert.equal(result.certifiedShippedWeightKg, 5);
  assert.equal(result.remainingWeightKg, 5);
});

test("conserve un même code dans deux groupages et déduplique seulement dans chaque bloc", () => {
  const shipments = shipmentRows([["01/09/2026", "DHL", "LSHI", 2, 15, "GROUPAGE 1\nAT10026 : 5kgs\nAT10026 : 5kgs\nGROUPAGE 2\nAT10026 : 5kgs"]]);
  const result = aggregateCohortShipment(shipments, "2026-08", 10);
  assert.equal(result.certifiedShippedWeightKg, 10);
  assert.equal(result.anomalies[0].type, "IDENTITE_CONFLICTUELLE");
});

test("rattache un paiement reçu le mois suivant à la cohorte du code", () => {
  const result = aggregateCohortPayments([payment({ paymentDate: "2026-09-03T00:00:00Z" })], "2026-08");
  assert.equal(result.receivedAmount, 50);
  assert.equal(result.paymentCount, 1);
  assert.equal(result.historicalRevenueStatus, "NON CERTIFIÉ");
});

test("compte paiements partiels/complets et déduplique par paymentRequestId", () => {
  const rows = [payment({ paidAmount: 50, expectedAmount: 100, status: "PARTIEL" }), payment({ sourceReference: "LSHI:3" }), payment({ paymentRequestId: "req-2", sourceReference: "LSHI:4", paidAmount: 100 })];
  const result = aggregateCohortPayments(rows, "2026-08");
  assert.equal(result.paymentCount, 2);
  assert.equal(result.partialPayments, 1);
  assert.equal(result.completePayments, 1);
  assert.equal(result.collectionRate, 75);
});

test("un paiement sans cohorte est non rapproché", () => {
  const result = aggregateCohortPayments([payment({ code: "XX10026" })], "2026-08");
  assert.equal(result.unmatchedPayments, 1);
  assert.equal(result.anomalies[0].type, "PAIEMENT_NON_RAPPROCHE");
});

test("paiements de période restent basés sur la date de réception", () => {
  assert.equal(aggregatePeriodReceiptsUsd([payment(), payment({ paymentRequestId: "req-2", paymentDate: "2026-09-01" })], august), 50);
});

test("Déclarant LSHI 58 et FIH standard 40 sont ventilés sans perte de centime", () => {
  const lshi = calculateDeclarantDirectCosts(shipmentRows([["01/08/2026", "ASKY", "LSHI", 1, 3, "GROUPAGE 1\nJL10026 : 1kgs\nAT10026 : 2kgs"]]));
  const fih = calculateDeclarantDirectCosts(shipmentRows([["01/08/2026", "ASKY", "FIH", 1, 3, "GROUPAGE 2\nJL10026 : 1kgs\nAT10026 : 2kgs"]]));
  assert.equal(sumCents(lshi), 5800);
  assert.equal(sumCents(fih), 4000);
});

test("Déclarant FIH DHL applique uniquement 2,8 USD/kg", () => {
  const costs = calculateDeclarantDirectCosts(shipmentRows([["01/08/2026", "DHL", "FIH", 1, 10, "GROUPAGE 1\nAT10026 : 10kgs"]]));
  assert.equal(costs.length, 1);
  assert.equal(costs[0].kind, "DECLARANT_FIH_DHL_WEIGHT");
  assert.equal(costs[0].amountCents, 2800);
});

test("DHL LSHI applique Déclarant 2,8/kg et Transit 1,7/kg comme deux charges distinctes", () => {
  const raw = Array.from({ length: 23 }, (_, index) => ["01/08/2026", "DHL", "LSHI", 1, index === 22 ? 27 : 34, `GROUPAGE ${index + 1}\nAT${100 + index}26 : ${index === 22 ? 27 : 34}kgs`]);
  const matches = reconcileOfficialTransit(adaptOfficialTransitRows(raw).rows, shipmentRows(raw)).matches;
  const standard = calculateDeclarantDirectCosts(shipmentRows(raw));
  const declarant = calculateLshiDhlDeclarantDirectCosts(matches);
  const transit = calculateTransitDirectCosts(matches);
  assert.equal(standard.filter(({ kind }) => kind === "DECLARANT_LSHI_GROUP").length, 0);
  assert.equal(declarant.every(({ kind }) => kind === "DECLARANT_LSHI_DHL_WEIGHT"), true);
  assert.equal(transit.every(({ kind }) => kind === "TRANSIT_FIH_LSHI"), true);
  assert.equal(sumCents(declarant), 217000);
  assert.equal(sumCents(transit), 131750);
  assert.equal(sumCents([...declarant, ...transit]), 348750);
});

test("DHL LSHI multi-cohorte ventile chacun des deux totaux officiels sans perte", () => {
  const raw = [["01/08/2026", "DHL", "LSHI", 1, 10, "GROUPAGE 1\nJL10026 : 1kgs\nAT10026 : 2kgs"]];
  const matches = reconcileOfficialTransit(adaptOfficialTransitRows(raw).rows, shipmentRows(raw)).matches;
  const declarant = calculateLshiDhlDeclarantDirectCosts(matches);
  const transit = calculateTransitDirectCosts(matches);
  assert.deepEqual(declarant.map(({ amountCents }) => amountCents), [933, 1867]);
  assert.deepEqual(transit.map(({ amountCents }) => amountCents), [567, 1133]);
  assert.equal(sumCents(declarant), 2800);
  assert.equal(sumCents(transit), 1700);
});

test("référence août : transit 23 expéditions, 775 kg, 1 317,50 USD, 100 % AT", () => {
  const raw = Array.from({ length: 23 }, (_, index) => ["01/08/2026", "DHL", "LSHI", 1, index === 22 ? 27 : 34, `GROUPAGE ${index + 1}\nAT${100 + index}26 : ${index === 22 ? 27 : 34}kgs`]);
  const official = adaptOfficialTransitRows(raw).rows;
  const shipments = shipmentRows(raw);
  const summary = summarizeOfficialTransit(official);
  assert.deepEqual(summary, { shipments: 23, officialWeightKg: 775, amountUsd: 1317.5 });
  const costs = calculateTransitDirectCosts(reconcileOfficialTransit(official, shipments).matches);
  assert.equal(costs.every(({ cohortId }) => cohortId === "2026-08"), true);
  assert.equal(sumCents(costs), 131750);
});

test("transit multi-cohorte conserve exactement le total officiel et l’arrondi", () => {
  const raw = [["01/08/2026", "DHL", "LSHI", 1, 10, "GROUPAGE 1\nJL10026 : 1kgs\nAT10026 : 2kgs"]];
  const costs = calculateTransitDirectCosts(reconcileOfficialTransit(adaptOfficialTransitRows(raw).rows, shipmentRows(raw)).matches);
  assert.equal(sumCents(costs), 1700);
  assert.deepEqual(costs.map(({ amountCents }) => amountCents), [567, 1133]);
});

test("transit sans poids individuel imputable conserve le total en NON IMPUTÉ", () => {
  const official = adaptOfficialTransitRows([["01/08/2026", "DHL", "LSHI", 1, 10, "GROUPAGE 1"]]).rows[0];
  const shipment = { ...shipmentRows([["01/08/2026", "DHL", "LSHI", 1, 10, "GROUPAGE 1\nXX10026 : 10kgs"]])[0] };
  const costs = calculateTransitDirectCosts([{ official, shipment }]);
  assert.equal(costs[0].status, "NON IMPUTÉ");
  assert.equal(costs[0].amountCents, 1700);
});

test("Expédition KLZ historique reste visible sans double déduction ni charge non imputée", () => {
  const rows = [64, 18, 17].map((amount, index) => expense({ category: "Expédition KLZ", amount, sourceReference: `DEP:KLZ:${index + 1}` }));
  const result = aggregatePeriodExpenses(rows, august);
  assert.equal(result.operationalByCurrency.USD, 99);
  assert.deepEqual(result.operationalByCategoryAndCurrency["Expédition KLZ"], { USD: 99 });
  assert.deepEqual(result.excludedFromProfitByCategoryAndCurrency["Expédition KLZ"], { USD: 99 });
  assert.equal(result.deductibleOperationalByCurrency.USD ?? 0, 0);
  assert.equal(result.directCostsAllocated.length, 0);
  assert.equal(result.directCostsUnallocated.length, 0);
  assert.equal(result.anomalies.some(({ type }) => type === "CHARGE_DIRECTE_NON_IMPUTEE"), false);
});

test("TF Bénin est trésorerie séparée et exclue des charges", () => {
  const result = aggregatePeriodExpenses([expense({ category: "TF Bénin", amount: 100 }), expense({ sourceReference: "DEP:2", category: "Connexion", amount: 20 })], august);
  assert.equal(result.tfBeninByCurrency.USD, 100);
  assert.equal(result.operationalByCurrency.USD, 20);
});

test("conserve des totaux séparés par devise sans conversion", () => {
  const result = aggregatePeriodExpenses([expense({ amount: 10 }), expense({ sourceReference: "DEP:2", currency: "CDF", amount: 2000 })], august);
  assert.deepEqual(result.operationalByCurrency, { USD: 10, CDF: 2000 });
});

test("conserve Déclarant dans l’historique mais l’exclut des dépenses déductibles", () => {
  const result = aggregatePeriodExpenses([
    expense({ sourceReference: "DEP:DECLARANT", category: "Déclarant", amount: 300 }),
    expense({ sourceReference: "DEP:SACS", category: "Sacs", amount: 20 })
  ], august);
  assert.equal(result.operationalByCurrency.USD, 320);
  assert.equal(result.deductibleOperationalByCurrency.USD, 20);
  assert.deepEqual(result.excludedFromProfitByCategoryAndCurrency.Déclarant, { USD: 300 });
  assert.deepEqual(result.deductibleOperationalByCategoryAndCurrency.Sacs, { USD: 20 });
});

test("conserve Prime dans l’historique/Caisse mais l’exclut du bénéfice mensuel", () => {
  const result = aggregatePeriodExpenses([
    expense({ sourceReference: "DEP:PRIME", category: "Prime", agency: "LSHI", amount: 100 }),
    expense({ sourceReference: "DEP:SACS", category: "Sacs", agency: "LSHI", amount: 20 })
  ], august);
  assert.equal(result.operationalByCurrency.USD, 120);
  assert.equal(result.deductibleOperationalByCurrency.USD, 20);
  assert.deepEqual(result.excludedFromProfitByCategoryAndCurrency.Prime, { USD: 100 });
});

test("reconnaît la catégorie Declarant sans accent sans exclure les autres catégories", () => {
  const result = aggregatePeriodExpenses([
    expense({ sourceReference: "DEP:DECLARANT", category: "Declarant", amount: 100 }),
    expense({ sourceReference: "DEP:CONNEXION", category: "Connexion", amount: 10 }),
    expense({ sourceReference: "DEP:SACS", category: "Sacs", amount: 20 })
  ], august);
  assert.equal(result.operationalByCurrency.USD, 130);
  assert.equal(result.deductibleOperationalByCurrency.USD, 30);
  assert.deepEqual(result.deductibleConnectionByAgencyAndCurrency.FIH, { USD: 10 });
});

test("Connexion Agent est déductible pour FIH LSHI KLZ mais reste couverte par la charge fixe COO", () => {
  const result = aggregatePeriodExpenses([
    expense({ sourceReference: "DEP:FIH:CONNEXION", agency: "FIH", category: "Connexion", amount: 4 }),
    expense({ sourceReference: "DEP:LSHI:CONNEXION", agency: "LSHI", category: "Connexion", amount: 5 }),
    expense({ sourceReference: "DEP:KLZ:CONNEXION", agency: "KLZ", category: "Connexion", amount: 17 }),
    expense({ sourceReference: "DEP:COO:CONNEXION", agency: "COO", category: "Connexion", amount: 8 })
  ], august);
  assert.equal(result.operationalByCurrency.USD, 34);
  assert.equal(result.deductibleOperationalByCurrency.USD, 26);
  assert.deepEqual(result.deductibleConnectionByAgencyAndCurrency, { FIH: { USD: 4 }, LSHI: { USD: 5 }, KLZ: { USD: 17 } });
  assert.deepEqual(result.excludedFromProfitByCategoryAndCurrency.Connexion, { USD: 8 });
});

test("conserve les charges fixes Agent dans l’historique sans les redéduire du bénéfice", () => {
  const result = aggregatePeriodExpenses([
    expense({ sourceReference: "DEP:SALAIRE", agency: "LSHI", category: "Salaire", amount: 300 }),
    expense({ sourceReference: "DEP:LOYER", agency: "LSHI", category: "Loyer", amount: 250 }),
    expense({ sourceReference: "DEP:EAU", agency: "LSHI", category: "Eau et Électricité", amount: 200 }),
    expense({ sourceReference: "DEP:CHAUFFEUR", agency: "LSHI", category: "Chauffeur", amount: 100 }),
    expense({ sourceReference: "DEP:SACS", agency: "LSHI", category: "Sacs", amount: 25 })
  ], august);
  assert.equal(result.operationalByCurrency.USD, 875);
  assert.equal(result.deductibleOperationalByCurrency.USD, 25);
  assert.deepEqual(result.deductibleOperationalByCategoryAndCurrency.Sacs, { USD: 25 });
});

test("COO conserve ses dépenses fixes en historique et déduit seulement les frais centraux supplémentaires", () => {
  const result = aggregatePeriodExpenses([
    expense({ sourceReference: "DEP:COO:SALAIRE", agency: "COO", category: "Salaire", amount: 300 }),
    expense({ sourceReference: "DEP:COO:SACS", agency: "COO", category: "Sacs", amount: 80 }),
    expense({ sourceReference: "DEP:COO:TRANSPORT", agency: "COO", category: "Transport local", amount: 25 })
  ], august);
  assert.equal(result.operationalByCurrency.USD, 405);
  assert.deepEqual(result.excludedFromProfitByCategoryAndCurrency.Salaire, { USD: 300 });
  assert.deepEqual(result.deductibleOperationalByAgencyAndCurrency.COO, { USD: 105 });
  assert.deepEqual(result.deductibleOperationalUnallocatedByCurrency, {});
});

test("une dépense sans agence certifiée reste non imputée sans répartition silencieuse", () => {
  const result = aggregatePeriodExpenses([expense({ agency: "Cotonou ?", category: "Sacs", amount: 40 })], august);
  assert.deepEqual(result.deductibleOperationalUnallocatedByCurrency, { USD: 40 });
  assert.deepEqual(result.deductibleOperationalByAgencyAndCurrency, {});
});

test("calcule uniquement RESULTAT_OPERATIONNEL_PERIODE_USD", () => {
  const expenses = aggregatePeriodExpenses([expense({ amount: 20 })], august);
  assert.equal(resultOperationalPeriodUsd(100, expenses), 80);
});

test("marge non calculable sans CA historique et provisoire avec charge non imputée", () => {
  assert.equal(calculateDirectMargin({ historicalRevenueUsd: null, certifiedDirectCostsUsd: 10, hasUnallocatedDirectCosts: false }).status, "NON CALCULABLE");
  assert.equal(calculateDirectMargin({ historicalRevenueUsd: 100, certifiedDirectCostsUsd: 20, hasUnallocatedDirectCosts: true }).status, "PROVISOIRE");
});

test("agrège les anomalies avec source, référence, agence, cohorte et impact", () => {
  const issues = aggregateReadAnomalies([{ code: "SOURCE_INDISPONIBLE", source: "MANIFESTE", rowNumber: 4, message: "offline" }], { agency: "LSHI", cohortId: "2026-08", impact: "Poids indisponible" });
  assert.deepEqual(issues[0], { type: "SOURCE_INDISPONIBLE", source: "MANIFESTE", reference: "MANIFESTE!4", agency: "LSHI", cohortId: "2026-08", impact: "Poids indisponible" });
});

function manifest(code: string, weightKg: number, agency: "FIH" | "LSHI" | "KLZ" = "LSHI", date = "2026-08-01"): BilanManifestParcel { return { date, rawCode: code, code, weightKg, expectedAmount: null, agency, sourceSheet: agency, sourceRow: 2 }; }
function shipmentRows(rows: unknown[][]): readonly BilanShipment[] { return adaptShipmentRows(rows).rows; }
function payment(overrides: Partial<BilanPayment> = {}): BilanPayment { return { paymentDate: "2026-08-02T00:00:00Z", code: "AT10026", expectedAmount: 100, paidAmount: 50, destination: "LSHI", collectingAgency: "LSHI", status: "PARTIEL", paymentRequestId: "req-1", sourceReference: "LSHI:2", ...overrides }; }
function expense(overrides: Partial<BilanExpense> = {}): BilanExpense { return { date: "2026-08-03", agency: "FIH", category: "Connexion", amount: 10, currency: "USD", description: "", reference: "REF", status: "ACTIVE", cancelled: false, corrected: false, sourceReference: "DEP:1", ...overrides }; }
function sumCents(costs: readonly CohortDirectCost[]) { return costs.reduce((total, cost) => total + cost.amountCents, 0); }
