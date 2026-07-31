import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("./", import.meta.url);
const migration = await readFile(new URL("004_cash_payment_credit_rpc.sql", root), "utf8");
const rollback = await readFile(new URL("004_cash_payment_credit_rpc.rollback.sql", root), "utf8");

test("RPC atomique réservé au service_role", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /grant execute[\s\S]+to service_role/i);
  assert.match(migration, /revoke all[\s\S]+from public, anon, authenticated/i);
});

test("un seul crédit par requestId et par colis", () => {
  assert.match(migration, /source_request_id = lower\(btrim\(p_payment_request_id\)\)/i);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /PAYMENT_ALREADY_CREDITED/);
  assert.match(migration, /PAYMENT_CREDIT_RECORDED/);
});

test("COO est exclu et USD reste canonique", () => {
  assert.match(migration, /p_agency not in \('FIH', 'LSHI', 'KLZ'\)/);
  assert.match(migration, /'USD'/);
  assert.doesNotMatch(migration, /EXPENSE_DEBIT_RECORDED/);
});

test("rollback strictement limité à la fonction", () => {
  assert.match(rollback, /drop function if exists public\.record_cash_payment_credit/i);
  assert.doesNotMatch(rollback, /drop table|delete from|truncate/i);
});
