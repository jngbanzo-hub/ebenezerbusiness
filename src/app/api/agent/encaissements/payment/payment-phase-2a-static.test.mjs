import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const edge = readFileSync(new URL("../../../../../../local-preparation/edge-functions/web-hardened/paiements-agents-enregistrer-paiement/index.ts", import.meta.url), "utf8");
const edgeNotification = readFileSync(new URL("../../../../../../local-preparation/edge-functions/web-hardened/_shared/paymentNotification.ts", import.meta.url), "utf8");
const apps = readFileSync(new URL("../../../../../../local-preparation/apps-script/payments/unified/Code.gs", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../../../../../features/agent/agent-workspace.tsx", import.meta.url), "utf8");

test("la notification native reste dans Edge et n'est plus dupliquée par Web", () => {
  assert.match(edge, /recordConfirmedPaymentNotification/);
  assert.match(edgeNotification, /PAYMENT:\$\{paymentRequestId\}/);
  assert.doesNotMatch(route, /recordInternalNotification/);
});

test("l'instrumentation Edge distingue les frontières sans réordonner l'orchestration", () => {
  for (const step of ["jwt_validation", "profile_resolution", "agency_validation", "apps_script_fetch_headers", "apps_script_body_read", "apps_script_json_parse", "apps_script_response_validation", "checkpoint", "finalize_orchestration", "notification"]) assert.match(edge, new RegExp(`\\"${step}\\"`));
  assert.ok(edge.indexOf("begin_paid_destination_orchestration") < edge.indexOf("fetch(appsScriptUrl"));
  assert.ok(edge.indexOf("fetch(appsScriptUrl") < edge.indexOf("checkpoint_paid_destination_payment"));
  const mainWrite = edge.slice(edge.indexOf("const upstreamResponse = await fetch"));
  assert.ok(mainWrite.indexOf("checkpoint_paid_destination_payment") < mainWrite.indexOf("finalizePaidExit"));
});

test("Apps Script conserve verrou, anti-doublon, écriture et flush instrumentés", () => {
  assert.match(apps, /LockService\.getScriptLock\(\)/);
  assert.match(apps, /trouverPaiementParRequestId_/);
  assert.match(apps, /\.setValues\(\[valeurs\]\)/);
  assert.match(apps, /SpreadsheetApp\.flush\(\)/);
  for (const step of ["lock_wait", "payment_request_lookup", "parcel_lookup", "sheet_set_values", "spreadsheet_flush", "lock_release"]) assert.match(apps, new RegExp(`\\"${step}\\"`));
});

test("double clic, requestId stable et Auth restent protégés", () => {
  assert.match(workspace, /if \(paymentLockRef\.current\)/);
  assert.match(workspace, /getOrCreatePaymentAttempt/);
  assert.match(workspace, /paymentRequestId: attempt\.paymentRequestId/);
  assert.match(route, /authorizeAgentRequest\(request\)/);
  assert.match(edge, /supabase\.auth\.getUser\(token\)/);
});
