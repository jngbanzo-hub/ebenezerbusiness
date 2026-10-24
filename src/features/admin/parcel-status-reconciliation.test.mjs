import assert from "node:assert/strict";
import test from "node:test";

import { buildManifestStatisticsFromParcelRows, buildParcelStatusSituation, isCalendarDate } from "./parcel-status-statistics.ts";

const row = (rowNumber, codeRaw, weightRaw, statusRaw = "", dateRaw = "08/08/2026", destination = "FIH") => ({ destination, rowNumber, dateRaw, codeRaw, weightRaw, statusRaw });

test("les dates personnalisées sont des dates calendaires valides", () => {
  assert.equal(isCalendarDate("2026-10-12"), true);
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.equal(isCalendarDate("2024-02-29"), true);
  assert.equal(isCalendarDate("12/10/2026"), false);
});

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

test("les dates journalières filtrent un jour, une semaine et une plage traversant deux mois", () => {
  const rows = [
    row(2, "BEFORE", 1, "Arrivé", "2026-09-27", "FIH"),
    row(3, "SEP-28", 4, "Arrivé", "28/09/2026", "FIH"),
    row(2, "OCT-04", 5, "En vol", "2026-10-04", "KLZ"),
    row(4, "OCT-11", 6, "Arrivé", "2026-10-11", "FIH"),
    row(5, "OCT-12-FIH", 1, "Arrivé", "12/10/2026", "FIH"),
    row(2, "OCT-12-LSHI", 2, "En vol", "2026-10-12", "LSHI"),
    row(3, "OCT-18", 3, "Arrivé", "2026-10-18", "KLZ"),
    row(4, "AFTER", 7, "Arrivé", "2026-10-19", "KLZ")
  ];

  const monthly = buildParcelStatusSituation(rows, { month: 10, fromMonth: "2026-10", toMonth: "2026-10" });
  assert.equal(monthly.rows.length, 6);
  assert.equal(buildManifestStatisticsFromParcelRows(monthly.rows).annualKilograms?.total, 24);

  const singleDay = buildParcelStatusSituation(rows, { fromDate: "2026-10-12", toDate: "2026-10-12" });
  assert.deepEqual(singleDay.rows.map((item) => item.code), ["OCT-12-FIH", "OCT-12-LSHI"]);
  assert.equal(buildManifestStatisticsFromParcelRows(singleDay.rows).annualParcels?.total, 2);
  assert.equal(buildManifestStatisticsFromParcelRows(singleDay.rows).annualKilograms?.total, 3);

  const week = buildParcelStatusSituation(rows, { fromDate: "2026-10-12", toDate: "2026-10-18" });
  assert.deepEqual(week.rows.map((item) => item.code), ["OCT-12-FIH", "OCT-12-LSHI", "OCT-18"]);
  assert.equal(buildManifestStatisticsFromParcelRows(week.rows).annualKilograms?.total, 6);
  assert.equal(buildManifestStatisticsFromParcelRows(week.rows).kilograms.length, 1);

  const crossMonth = buildParcelStatusSituation(rows, { fromDate: "2026-09-28", toDate: "2026-10-04" });
  assert.deepEqual(crossMonth.rows.map((item) => item.code), ["SEP-28", "OCT-04"]);
  assert.equal(buildManifestStatisticsFromParcelRows(crossMonth.rows).kilograms.length, 2);
  assert.equal(buildManifestStatisticsFromParcelRows(crossMonth.rows).annualKilograms?.total, 9);

  for (const destination of ["FIH", "LSHI", "KLZ"]) {
    const filtered = buildParcelStatusSituation(rows, { fromDate: "2026-10-12", toDate: "2026-10-18", destination });
    assert.equal(filtered.rows.length, 1);
    assert.equal(filtered.rows[0].destination, destination);
  }
  assert.deepEqual(buildParcelStatusSituation(rows, { fromDate: "2026-10-12", toDate: "2026-10-18", status: "ARRIVED" }).rows.map((item) => item.code), ["OCT-12-FIH", "OCT-18"]);
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
