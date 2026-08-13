import assert from "node:assert/strict";
import test from "node:test";
import { filterShipmentTrackingRows, isShipmentStatus, parseShipmentTrackingRows, SHIPMENT_STATUSES } from "./shipment-tracking";

const rows = [["Date","Compagnie","Destination","","","Groupage","","","Poids","Total","STATUT GROUPAGE"],["12/08/2026","ETHIOPIAN","LSHI","","100","ET-12","","","120 KGS","8 COLIS","En Transit"]];
test("lit K sans altérer l'ancien statut historique", () => { assert.deepEqual(parseShipmentTrackingRows(rows)[0], { id: "2:12 08 2026|ETHIOPIAN|LSHI|ET 12", identity: "12 08 2026|ETHIOPIAN|LSHI|ET 12", rowNumber: 2, date: "12/08/2026", company: "ETHIOPIAN", destination: "LSHI", groupage: "ET-12", totalWeight: "100", manifestWeight: "8 COLIS", parcelCount: "8", status: "En Transit" }); });
test("autorise uniquement le nouveau menu", () => { assert.equal(SHIPMENT_STATUSES.includes("En Transit" as never), false); assert.equal(isShipmentStatus("En Transit à Addis"), true); assert.equal(isShipmentStatus("En Transit"), false); });
test("filtre les groupages", () => { assert.equal(filterShipmentTrackingRows(parseShipmentTrackingRows(rows), { from: "2026-08-12", to: "2026-08-12", company: "ETHIOPIAN", search: "et-12" }).length, 1); });
