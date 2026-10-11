import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node 22 exécute directement ce test TypeScript avec son extension explicite.
import { filterShipmentStatistics, parseShipmentStatistics, selectShipmentCohort } from "./shipment-statistics.ts";

const cohortOf = (code: string) => ({ AT: "2026-08", SE: "2026-09", OT: "2026-10", MR: "2026-03" })[code.slice(0, 2)] ?? null;

test("ignore les lignes de formules vides et agrège les expéditions", () => {
  const parsed = parseShipmentStatistics([
    ["Date", "Compagnie"],
    ["31/07/2026", "ETHIOPIAN", "LSHI", 2, "120 Kgs", "G1", 5, 600, "", "12 COLIS", "Arrivé", "01/08/2026"],
    ["", "", "", "", "", "", 0]
  ]);
  assert.equal(parsed.shipments.length, 1); assert.equal(parsed.totals.weightKg, 120); assert.equal(parsed.totals.parcels, 12);
  assert.equal(filterShipmentStatistics(parsed.shipments, { company: "DHL" }).shipments.length, 0);
});

test("filtre arrivée, recherche et période avec des totaux cohérents", () => {
  const parsed = parseShipmentStatistics([["Date"], ["31/07/2026", "ASKY", "FIH", 1, 10, "GRP-01", 5, 50, "10", "2 COLIS", "Arrivé", "01/08/2026", "GRP-01"], ["01/08/2026", "DHL", "LSHI", 1, 20, "GRP-02", 5, 100, "20", "3 COLIS", "En Attente", "", ""]]);
  const arrived = filterShipmentStatistics(parsed.shipments, { arrival: "ARRIVED", search: "grp 01", from: "2026-07-01", to: "2026-07-31" });
  assert.equal(arrived.shipments.length, 1); assert.equal(arrived.totals.weightKg, 10); assert.equal(arrived.totals.parcels, 2);
  assert.equal(filterShipmentStatistics(parsed.shipments, { arrival: "NOT_ARRIVED" }).shipments.length, 1);
});

test("combine mois, destination, compagnie, statut et arrivée", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["15/04/2026", "ASKY", "KLZ", 1, 8.5, "APR-KLZ", 5, 42.5, "8.5", "1 COLIS", "Arrivé", "16/04/2026", "APR-KLZ"],
    ["18/04/2026", "DHL", "FIH", 1, 3.25, "APR-FIH", 5, 16.25, "3.25", "1 COLIS", "En Attente", "", ""],
    ["15/06/2026", "ASKY", "KLZ", 1, 10, "JUN-KLZ", 5, 50, "10", "1 COLIS", "Arrivé", "16/06/2026", "JUN-KLZ"]
  ]);

  const april = filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(april.shipments.length, 2);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", destination: "KLZ" }).shipments.length, 1);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", company: "ASKY" }).shipments.length, 1);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", status: "ARRIVE" }).shipments.length, 1);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", arrival: "ARRIVED" }).shipments.length, 1);
  assert.equal(filterShipmentStatistics(parsed.shipments, { from: "2026-04-01", to: "2026-04-30", destination: "KLZ", company: "ASKY", status: "ARRIVE", arrival: "ARRIVED" }).shipments.length, 1);
});

