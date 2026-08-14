import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const performanceSource = readFileSync(new URL("./operation-performance.ts", import.meta.url), "utf8");
const paymentRoute = readFileSync(new URL("../app/api/agent/encaissements/payment/route.ts", import.meta.url), "utf8");
const expenseRoute = readFileSync(new URL("../app/api/agent/expenses/route.ts", import.meta.url), "utf8");

test("journalise uniquement les métadonnées de performance autorisées", () => {
  assert.match(performanceSource, /type: "operation_performance"/);
  assert.match(performanceSource, /requestId: safeLabel/);
  assert.match(performanceSource, /durationsMs/);
  assert.doesNotMatch(performanceSource, /token|jwt|privateKey|apiKey|password/i);
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
