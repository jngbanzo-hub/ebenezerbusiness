import assert from "node:assert/strict";
import test from "node:test";

import { parseShipmentStatistics } from "@/features/admin/shipment-statistics";
import { formatParcelsForArrival, isKlzSuffix, projectReceptionStatistics } from "./reception-statistics";

test("sépare Ethiopian LSHI et KLZ par suffixe sans perdre le total", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["01/08/2026", "ETHIOPIAN", "LSHI", 1, 10, "JL00126\nJL00226klz\nJL00326\nJL00426 KLZ", 0, 0, "1 kg\n2 kg\n3 kg\n4 kg", "4 COLIS", "En Attente"],
  ]).shipments;
  const lshi = projectReceptionStatistics(source, "LSHI");
  const klz = projectReceptionStatistics(source, "KLZ");
  assert.equal(lshi.totals.parcels, 2);
  assert.equal(klz.totals.parcels, 2);
  assert.equal(lshi.totals.parcels + klz.totals.parcels, 4);
  assert.equal(lshi.totals.weightKg, 4);
  assert.equal(klz.totals.weightKg, 6);
  assert.equal(isKlzSuffix("MR12526 klz  "), true);
  assert.deepEqual(klz.parcels.map((parcel) => parcel.copyCode), ["JL00226", "JL00426"]);
  assert.equal(formatParcelsForArrival(klz.parcels), "JL00226 : 2Kgs\nJL00426 : 4Kgs");
  assert.deepEqual(lshi.parcels.map((parcel) => parcel.copyCode), ["JL00126", "JL00326"]);
});

test("sépare DHL LSHI et KLZ par suffixe avec le total certifié KLZ", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["31/08/2026", "DHL", "LSHI", 1, 34, "AT00126KLZ\nAT00226KLZ\nAT00326KLZ\nAT00426KLZ\nAT00526KLZ\nAT00626KLZ\nAT00726KLZ\nAT00826KLZ", 0, 0, "4 kg\n4 kg\n4 kg\n4 kg\n4 kg\n4 kg\n5 kg\n5 kg", "8 COLIS", "Arrivé à KLZ"],
    ["31/08/2026", "DHL", "LSHI", 1, 29, "AT00926KLZ\nAT01026KLZ\nAT01126KLZ\nAT01226KLZ\nAT01326KLZ\nAT20126", 0, 0, "5 kg\n5 kg\n5 kg\n5 kg\n6 kg\n3 kg", "6 COLIS", "Arrivé à KLZ"],
    ["31/08/2026", "DHL", "LSHI", 1, 6, "AT01426KLZ\nAT20226", 0, 0, "2 kg\n4 kg", "2 COLIS", "Arrivé à KLZ"],
  ]).shipments;

  const klz = projectReceptionStatistics(source, "KLZ", { company: "DHL" });
  const lshi = projectReceptionStatistics(source, "LSHI", { company: "DHL" });

  assert.equal(klz.rows.length, 3);
  assert.equal(klz.totals.parcels, 14);
  assert.equal(klz.totals.weightKg, 62);
  assert.deepEqual(klz.parcels.map((parcel) => parcel.copyCode), [
    "AT00126", "AT00226", "AT00326", "AT00426", "AT00526", "AT00626", "AT00726",
    "AT00826", "AT00926", "AT01026", "AT01126", "AT01226", "AT01326", "AT01426",
  ]);
  assert.deepEqual(lshi.parcels.map((parcel) => parcel.code), ["AT20126", "AT20226"]);
  assert.equal(lshi.totals.parcels, 2);
  assert.equal(lshi.totals.weightKg, 7);
});

test("refuse une copie partielle si un poids est absent ou un code est dupliqué", () => {
  assert.throws(() => formatParcelsForArrival([
    { code: "JL00126", copyCode: "JL00126", weightKg: 2 },
    { code: "JL00126KLZ", copyCode: "JL00126", weightKg: 3 },
  ]), /plusieurs fois/);
  assert.throws(() => formatParcelsForArrival([{ code: "JL00226", copyCode: "JL00226", weightKg: 0 }]), /invalide/);
});

test("n'interprète jamais les libellés de groupage comme des colis", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["03/08/2026", "DHL", "FIH", 1, 3, "GROUPAGE 1 SAC1\nJL27226 : 1kgs\nGROUPAGE 2 S2\nJL27326 : 2kgs", 0, 0, "1 kg\n2 kg", "2 COLIS"],
  ]).shipments;
  const reception = projectReceptionStatistics(source, "FIH");
  assert.deepEqual(reception.parcels.map((parcel) => parcel.code), ["JL27226", "JL27326"]);
  assert.equal(reception.copyValidationErrors.length, 0);
});

test("conserve ASKY et DHL FIH sans appliquer le suffixe KLZ", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["02/08/2026", "ASKY", "FIH", 1, 12, "FIH00126\nFIH00226klz", 0, 0, "12 kg", "2 COLIS"],
    ["03/08/2026", "DHL", "FIH", 1, 8, "FIH00326", 0, 0, "8 kg", "1 COLIS"],
  ]).shipments;
  const fih = projectReceptionStatistics(source, "FIH");
  assert.equal(fih.totals.parcels, 3);
  assert.equal(fih.totals.weightKg, 20);
  assert.equal(projectReceptionStatistics(source, "KLZ").totals.parcels, 0);
});