test("filtre les statuts réels de la colonne K et recalcule toutes les statistiques", () => {
  const row = (date: string, company: string, destination: string, status: string, code: string, weight: number) =>
    [date, company, destination, 1, weight, code, 5, weight * 5, `${weight} kg`, "1 COLIS", status, "", ""];
  const source = parseShipmentStatistics([
    ["Date", "Compagnie", "Destination", "Groupages", "Poids", "Codes", "Prix", "Montant", "Poids manifeste", "Colis", "Statut"],
    row("01/09/2026", "ASKY", "FIH", "En Vol", "SE00126", 10),
    row("02/09/2026", "DHL", "LSHI", " en vol ", "SE00226", 20),
    row("03/09/2026", "DHL", "KLZ", "EN VOL", "SE00326", 30),
    row("01/09/2026", "ASKY", "FIH", "En Transit à Addis", "SE00426", 15),
    row("02/09/2026", "DHL", "LSHI", " en  transit à addis ", "SE00526", 25),
    row("03/09/2026", "DHL", "KLZ", "En Transit à Libreville", "SE00626", 35),
    row("02/09/2026", "ASKY", "FIH", "Arrivé", "SE00726", 5),
    row("02/09/2026", "ASKY", "FIH", " En attente ", "SE00826", 6),
    row("02/09/2026", "DHL", "KLZ", "Arrivé à KLZ", "SE00926", 7),
    row("02/09/2026", "DHL", "LSHI", "", "SE01026", 8)
  ]);
  const all = filterShipmentStatistics(source.shipments, { status: "ALL" });
  assert.equal(all.totals.shipments, 10);
  assert.equal(filterShipmentStatistics(source.shipments, { status: "ARRIVE" }).totals.shipments, 1);
  assert.equal(filterShipmentStatistics(source.shipments, { status: "EN ATTENTE" }).totals.shipments, 1);
  const inFlight = filterShipmentStatistics(source.shipments, { status: "EN VOL" });
  assert.deepEqual({ shipments: inFlight.totals.shipments, groupages: inFlight.totals.groupages, weightKg: inFlight.totals.weightKg, manifestWeightKg: inFlight.totals.manifestWeightKg, parcels: inFlight.totals.parcels, amountUsd: inFlight.totals.amountUsd },
    { shipments: 3, groupages: 3, weightKg: 60, manifestWeightKg: 60, parcels: 3, amountUsd: 300 });
  assert.deepEqual(inFlight.byDestination.map(({ label, shipments }) => [label, shipments]), [["FIH", 1], ["KLZ", 1], ["LSHI", 1]]);
  const inTransit = filterShipmentStatistics(source.shipments, { status: "EN TRANSIT" });
  assert.deepEqual({ shipments: inTransit.totals.shipments, groupages: inTransit.totals.groupages, weightKg: inTransit.totals.weightKg, manifestWeightKg: inTransit.totals.manifestWeightKg, parcels: inTransit.totals.parcels, amountUsd: inTransit.totals.amountUsd },
    { shipments: 3, groupages: 3, weightKg: 75, manifestWeightKg: 75, parcels: 3, amountUsd: 375 });
  assert.deepEqual(inTransit.byCompany.map(({ label, shipments }) => [label, shipments]), [["ASKY", 1], ["DHL", 2]]);
  for (const status of ["EN VOL", "EN TRANSIT"]) {
    for (const destination of ["FIH", "LSHI", "KLZ"]) {
      assert.equal(filterShipmentStatistics(source.shipments, { status, destination }).totals.shipments, 1);
    }
  }
  assert.equal(filterShipmentStatistics(source.shipments, { status: "EN VOL", company: "ASKY" }).totals.shipments, 1);
  assert.equal(filterShipmentStatistics(source.shipments, { status: "EN TRANSIT", company: "DHL" }).totals.shipments, 2);
  assert.equal(filterShipmentStatistics(source.shipments, { status: "EN VOL", from: "2026-09-02", to: "2026-09-02" }).totals.shipments, 1);
  assert.equal(filterShipmentStatistics(source.shipments, { status: "EN TRANSIT", from: "2026-09-03", to: "2026-09-03" }).totals.shipments, 1);
  assert.equal(filterShipmentStatistics(source.shipments, { status: "EN TRANSIT", arrival: "ARRIVED" }).totals.shipments, 0);
  assert.equal(filterShipmentStatistics(source.shipments, { status: "EN TRANSIT", search: "SE00426" }).totals.shipments, 1);
});

