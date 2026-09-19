import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createAutomaticRequestId,
  getOrCreateRequestIdAttempt
} from "./request-id-attempt";

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("génère 1 000 UUID v4 uniques", () => {
  const requestIds = Array.from({ length: 1_000 }, createAutomaticRequestId);
  assert.equal(new Set(requestIds).size, 1_000);
  assert.equal(requestIds.every((requestId) => uuidV4.test(requestId)), true);
});

test("conserve le requestId pour une reprise identique", () => {
  const first = getOrCreateRequestIdAttempt(null, "same-command");
  const retry = getOrCreateRequestIdAttempt(first, "same-command");
  assert.strictEqual(retry, first);
  assert.equal(retry.requestId, first.requestId);
});

test("renouvelle le requestId après succès ou changement de contenu", () => {
  const first = getOrCreateRequestIdAttempt(null, "command-a");
  const afterSuccess = getOrCreateRequestIdAttempt(null, "command-a");
  const changed = getOrCreateRequestIdAttempt(first, "command-b");
  assert.notEqual(afterSuccess.requestId, first.requestId);
  assert.notEqual(changed.requestId, first.requestId);
});

test("les deux formulaires gardent le requestId hors de l'interface", () => {
  const expense = readFileSync(new URL("./agent-expense-form.tsx", import.meta.url), "utf8");
  const deposit = readFileSync(new URL("./coo-deposit-agent-action.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(expense, /Expense Request ID|placeholder=["']Request ID/);
  assert.doesNotMatch(deposit, />\s*Request ID\s*</);
  assert.match(expense, /getOrCreateRequestIdAttempt/);
  assert.match(deposit, /getOrCreateRequestIdAttempt/);
});
