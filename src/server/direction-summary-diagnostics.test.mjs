import assert from "node:assert/strict";
import test from "node:test";
import {
  DirectionSourceTimeoutError,
  classifyDirectionSourceError,
  observeDirectionSource
} from "./direction-summary-diagnostics.ts";

test("source rapide : succès et durée journalisés", async () => {
  const events = [];
  assert.equal(await observeDirectionSource("CAISSE", async () => "ok", { logger: (event) => events.push(event) }), "ok");
  assert.deepEqual(events.map(({ source, event, timeout }) => ({ source, event, timeout })), [
    { source: "CAISSE", event: "START", timeout: false },
    { source: "CAISSE", event: "SUCCESS", timeout: false }
  ]);
  assert.equal(typeof events[1].durationMs, "number");
});

test("timeout distinct d'une erreur réseau", async () => {
  const events = [];
  await observeDirectionSource("STOCK", () => new Promise(() => {}), { timeoutMs: 5, logger: (event) => events.push(event) });
  assert.equal(events.at(-1).errorType, "TIMEOUT");
  assert.equal(events.at(-1).timeout, true);
  assert.equal(classifyDirectionSourceError(new TypeError("fetch failed")).errorType, "RESEAU");
  assert.equal(classifyDirectionSourceError(new DirectionSourceTimeoutError()).errorType, "TIMEOUT");
});

test("401, 403/RLS et variable absente sont distingués", () => {
  assert.equal(classifyDirectionSourceError(Object.assign(new Error("unauthorized"), { httpStatus: 401 })).errorType, "401");
  assert.equal(classifyDirectionSourceError(Object.assign(new Error("permission denied"), { status: 403, code: "42501" })).errorType, "403/SUPABASE_RLS");
  assert.equal(classifyDirectionSourceError(new Error("SUPABASE_SERVICE_NOT_CONFIGURED")).errorType, "VARIABLE_ABSENTE");
});

test("Apps Script, Google Sheets et réponse invalide sont distingués", () => {
  assert.equal(classifyDirectionSourceError(new Error("Le service Dépenses a refusé la lecture Admin.")).errorType, "APPS_SCRIPT");
  assert.equal(classifyDirectionSourceError(new Error("GOOGLE_SHEETS_READ_FAILED")).errorType, "GOOGLE_SHEETS");
  assert.equal(classifyDirectionSourceError(new Error("BILAN_CONTRACT_INVALID")).errorType, "REPONSE_INVALIDE");
});

test("le journal ne contient pas de secret", async () => {
  const events = [];
  await observeDirectionSource("BENEFICE", async () => { throw new Error("Bearer super-secret token=private https://example.test/x"); }, { logger: (event) => events.push(event) });
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /super-secret|private|example\.test/);
  assert.match(serialized, /REDACTED/);
});
