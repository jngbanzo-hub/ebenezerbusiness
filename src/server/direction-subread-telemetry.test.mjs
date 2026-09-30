import assert from "node:assert/strict";
import test from "node:test";
import { measureDirectionSubread, traceDirectionSource } from "./direction-subread-telemetry.ts";

test("la télémétrie restitue la valeur et journalise seulement les métadonnées", async () => {
  const logs = [];
  const original = console.info;
  console.info = (...args) => logs.push(args);
  try {
    const result = await traceDirectionSource("CAISSE", () => measureDirectionSubread("cash_accounts", async () => [{ phone: "SENSITIVE_RECIPIENT", balance: 42 }], (rows) => ({ rows: rows.length })));
    assert.deepEqual(result, [{ phone: "SENSITIVE_RECIPIENT", balance: 42 }]);
    assert.equal(logs.length, 2);
    assert.equal(logs[1][1].source, "CAISSE");
    assert.equal(logs[1][1].status, "SUCCESS");
    assert.equal(logs[1][1].rows, 1);
    assert.equal(typeof logs[1][1].duration_ms, "number");
    assert.doesNotMatch(JSON.stringify(logs), /SENSITIVE_RECIPIENT|balance/);
  } finally {
    console.info = original;
  }
});

test("une erreur reste propagée sans contenu sensible dans le journal", async () => {
  const logs = [];
  const original = console.info;
  console.info = (...args) => logs.push(args);
  try {
    await assert.rejects(traceDirectionSource("STOCK", () => measureDirectionSubread("stockage_events", () => { throw new Error("secret-token"); })), /secret-token/);
    assert.equal(logs[1][1].status, "FAILURE");
    assert.doesNotMatch(JSON.stringify(logs), /secret-token/);
  } finally {
    console.info = original;
  }
});

test("un échec de journalisation ne change jamais le résultat métier", async () => {
  const original = console.info;
  console.info = () => { throw new Error("LOG_UNAVAILABLE"); };
  try {
    const result = await traceDirectionSource("BENEFICE", () => measureDirectionSubread("FIH", async () => ({ rows: [1] }), () => { throw new Error("COUNT_UNAVAILABLE"); }));
    assert.deepEqual(result, { rows: [1] });
  } finally {
    console.info = original;
  }
});
