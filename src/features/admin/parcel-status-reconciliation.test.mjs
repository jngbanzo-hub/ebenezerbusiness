import assert from "node:assert/strict";
import test from "node:test";

import { buildManifestStatisticsFromParcelRows, buildParcelStatusSituation } from "./parcel-status-statistics.ts";

const row = (rowNumber, codeRaw, weightRaw, statusRaw = "", dateRaw = "08/08/2026", destination = "FIH") => ({ destination, rowNumber, dateRaw, codeRaw, weightRaw, statusRaw });

test("août compte chaque ligne valide, y compris les doublons et statuts inconnus avec Tous", () => {
  const situation = buildParcelStatusSituation([
    row(2, "DUP", "3 Kgs", "Arrivé"),
    row(3, "DUP", "8 Kgs", ""),
    row(4, "OTHER", "10 kg", "Statut spécial", "31/08/2026", "LSHI")
  ], { fromMonth: "2026-08", toMonth: "2026-08", status: "ALL" });
  const statistics = buildManifestStatisticsFromParcelRows(situation.rows);
  assert.equal(statistics.annualParcels?.total, 3);
  assert.equal(statistics.annualKilograms?.total, 21);
  assert.equal(situation.anomalies.duplicateCodes, 1);
  assert.equal(situation.anomalies.unknownStatuses, 2);
});

test("accepte les variantes KG/KGS et les décimales, mais exclut date code ou poids invalides", () => {
  const situation = buildParcelStatusSituation([
    row(2, "A", "5KG", "En vol"),
    row(3, "B", "3.5 KG", "En transit"),
    row(4, "C", "3,5 kgs", "Livré"),
    row(5, "ZERO", "0 kg"),
    row(6, "", "2 kg"),
    row(7, "BAD-DATE", "2 kg", "Arrivé", "31/02/2026")
  ]);
  assert.equal(situation.global.total.parcels, 3);
  assert.equal(situation.global.total.weightKg, 12);
  assert.equal(situation.anomalies.invalidWeights, 1);
  assert.equal(situation.anomalies.emptyCodes, 1);
  assert.equal(situation.anomalies.invalidDates, 1);
  assert.deepEqual(situation.anomalies.excludedRows.map((item) => item.reason).sort(), ["EMPTY_CODE", "INVALID_DATE", "INVALID_WEIGHT"]);
});

test("juillet et la période personnalisée restent inclusifs et séparés par destination", () => {
  const rows = [
    row(2, "JUL-FIH", "2 kg", "", "01/07/2026", "FIH"),
    row(2, "JUL-LSHI", "3 kg", "", "31/07/2026", "LSHI"),
    row(2, "AUG-KLZ", "4 kg", "", "01/08/2026", "KLZ")
  ];
  const july = buildParcelStatusSituation(rows, { fromMonth: "2026-07", toMonth: "2026-07", status: "ALL" });
  assert.equal(july.global.total.parcels, 2);
  assert.equal(july.destinations.FIH.total.weightKg, 2);
  assert.equal(july.destinations.LSHI.total.weightKg, 3);
  assert.equal(july.destinations.KLZ.total.weightKg, 0);
});

test("les exclusions affichées sont limitées à la période et ignorent les lignes entièrement vides", () => {
  const situation = buildParcelStatusSituation([
    row(2, "OK", "2 kg", "EN VOL", "01/08/2026", "FIH"),
    row(3, "", "3 kg", "EN VOL", "02/08/2026", "FIH"),
    row(4, "BAD-WEIGHT", "0 kg", "EN VOL", "03/08/2026", "LSHI"),
    row(5, "OLD-BAD", "0 kg", "EN VOL", "03/07/2026", "KLZ"),
    row(6, "", "", "", "", "FIH")
  ], { fromMonth: "2026-08", toMonth: "2026-08", status: "ALL" });

  assert.equal(situation.global.total.parcels, 1);
  assert.equal(situation.anomalies.emptyCodes, 1);
  assert.equal(situation.anomalies.invalidWeights, 1);
  assert.equal(situation.anomalies.invalidDates, 0);
  assert.deepEqual(situation.anomalies.excludedRows.map((item) => item.reason).sort(), ["EMPTY_CODE", "INVALID_WEIGHT"]);
});
