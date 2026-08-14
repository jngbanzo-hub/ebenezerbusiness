import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const performanceSource = readFileSync(new URL("./operation-performance.ts", import.meta.url), "utf8");
const paymentRoute = readFileSync(new URL("../app/api/agent/encaissements/payment/route.ts", import.meta.url), "utf8");
const expenseRoute = readFileSync(new URL("../app/api/agent/expenses/route.ts", import.meta.url), "utf8");
const shipmentRoute = readFileSync(new URL("../app/api/admin/shipment-tracking/route.ts", import.meta.url), "utf8");
const shipmentServer = readFileSync(new URL("./admin-shipment-tracking.ts", import.meta.url), "utf8");
const shipmentPage = readFileSync(new URL("../features/admin/shipment-tracking-page.tsx", import.meta.url), "utf8");

test("journalise uniquement les métadonnées de performance autorisées", () => {
  assert.match(performanceSource, /type: "operation_performance"/);
  assert.match(performanceSource, /requestId: safeLabel/);
  assert.match(performanceSource, /durationsMs/);
  assert.doesNotMatch(performanceSource, /token|jwt|privateKey|apiKey|password/i);
});

test("instrumente le PATCH expéditions sans modifier son flux séquentiel", () => {
  for (const step of ["auth_session", "validation_zod_statut", "validation_selection", "construction_reponse"]) assert.match(shipmentRoute, new RegExp(step));
  for (const step of ["google_token", "lecture_google", "validation_identite", "ecriture_google", "relecture_google"]) assert.match(shipmentServer, new RegExp(step));
  assert.match(shipmentPage, /shipment_tracking_update_individual/);
  assert.match(shipmentPage, /shipment_tracking_update_batch/);
  assert.match(shipmentPage, /apiMs/);
  assert.match(shipmentPage, /totalMs/);
  assert.doesNotMatch(`${shipmentRoute}\n${shipmentServer}`, /values:batchUpdate|retry|Promise\.all/);
});

test("confirme les statuts par une seule relecture ciblée de K", () => {
  assert.match(shipmentServer, /values:batchGet/);
  assert.match(shipmentServer, /query\.append\("ranges", `\$\{SHIPMENT_TRACKING_SHEET\}!K\$\{rowNumber\}`\)/);
  assert.match(shipmentRoute, /updateShipmentStatuses\(uniqueItems/);
  assert.doesNotMatch(shipmentServer, /parseShipmentTrackingRows\(after/);
});

test("instrumente les deux écritures sans retry", () => {
  for (const source of [paymentRoute, expenseRoute]) {
    assert.match(source, /Server-Timing/);
    assert.match(source, /auth_session/);
    assert.doesNotMatch(source, /retry|setTimeout/);
  }
  assert.match(paymentRoute, /notification/);
  assert.match(expenseRoute, /notification/);
});
