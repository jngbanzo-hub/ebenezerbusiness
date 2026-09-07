import assert from "node:assert/strict";
import test from "node:test";
import { aggregateAirFreight } from "./air-freight-aggregations";
import { adaptShipmentRows } from "./manifest-readers";
import type { BilanAirFreightRow } from "./bilan-readers-contracts";

const row = (overrides: Partial<BilanAirFreightRow>): BilanAirFreightRow => ({ date: "2026-08-03", company: "ETHIOPIAN", destination: "LSHI", declaredGroupCount: 1, officialWeightKg: 10, details: "GROUPAGE 001\nAT00126 : 10kg", rateUsdPerKg: 4.53, amountUsd: 45.3, sourceSheet: "STATISTIQUES DES EXPÉDITIONS", sourceRow: 2, ...overrides });

test("rattache les départs ultérieurs au mois du code et exclut KLZ", () => {
    const result = aggregateAirFreight([
      row({ destination: "FIH", company: "ASKY", amountUsd: 90, rateUsdPerKg: 3, details: "GROUPAGE 001\nAT00126 : 30kg" }),
      row({ date: "2026-09-02", destination: "FIH", company: "DHL", amountUsd: 60, rateUsdPerKg: 3, details: "GROUPAGE 002\nAT00226 : 20kg" }),
      row({ destination: "LSHI", amountUsd: 45.3 }),
    ], [], "2026-08");
    assert.deepEqual(result.byAgency, { FIH: 150, LSHI: 45.3, KLZ: 0 });
    assert.equal(result.laterMonthUsd, 60);
    assert.equal(result.totalUsd, 195.3);
  });

test("ventile une ligne multi-cohortes au prix/kg certifié", () => {
    const result = aggregateAirFreight([row({ destination: "FIH", company: "DHL", officialWeightKg: 10, amountUsd: 30, rateUsdPerKg: 3, details: "GROUPAGE 001\nJL00126 : 4kg\nAT00126 : 6kg" })], [], "2026-08");
    assert.equal(result.byAgency.FIH, 18);
  });

test("résout la ligne 89 avec les deux groupages documentaires exacts", () => {
    const shipments = adaptShipmentRows([["04/08/2026", "ETHIOPIAN", "LSHI", "", "", "GROUPAGE 005\nAT00526 : 30kg\nGROUPAGE 008\nAT00826 : 32kg"]], 100).rows;
    const result = aggregateAirFreight([row({ sourceRow: 89, declaredGroupCount: 10, officialWeightKg: 334, amountUsd: 1513.02, details: "GROUPAGE 001\nJL00126 : 40kg\nGROUPAGE 002\nAT00226 : 40kg\nGROUPAGE 003\nAT00326 : 40kg\nGROUPAGE 004\nAT00426 : 40kg\nGROUPAGE 006\nAT00626 : 40kg\nGROUPAGE 007\nAT00726 : 40kg\nGROUPAGE 009\nAT00926 : 16kg\nGROUPAGE 010\nAT01026 : 16kg" })], shipments, "2026-08");
    assert.deepEqual(result.anomalies, []);
    assert.equal(result.allocations[0].cohortWeightKg, 294);
    assert.equal(result.allocations[0].amountUsd, 1331.82);
  });