test("calcule le poids manifeste et sépare les colis Ethiopian LSHI/KLZ sans doublon", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["01/08/2026", "ETHIOPIAN", "LSHI", 2, 70, "AT02926klz : 10kgs\nAT02726 KLZ : 20kgs\nJL10026 : 35kgs\nJL10026 : 35kgs", 5, 350, "GROUPAGE 30 : 32 kg\nGROUPAGE 31 : 33 kg", "3 COLIS"],
    ["02/08/2026", "ETHIOPIAN", "LSHI", 1, 40, "JL10126 : 36kgs", 5, 200, "36 kg", "1 COLIS"]
  ]);
  const filtered = filterShipmentStatistics(parsed.shipments, { company: "ETHIOPIAN", destination: "LSHI" });
  assert.equal(filtered.totals.weightKg, 110);
  assert.equal(filtered.totals.manifestWeightKg, 101);
  assert.equal(filtered.totals.parcels, 4);
  assert.equal(filtered.totals.destinationParcels.lshi, 2);
  assert.equal(filtered.totals.destinationParcels.klz, 2);
  assert.equal(filtered.totals.parcels, filtered.totals.destinationParcels.lshi + filtered.totals.destinationParcels.klz);
});

test("classe tous les colis ASKY et DHL vers FIH", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["03/08/2026", "ASKY", "FIH", 1, 20, "FIH10026\nFIH10126klz", 5, 100, "19 kg", "2 COLIS"],
    ["04/08/2026", "DHL", "FIH", 1, 30, "FIH10226", 5, 150, "29 kg", "1 COLIS"]
  ]);
  const asky = filterShipmentStatistics(parsed.shipments, { company: "ASKY", destination: "FIH" });
  assert.equal(asky.totals.weightKg, 20);
  assert.equal(asky.totals.manifestWeightKg, 19);
  assert.equal(asky.totals.parcels, 2);
  assert.equal(asky.totals.destinationParcels.fih, 2);
  const dhl = filterShipmentStatistics(parsed.shipments, { company: "DHL", destination: "FIH" });
  assert.equal(dhl.totals.weightKg, 30);
  assert.equal(dhl.totals.manifestWeightKg, 29);
  assert.equal(dhl.totals.parcels, 1);
  assert.equal(dhl.totals.destinationParcels.fih, 1);
  assert.equal(parsed.totals.parcels, 3);
});

test("déduplique par destination et code complet à partir du 01/08/2026", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["01/08/2026", "ASKY", "FIH", 1, 10, "AT19326B\nAT19326\nAT19326C\nAT19326D", 5, 50, "10 kg", "4 COLIS"],
    ["02/08/2026", "DHL", "LSHI", 1, 10, "AT19326B", 5, 50, "10 kg", "1 COLIS"],
    ["03/08/2026", "ETHIOPIAN", "LSHI", 1, 10, "AT19326Bklz : 10kgs", 5, 50, "10 kg", "1 COLIS"],
    ["04/08/2026", "ETHIOPIAN", "LSHI", 1, 10, "AT19326Bklz : 10kgs", 5, 50, "10 kg", "1 COLIS"]
  ]);
  assert.equal(parsed.totals.parcels, 6);
  assert.equal(parsed.totals.destinationParcels.klz, 1);
});

test("conserve la déduplication historique par code seul avant le 01/08/2026", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["31/07/2026", "ASKY", "FIH", 1, 10, "AT19326B", 5, 50, "10 kg", "1 COLIS"],
    ["31/07/2026", "DHL", "LSHI", 1, 10, "AT19326B", 5, 50, "10 kg", "1 COLIS"]
  ]);
  assert.equal(parsed.totals.parcels, 1);
});

