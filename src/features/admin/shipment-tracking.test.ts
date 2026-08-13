import assert from "node:assert/strict";
import test from "node:test";
import { filterShipmentTrackingRows, isShipmentStatus, parseShipmentTrackingRows, shouldCreateArrivalDate, SHIPMENT_STATUSES } from "./shipment-tracking";

const rows = [["Date","Compagnie","Destination","","","Groupage","","","Poids","Total","STATUT GROUPAGE","Date D'Arrivé"],["12/08/2026","ETHIOPIAN","LSHI","","100","ET-12","","","120 KGS","8 COLIS","En Transit","10/08/2026"]];
test("lit K et la vraie date L", () => { assert.deepEqual(parseShipmentTrackingRows(rows)[0], { id: "2:12 08 2026|ETHIOPIAN|LSHI|ET 12", identity: "12 08 2026|ETHIOPIAN|LSHI|ET 12", rowNumber: 2, date: "12/08/2026", company: "ETHIOPIAN", destination: "LSHI", groupage: "ET-12", totalWeight: "100", manifestWeight: "8 COLIS", parcelCount: "8", status: "En Transit", arrivalDate: "10/08/2026" }); });
test("autorise uniquement le nouveau menu", () => { assert.equal(SHIPMENT_STATUSES.includes("En Transit" as never), false); assert.equal(isShipmentStatus("En Transit à Addis"), true); assert.equal(isShipmentStatus("En Transit"), false); });
test("filtre les groupages", () => { assert.equal(filterShipmentTrackingRows(parseShipmentTrackingRows(rows), { from: "2026-08-12", to: "2026-08-12", company: "ETHIOPIAN", search: "et-12" }).length, 1); });
test("crée L uniquement lors d'une vraie transition vers Arrivé avec L vide", () => {
  assert.equal(shouldCreateArrivalDate("En Vol", "", "Arrivé"), true);
  assert.equal(shouldCreateArrivalDate("Arrivé", "10/08/2026", "Arrivé"), false);
  assert.equal(shouldCreateArrivalDate("Arrivé", "", "Arrivé"), false);
  assert.equal(shouldCreateArrivalDate("Arrivé", "10/08/2026", "En Transit à Lubumbashi"), false);
  assert.equal(shouldCreateArrivalDate("En Transit à Addis", "", "En Vol"), false);
});