test("les filtres restent compatibles avec la projection d'agence", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["02/04/2026", "ASKY", "FIH", 1, 12, "FIH00126", 0, 0, "12 kg", "1 COLIS", "Arrivé", "03/04/2026"],
    ["03/05/2026", "DHL", "FIH", 1, 8, "FIH00226", 0, 0, "8 kg", "1 COLIS", "En Attente"],
  ]).shipments;
  const april = projectReceptionStatistics(source, "FIH", { from: "2026-04-01", to: "2026-04-30", company: "ASKY", status: "ARRIVE" });
  assert.equal(april.rows.length, 1);
  assert.equal(april.totals.parcels, 1);
});

test("les cartes correspondent exactement à la sélection unique copiée", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["01/08/2026", "ASKY", "FIH", 1, 2, "JL00126 : 2kgs", 0, 0, "2 kg", "1 COLIS"],
    ["02/08/2026", "ASKY", "FIH", 1, 9, "JL00226 : 9kgs", 0, 0, "9 kg", "1 COLIS"],
  ]).shipments;
  const reception = projectReceptionStatistics(source, "FIH");
  assert.equal(reception.totals.parcels, reception.parcels.length);
  assert.equal(reception.totals.weightKg, reception.parcels.reduce((sum, parcel) => sum + parcel.weightKg, 0));
});

const statusCases = [
  { status: "Arrivé", weight: 1 },
  { status: "En Attente", weight: 2 },
  { status: "En Vol", weight: 3 },
  { status: "En Transit à Addis", weight: 4 },
  { status: " en transit à Libreville ", weight: 5 },
];

for (const agency of ["FIH", "LSHI", "KLZ"] as const) {
  test(`filtre les cinq statuts et conserve l'isolation ${agency}`, () => {
    const source = parseShipmentStatistics([
      ["Date"],
      ...(["FIH", "LSHI", "KLZ"] as const).flatMap((site) => statusCases.map(({ status, weight }, index) => {
        const code = `${site}${String(index + 1).padStart(3, "0")}26${site === "KLZ" ? "KLZ" : ""}`;
        return [`0${index + 1}/09/2026`, site === "FIH" ? "ASKY" : "ETHIOPIAN", site === "KLZ" ? "LSHI" : site,
          1, weight, `GROUPAGE ${site}-${index + 1}\n${code}: ${weight}kgs`, 0, 0, `${weight} kg`, "1 COLIS", status];
      })),
    ]).shipments;
    const expected = [
      { status: "ALL", parcels: 5, weightKg: 15, rows: 5 },
      { status: "ARRIVE", parcels: 1, weightKg: 1, rows: 1 },
      { status: "EN ATTENTE", parcels: 1, weightKg: 2, rows: 1 },
      { status: "EN VOL", parcels: 1, weightKg: 3, rows: 1 },
      { status: "EN TRANSIT", parcels: 2, weightKg: 9, rows: 2 },
    ];
    for (const selection of expected) {
      const result = projectReceptionStatistics(source, agency, { status: selection.status });
      assert.equal(result.agency, agency);
      assert.equal(result.totals.parcels, selection.parcels, selection.status);
      assert.equal(result.totals.weightKg, selection.weightKg, selection.status);
      assert.equal(result.rows.length, selection.rows, selection.status);
      assert.ok(result.parcels.every((parcel) => parcel.code.startsWith(agency)), selection.status);
      assert.equal(result.copyValidationErrors.length, 0, selection.status);
    }
    const combined = projectReceptionStatistics(source, agency, {
      status: "EN VOL", from: "2026-09-03", to: "2026-09-03",
      company: agency === "FIH" ? "ASKY" : "ETHIOPIAN",
      arrival: "NOT_ARRIVED", search: `GROUPAGE ${agency}-3`,
    });
    assert.equal(combined.totals.parcels, 1);
    assert.equal(combined.totals.weightKg, 3);
    assert.equal(projectReceptionStatistics(source, agency, { status: "EN VOL", company: "DHL" }).totals.parcels, 0);
    assert.equal(projectReceptionStatistics(source, agency, { status: "EN TRANSIT", to: "2026-09-04" }).totals.parcels, 1);
  });
}

test("En transit accepte un nouveau lieu sans confondre les autres statuts", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["06/09/2026", "ASKY", "FIH", 1, 2, "FIH00626: 2kgs", 0, 0, "2 kg", "1 COLIS", " EN TRANSIT À KINSHASA "],
    ["06/09/2026", "ASKY", "FIH", 1, 3, "FIH00726: 3kgs", 0, 0, "3 kg", "1 COLIS", "Arrivé à KLZ"],
    ["06/09/2026", "ASKY", "FIH", 1, 4, "FIH00826: 4kgs", 0, 0, "4 kg", "1 COLIS", "Transit confirmé"],
  ]).shipments;
  const transit = projectReceptionStatistics(source, "FIH", { status: "EN TRANSIT" });
  assert.deepEqual(transit.parcels.map((parcel) => parcel.code), ["FIH00626"]);
  assert.equal(transit.totals.weightKg, 2);
});