test("reproduit les poids LSHI et KLZ certifiés pour août 2026", () => {
  const lshi = [
    ...Array.from({ length: 952 }, (_, index) => `AT${String(index + 1).padStart(5, "0")}26 : 5kgs`),
    "AT9999926 : 48kgs"
  ];
  const klz = [
    ...Array.from({ length: 149 }, (_, index) => `KZ${String(index + 1).padStart(5, "0")}26klz : 5kgs`),
    "KZ9999926klz : 31kgs",
    "KZ9999926klz : 31kgs"
  ];
  const filtered = filterShipmentStatistics(parseShipmentStatistics([
    ["Date"],
    ["15/08/2026", "ETHIOPIAN", "LSHI", 158, 5457, [...lshi, ...klz].join("\n"), 0, 0, "5615 kg", "1103 COLIS"]
  ]).shipments, { from: "2026-08-01", to: "2026-08-31", company: "ETHIOPIAN", destination: "LSHI" });

  assert.equal(filtered.totals.weightKg, 5457);
  assert.equal(filtered.totals.manifestWeightKg, 5615);
  assert.deepEqual(filtered.totals.destinationParcels, { fih: 0, lshi: 953, klz: 150 });
  assert.deepEqual(filtered.totals.destinationManifestWeightKg, { lshi: 4808, klz: 807 });
  assert.equal(filtered.totals.destinationManifestWeightKg.lshi + filtered.totals.destinationManifestWeightKg.klz, filtered.totals.manifestWeightKg);
});

test("additionne les occurrences de poids sans casser la déduplication des colis", () => {
  const totals = parseShipmentStatistics([
    ["Date"],
    ["15/08/2026", "ETHIOPIAN", "LSHI", 1, 8, "AT10026klz : 3kgs\nAT10026klz : 5kgs", 0, 0, "8 kg", "1 COLIS"]
  ]).totals;
  assert.equal(totals.destinationParcels.klz, 1);
  assert.equal(totals.destinationManifestWeightKg.klz, 8);
});

test("ignore les détails sans poids valide et retourne zéro sans résultat", () => {
  const malformed = parseShipmentStatistics([
    ["Date"],
    ["15/08/2026", "ETHIOPIAN", "LSHI", 1, 0, "AT10026 : poids inconnu\nAT10126klz : -3kgs", 0, 0, "", "2 COLIS"]
  ]);
  assert.deepEqual(malformed.totals.destinationManifestWeightKg, { lshi: 0, klz: 0 });
  assert.deepEqual(filterShipmentStatistics(malformed.shipments, { search: "ABSENT" }).totals.destinationManifestWeightKg, { lshi: 0, klz: 0 });
});

test("recalcule les poids après les filtres date, compagnie, statut et recherche", () => {
  const parsed = parseShipmentStatistics([
    ["Date"],
    ["01/08/2026", "ETHIOPIAN", "LSHI", 1, 5, "GROUPAGE A\nAT10026 : 3kgs\nAT10126klz : 2kgs", 0, 0, "5 kg", "2 COLIS", "Arrivé", "", "GROUPAGE A"],
    ["02/08/2026", "ETHIOPIAN", "LSHI", 1, 7, "GROUPAGE B\nAT10226 : 7kgs", 0, 0, "7 kg", "1 COLIS", "En Attente", "", ""]
  ]);
  const filtered = filterShipmentStatistics(parsed.shipments, { from: "2026-08-01", to: "2026-08-01", company: "ETHIOPIAN", destination: "LSHI", status: "ARRIVE", arrival: "ARRIVED", search: "GROUPAGE A" });
  assert.deepEqual(filtered.totals.destinationManifestWeightKg, { lshi: 3, klz: 2 });
});

test("ventile DHL vers LSHI sans confondre AT102526 et AT102426", () => {
  const lshi = [
    ...Array.from({ length: 131 }, (_, index) => `DL${String(index + 1).padStart(5, "0")}26 : 5kgs`),
    "DL9999926 : 59kgs",
    "AT102526 : 6kgs",
    "AT102426 : 10kgs"
  ];
  const klz = [
    ...Array.from({ length: 13 }, (_, index) => `DK${String(index + 1).padStart(5, "0")}26klz : 4kgs`),
    "DK9999926klz : 10kgs"
  ];
  const filtered = filterShipmentStatistics(parseShipmentStatistics([
    ["Date"],
    ["31/08/2026", "DHL", "LSHI", 23, 775, [...lshi, ...klz].join("\n"), 0, 0, "792 kg", "148 COLIS"]
  ]).shipments, { from: "2026-08-01", to: "2026-08-31", company: "DHL", destination: "LSHI" });

  assert.equal(filtered.totals.parcels, 148);
  assert.deepEqual(filtered.totals.destinationParcels, { fih: 0, lshi: 134, klz: 14 });
  assert.deepEqual(filtered.totals.destinationManifestWeightKg, { lshi: 730, klz: 62 });
  assert.equal(filtered.totals.destinationManifestWeightKg.lshi + filtered.totals.destinationManifestWeightKg.klz, filtered.totals.manifestWeightKg);
});

