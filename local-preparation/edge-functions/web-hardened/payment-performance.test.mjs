import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./paiements-agents-enregistrer-paiement/index.ts", import.meta.url),
  "utf8",
);

test("la trace ne contient que des identifiants et durées non sensibles", () => {
  const trace = source.slice(
    source.indexOf("class PaymentPerformanceTrace"),
    source.indexOf("async function finalizePaidExit"),
  );
  assert.match(trace, /event: "payment_operation_performance"/);
  assert.match(trace, /requestId: this\.requestId/);
  assert.match(trace, /agency: this\.agency/);
  assert.match(trace, /durationsMs: this\.durations/);
  assert.doesNotMatch(trace, /token|secret|authorization|serviceRole/i);
});

test("les étapes autorisées sont instrumentées sans changer l'ordre métier", () => {
  for (const step of [
    "edge_auth_profile",
    "validation",
    "begin_orchestration",
    "apps_script_payment",
    "checkpoint",
    "finalize_orchestration",
    "cash",
  ]) {
    assert.match(source, new RegExp(`performanceTrace\\.add\\(\"${step}\"`));
  }

  const begin = source.indexOf('rpc("begin_paid_destination_orchestration"');
  const payment = source.indexOf("const upstreamResponse = await fetch(appsScriptUrl");
  const checkpoint = source.indexOf('rpc("checkpoint_paid_destination_payment"');
  const finalize = source.indexOf("const finalized = await finalizePaidExit");
  assert.ok(begin > 0 && begin < payment);
  assert.ok(payment < checkpoint && checkpoint < finalize);
});

test("les contrats d'idempotence et de sortie restent présents", () => {
  assert.match(source, /const paymentRequestId = normalizePaymentRequestId/);
  assert.match(source, /p_command_fingerprint: commandFingerprint/);
  assert.match(source, /p_request_id: paymentInput\.paymentRequestId/);
  assert.match(source, /finalize_paid_destination_orchestration/);
  assert.match(source, /record_cash_payment_credit/);
});
