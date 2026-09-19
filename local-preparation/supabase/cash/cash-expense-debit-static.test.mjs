import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("./", import.meta.url);
const migration = await readFile(new URL("005_cash_expense_debit_rpc.sql", root), "utf8");
const rollback = await readFile(new URL("005_cash_expense_debit_rpc.rollback.sql", root), "utf8");

test("RPC débit atomique réservée au service_role", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /grant execute[\s\S]+to service_role/i);
  assert.match(migration, /revoke all[\s\S]+from public, anon, authenticated/i);
});

test("idempotence par expenseRequestId et unicité de la dépense", () => {
  assert.match(migration, /source_request_id = lower\(btrim\(p_expense_request_id\)\)/i);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /EXPENSE_ALREADY_DEBITED/);
  assert.match(migration, /EXPENSE_CONFIRMATION_REQUIRED/);
  assert.match(migration, /p_allow_create is not true/i);
  assert.match(migration, /EXPENSE_DEBIT_RECORDED/);
  assert.match(migration, /'EXPENSE_ENGINE'/);
});

test("USD et FIH LSHI KLZ uniquement, sans COO", () => {
  assert.match(migration, /p_agency not in \('FIH', 'LSHI', 'KLZ'\)/);
  assert.match(migration, /'USD'/);
  assert.doesNotMatch(migration, /PAYMENT_CREDIT_RECORDED/);
});

test("historique immutable et corrections hors de la RPC", () => {
  assert.doesNotMatch(migration, /update public\.cash_events|delete from public\.cash_events/i);
  assert.doesNotMatch(migration, /CASH_CORRECTION_RECORDED/);
  assert.match(rollback, /drop function if exists public\.record_cash_expense_debit/i);
  assert.doesNotMatch(rollback, /drop table|delete from|truncate/i);
});