test("ignore les titres GROUPAGE/SAC sans retirer les vrais colis DHL LSHI du 29/09/2026", () => {
  const lshiGroups = [
    [152, 11, 71], [153, 6, 72], [154, 9, 70], [155, 18, 73], [156, 7, 72],
    [157, 12, 92], [158, 41, 96], [159, 12, 64], [160, 14, 80], [161, 32, 78]
  ];
  let lshiCode = 800;
  let klzCode = 166;
  const row = (groupage: number, sac: number, count: number, weight: number, klz: boolean) => {
    const title = klz ? `GROUPAGE ${groupage}(KLZ)SAC${sac}` : `GROUPAGE ${groupage} SAC${sac}`;
    const codes = Array.from({ length: count }, (_, index) => {
      const code = klz ? `SE${klzCode++}26klz` : `SE${lshiCode++}26`;
      return `${code} : ${index === 0 ? weight - count + 1 : 1}kgs`;
    });
    return ["29/09/2026", "DHL", "LSHI", 1, weight, [title, ...codes].join("\n"), 2.96, weight * 2.96, `${weight} kg`, `NBRE DE COLIS : ${count}`, "En Vol"];
  };
  const source = parseShipmentStatistics([
    ["Date"],
    row(150, 1, 12, 79, true),
    row(151, 2, 23, 73, true),
    ...lshiGroups.map(([groupage, count, weight], index) => row(groupage, index + 3, count, weight, false))
  ]);
  const filtered = filterShipmentStatistics(source.shipments, {
    from: "2026-09-29", to: "2026-09-29", company: "DHL", destination: "LSHI", status: "ALL"
  });
  assert.equal(filtered.totals.shipments, 12);
  assert.equal(filtered.totals.parcels, 197);
  assert.deepEqual(filtered.totals.destinationParcels, { fih: 0, lshi: 162, klz: 35 });
  assert.deepEqual(filtered.totals.destinationManifestWeightKg, { lshi: 768, klz: 152 });
  assert.equal(filtered.shipments.flatMap((shipment) => shipment.parcelCodes).filter((code) => code.startsWith("GROUPAGE")).length, 0);
});

test("conserve les vrais codes FIH et les suffixes colis en excluant les titres de groupage", () => {
  const source = parseShipmentStatistics([
    ["Date"],
    ["30/09/2026", "ASKY", "FIH", 1, 7, "GRP 010 SAC2\nSE00326B : 3kgs\nSE00326C : 4kgs", 5, 35, "7 kg", "2 COLIS"],
    ["01/10/2026", "ETHIOPIAN", "LSHI", 1, 5, "GROUPAGE 081 KLZ\nOC00126klz : 5kgs", 5, 25, "5 kg", "1 COLIS"]
  ]);
  const fih = filterShipmentStatistics(source.shipments, { from: "2026-09-30", to: "2026-09-30", company: "ASKY", destination: "FIH" });
  const klz = filterShipmentStatistics(source.shipments, { from: "2026-10-01", to: "2026-10-01", company: "ETHIOPIAN", destination: "LSHI" });
  assert.deepEqual(fih.shipments[0].parcelCodes, ["SE00326B", "SE00326C"]);
  assert.equal(fih.totals.destinationParcels.fih, 2);
  assert.deepEqual(klz.shipments[0].parcelCodes, ["OC00126KLZ"]);
  assert.equal(klz.totals.destinationParcels.klz, 1);
  assert.equal(klz.totals.destinationManifestWeightKg.klz, 5);
});

