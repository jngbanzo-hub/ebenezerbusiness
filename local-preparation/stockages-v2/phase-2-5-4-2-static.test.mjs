import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const edge = read("local-preparation/edge-functions/web-hardened/paiements-agents-enregistrer-paiement/index.ts");
const apps = read("local-preparation/apps-script/payments/unified/Code.gs");
const server = read("src/server/stockages-forwarding.ts");
const route = read("src/app/api/agent/stockages/forwardings/route.ts");
const routing = read("src/server/inter-agency-routing.ts");
const sql = read("local-preparation/supabase/stockages-v2/009_paid_exit_forwarding_orchestration.sql");

test("le navigateur ne peut fournir aucun contexte dérivé", () => {
  assert.match(route, /new Set\(\["trackingCode", "sourceAgency", "paymentMode", "optionalReference", "optionalObservation", "paymentRequestId"\]\)/);
  for (const key of ["operationContext", "collectionSiteCode", "forwardingDestinationCode", "forwardingReference", "amountPaid", "rate", "weight"]) {
    assert.doesNotMatch(route, new RegExp(`body\\.${key}`));
  }
});

test("le contexte interne est signé et vérifié avant d'être accepté", () => {
  assert.match(server, /PAYMENTS_ORCHESTRATION_HMAC_SECRET/);
  assert.match(edge, /PAYMENTS_ORCHESTRATION_HMAC_SECRET/);
  assert.doesNotMatch(server, /orchestrationKey = process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(edge, /const key = Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(server, /createHmac\("sha256", orchestrationKey\)/);
  assert.match(server, /X-Ebe-Orchestration-Timestamp/);
  assert.match(server, /X-Ebe-Orchestration-Signature/);
  assert.match(edge, /verifyInternalOrchestration\(request, body\)/);
  assert.match(edge, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(edge, /constantTimeEqual/);
});

test("source, encaissement et destination sont séparés de bout en bout", () => {
  for (const field of ["sourceDestinationCode", "collectionSiteCode", "forwardingDestinationCode", "operationType"]) {
    assert.match(`${server}\n${edge}`, new RegExp(field));
    assert.match(`${edge}\n${apps}`, new RegExp(field));
  }
  assert.match(apps, /rechercherColisSource_\(\s*paiement\.sourceDestinationCode/);
  assert.match(apps, /getSheetByName\(\s*paiement\.agenceEncaissement/);
  assert.match(edge, /const cashAgency = agenceEncaissement === "COO" \? null : agenceEncaissement/);
});

test("les paiements standards gardent leur circuit historique", () => {
  assert.match(edge, /type: "STANDARD_PAYMENT"/);
  assert.match(apps, /operationType === "STANDARD_PAYMENT"/);
  assert.match(apps, /agenceEncaissement === "COO" \|\| agenceEncaissement === destinationCode/);
});

test("le rejeu après perte réseau ne produit pas une seconde ligne", () => {
  assert.match(apps, /reconstruireRejeuAcheminement_/);
  assert.match(apps, /"IDEMPOTENCY_CONFLICT"/);
  assert.match(apps, /replayed: true/);
  assert.match(server, /NETWORK_RESULT_UNKNOWN/);
});

test("tous les statuts source admissibles sont alignés", () => {
  for (const status of ["EN ATTENTE", "ENREGISTRE", "EN VOL", "EN TRANSIT", "ARRIVE"]) {
    assert.ok(routing.includes(`"${status}"`));
    assert.ok(sql.includes(`'${status}'`));
  }
  const eligibleList = routing.slice(
    routing.indexOf("INTER_AGENCY_ELIGIBLE_SOURCE_STATUSES"),
    routing.indexOf("] as const")
  );
  for (const status of ["LIVRE", "SORTI", "ANNULE"]) assert.doesNotMatch(eligibleList, new RegExp(`"${status}"`));
});

test("la migration 009 reste préparatoire et non auto-transactionnelle", () => {
  assert.doesNotMatch(sql, /^\s*(begin|commit)\s*;/gim);
});
