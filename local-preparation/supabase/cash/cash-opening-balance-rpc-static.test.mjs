import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./007_cash_opening_balance_rpc.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("./007_cash_opening_balance_rpc.rollback.sql", import.meta.url), "utf8");

test("l'ouverture Caisse est une RPC serveur atomique", () => {
  assert.match(sql, /create or replace function public\.open_cash_account/);
  assert.match(sql, /language plpgsql\s+security definer/i);
  assert.match(sql, /set search_path = pg_catalog, public, extensions/i);
  assert.match(sql, /from public\.cash_accounts\s+where agency = v_agency\s+for update/i);
  assert.match(sql, /insert into public\.cash_events/);
  assert.match(sql, /update public\.cash_accounts\s+set status = 'ACTIVE'/i);
  assert.match(sql, /insert into public\.cash_admin_audit/);
});

test("l'ouverture vérifie Admin, agence, USD implicite et compte SUSPENDED", () => {
  assert.match(sql, /upper\(btrim\(v_admin\.role\)\) <> 'ADMIN'/);
  assert.match(sql, /v_agency not in \('FIH', 'LSHI', 'KLZ'\)/);
  assert.match(sql, /v_account\.currency <> 'USD'/);
  assert.match(sql, /v_account\.status <> 'SUSPENDED'/);
  assert.match(sql, /SECOND_OPENING_NOT_ALLOWED/);
});

test("l'idempotence et la concurrence refusent les doublons", () => {
  assert.match(sql, /where request_id = p_request_id/);
  assert.match(sql, /IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /'replayed', true/);
  assert.match(sql, /event_type = 'OPENING_BALANCE_RECORDED'/);
  assert.match(sql, /ACCOUNT_VERSION_CONFLICT/);
});

test("l'Audit immutable reçoit les informations obligatoires", () => {
  for (const marker of ["OPEN_CASH_ACCOUNT", "eventId", "businessDate", "commandFingerprint", "SUSPENDED", "ACTIVE", "SUCCESS"]) {
    assert.match(sql, new RegExp(marker));
  }
  assert.match(sql, /v_reason, p_actor_id, btrim\(v_admin\.nom\), v_opened_at, p_request_id/);
});

test("les droits sont serveur uniquement et le rollback est ciblé", () => {
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
  assert.match(rollback, /drop function if exists public\.open_cash_account/);
  assert.doesNotMatch(rollback, /drop table|delete from|truncate/i);
});