test("certifie ETHIOPIAN ALL du 17/09/2026 à partir des seuls couples code et poids", () => {
  const lshi = [
    ...Array.from({ length: 94 }, (_, index) => `SE${String(index + 200).padStart(3, "0")}26 : 4kgs`),
    "SE99926 : 61kgs"
  ];
  const klz = [
    ...Array.from({ length: 20 }, (_, index) => `SE${String(index + 100).padStart(3, "0")}26klz : 7kgs`),
    "SE19926klz : 26kgs"
  ];
  const manifestWeights = [32, 32, 34, 32, 35, 33, 32, 33, 34, 35, 33, 33, 33, 33, 32, 33, 33, 41];
  const falseGroupageTitles = ["GROUPAGE081KLZ", "GROUPAGE086KLZ", "GROUPAGE087KLZ"];
  const rows = manifestWeights.map((manifestWeight, index) => [
    "17/09/2026", "ETHIOPIAN", "LSHI", 1, 34,
    [falseGroupageTitles[index], ...(index === 0 ? [...lshi, ...klz] : [])].filter(Boolean).join("\n"),
    5.1, 173.4, `${manifestWeight} kg`, ""
  ]);
  const shipments = parseShipmentStatistics([["Date"], ...rows]).shipments;
  const all = filterShipmentStatistics(shipments, { from: "2026-09-17", to: "2026-09-17", company: "ETHIOPIAN", destination: "ALL" });
  const lshiFilter = filterShipmentStatistics(shipments, { from: "2026-09-17", to: "2026-09-17", company: "ETHIOPIAN", destination: "LSHI" });
  const klzFilter = filterShipmentStatistics(shipments, { from: "2026-09-17", to: "2026-09-17", company: "ETHIOPIAN", destination: "KLZ" });

  assert.equal(all.totals.shipments, 18);
  assert.equal(all.totals.groupages, 18);
  assert.equal(all.totals.weightKg, 612);
  assert.equal(all.totals.manifestWeightKg, 603);
  assert.equal(all.totals.parcels, 116);
  assert.deepEqual(all.totals.destinationParcels, { fih: 0, lshi: 95, klz: 21 });
  assert.deepEqual(all.totals.destinationManifestWeightKg, { lshi: 437, klz: 166 });
  assert.deepEqual(lshiFilter.totals.destinationParcels, all.totals.destinationParcels);
  assert.deepEqual(lshiFilter.totals.destinationManifestWeightKg, all.totals.destinationManifestWeightKg);
  assert.equal(klzFilter.totals.shipments, 0);
  assert.deepEqual(klzFilter.totals.destinationParcels, { fih: 0, lshi: 0, klz: 0 });
});

test("Tous conserve exactement la synthèse existante avant et après une sélection de cohorte", () => {
  const rows = parseShipmentStatistics([["Date"],
    ["07/09/2026", "DHL", "FIH", 1, 70, "AT19526 : 16kgs\nAT19726 : 6kgs\nAT24926 : 13kgs\nSE00426 : 10kgs\nSE00726 : 12kgs\nSE00626 : 9kgs\nSE02726 : 5kgs", 5, 350, "GROUPAGE 1 : 71Kgs", "7 COLIS", "EN VOL"]
  ]).shipments;
  const before = filterShipmentStatistics(rows, { status: "EN VOL" });
  const at = selectShipmentCohort(before.shipments, "2026-08", cohortOf);
  const se = selectShipmentCohort(before.shipments, "2026-09", cohortOf);
  assert.deepEqual(filterShipmentStatistics(rows, { status: "EN VOL" }), before);
  assert.equal(before.totals.weightKg, 70);
  assert.equal(before.totals.manifestWeightKg, 71);
  assert.equal(at.totals.parcels, 3); assert.equal(at.totals.commercialWeightKg, 35);
  assert.equal(se.totals.parcels, 4); assert.equal(se.totals.commercialWeightKg, 36);
  assert.equal(at.totals.commercialWeightKg + se.totals.commercialWeightKg, before.totals.manifestWeightKg);
  assert.equal(at.excludedRows, 0); assert.equal(se.excludedRows, 0);
});

test("combine période, compagnie, destination et transit avant la ventilation", () => {
  const rows = parseShipmentStatistics([["Date"],
    ["03/10/2026", "DHL", "FIH", 1, 20, "SE10126 : 8kgs\nOT10226 : 12kgs", 0, 0, "20 kg", "2 COLIS", "En transit à Addis"],
    ["03/10/2026", "DHL", "LSHI", 1, 5, "SE10126 : 5kgs", 0, 0, "5 kg", "1 COLIS", "EN VOL"],
    ["03/10/2026", "ETHIOPIAN", "LSHI", 1, 7, "SE10126KLZ : 7kgs", 0, 0, "7 kg", "1 COLIS", "EN VOL"],
    ["07/10/2026", "DHL", "FIH", 1, 10, "SE19926 : 10kgs", 0, 0, "10 kg", "1 COLIS", "Arrivé"]
  ]).shipments;
  const period = { from: "2026-10-01", to: "2026-10-05" };
  const fih = selectShipmentCohort(filterShipmentStatistics(rows, { ...period, company: "DHL", destination: "FIH", status: "EN TRANSIT" }).shipments, "2026-09", cohortOf);
  const lshi = selectShipmentCohort(filterShipmentStatistics(rows, { ...period, company: "DHL", destination: "LSHI", status: "EN VOL" }).shipments, "2026-09", cohortOf);
  const klz = selectShipmentCohort(filterShipmentStatistics(rows, { ...period, company: "ETHIOPIAN", destination: "LSHI", status: "EN VOL" }).shipments, "2026-09", cohortOf);
  assert.deepEqual([fih.totals.parcels, fih.totals.commercialWeightKg], [1, 8]);
  assert.deepEqual([lshi.totals.parcels, lshi.totals.commercialWeightKg], [1, 5]);
  assert.deepEqual([klz.totals.parcels, klz.totals.commercialWeightKg], [1, 7]);
  assert.deepEqual(klz.shipments[0]?.parcelCodes, ["SE10126KLZ"]);
});

test("ventile la population cohorte existante par agence sans retirer KLZ des lignes LSHI", () => {
  const rows = parseShipmentStatistics([["Date"],
    ["03/10/2026", "ETHIOPIAN", "LSHI", 1, 7, "SE00126 : 3kgs\nSE00226KLZ : 2kgs", 0, 0, "5 kg", "2 COLIS", "EN VOL"],
    ["03/10/2026", "DHL", "FIH", 1, 6, "SE00326 : 4kgs", 0, 0, "4 kg", "1 COLIS", "EN VOL"]
  ]).shipments;
  const allRows = filterShipmentStatistics(rows, { status: "EN VOL", destination: "ALL" });
  const lshiRows = filterShipmentStatistics(rows, { status: "EN VOL", destination: "LSHI" });
  const allCohort = selectShipmentCohort(allRows.shipments, "2026-09", cohortOf);
  const lshiCohort = selectShipmentCohort(lshiRows.shipments, "2026-09", cohortOf);

  assert.deepEqual([allCohort.totals.parcels, allCohort.totals.commercialWeightKg], [3, 9]);
  assert.deepEqual(allCohort.totals.byAgency, {
    fih: { parcels: 1, commercialWeightKg: 4 },
    lshi: { parcels: 1, commercialWeightKg: 3 },
    klz: { parcels: 1, commercialWeightKg: 2 }
  });
  assert.deepEqual([lshiCohort.totals.parcels, lshiCohort.totals.commercialWeightKg], [2, 5]);
  assert.deepEqual(lshiCohort.totals.byAgency, {
    fih: { parcels: 0, commercialWeightKg: 0 },
    lshi: { parcels: 1, commercialWeightKg: 3 },
    klz: { parcels: 1, commercialWeightKg: 2 }
  });
  assert.equal(Object.values(lshiCohort.totals.byAgency).reduce((sum, item) => sum + item.parcels, 0), lshiCohort.totals.parcels);
  assert.equal(Object.values(lshiCohort.totals.byAgency).reduce((sum, item) => sum + item.commercialWeightKg, 0), lshiCohort.totals.commercialWeightKg);
  assert.deepEqual(filterShipmentStatistics(rows, { status: "EN VOL", destination: "LSHI" }), lshiRows);
});

test("exclut GROUPAGE/SAC, déduplique les codes exacts et conserve les suffixes", () => {
  const rows = parseShipmentStatistics([["Date"],
    ["29/09/2026", "DHL", "LSHI", 1, 8, "GROUPAGE152SAC\nAT00826B : 3kgs\nAT00826 : 5kgs", 0, 0, "8 kg", "2 COLIS"],
    ["30/09/2026", "DHL", "LSHI", 1, 3, "AT00826B : 3kgs", 0, 0, "3 kg", "1 COLIS"],
    ["30/09/2026", "DHL", "FIH", 1, 3, "AT00826B : 3kgs", 0, 0, "3 kg", "1 COLIS"]
  ]).shipments;
  const selected = selectShipmentCohort(rows, "2026-08", cohortOf);
  assert.equal(selected.totals.parcels, 3);
  assert.equal(selected.totals.commercialWeightKg, 14);
  assert.deepEqual(selected.totals.byAgency, {
    fih: { parcels: 1, commercialWeightKg: 3 },
    lshi: { parcels: 2, commercialWeightKg: 11 },
    klz: { parcels: 0, commercialWeightKg: 0 }
  });
  assert.equal(selected.excludedRows, 0);
  assert.deepEqual(selected.shipments[0]?.parcelCodes, ["AT00826B", "AT00826"]);
});

test("écarte seulement le comptage contesté et ne fabrique aucun poids individuel", () => {
  const rows = parseShipmentStatistics([["Date"],
    ["21/09/2026", "ETHIOPIAN", "LSHI", 1, 30, "SE10026 : 14kgs\nSE10126 : 19kgs", 0, 0, "30 kg", "1 COLIS"],
    ["22/09/2026", "DHL", "FIH", 1, 10, "AT10026 : 4kgs\nSE10026 : 7kgs", 0, 0, "10 kg", "2 COLIS"],
    ["23/09/2026", "DHL", "FIH", 1, 4, "SE20026 : poids inconnu", 0, 0, "", "1 COLIS"]
  ]).shipments;
  const se = selectShipmentCohort(rows, "2026-09", cohortOf);
  assert.equal(se.totals.parcels, 2); // Only the uncontested mixed row and the code without weight.
  assert.equal(se.totals.commercialWeightKg, 30); // Only single-cohort I is attributable; blank I is not zero.
  assert.equal(se.excludedRows, 3);
  assert.equal(se.shipments[0]?.parcels, null);
  assert.equal(se.shipments[0]?.commercialWeightKg, 30); // Single-cohort I remains attributable.
  assert.equal(se.shipments[1]?.commercialWeightKg, null);
  assert.equal(se.shipments[2]?.commercialWeightKg, null);
});

test("n'estime pas le poids par agence quand une ligne mêle LSHI et KLZ sans détail certifié", () => {
  const rows = parseShipmentStatistics([["Date"],
    ["04/10/2026", "DHL", "LSHI", 1, 12, "SE00426\nSE00526KLZ", 0, 0, "10 kg", "2 COLIS", "EN TRANSIT A ADDIS"]
  ]).shipments;
  const cohort = selectShipmentCohort(filterShipmentStatistics(rows, { company: "DHL", status: "EN TRANSIT", destination: "LSHI" }).shipments, "2026-09", cohortOf);
  assert.equal(cohort.totals.parcels, 2);
  assert.equal(cohort.totals.commercialWeightKg, 10);
  assert.deepEqual(cohort.totals.byAgency, {
    fih: { parcels: 0, commercialWeightKg: 0 },
    lshi: { parcels: 1, commercialWeightKg: 0 },
    klz: { parcels: 1, commercialWeightKg: 0 }
  });
  assert.deepEqual(cohort.totals.unallocatedAgency, { parcels: 0, commercialWeightKg: 10 });
  assert.equal(cohort.excludedRows, 1);
});
