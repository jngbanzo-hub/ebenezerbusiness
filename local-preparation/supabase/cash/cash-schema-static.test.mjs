import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("./001_cash_schema.sql", import.meta.url), "utf8");
const security = readFileSync(new URL("./002_cash_rls_and_views.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("./002_cash_schema.rollback.sql", import.meta.url), "utf8");
const documentation = readFileSync(new URL("./README.md", import.meta.url), "utf8");
const all = `${schema}\n${security}\n${rollback}\n${documentation}`;

test("limite les comptes de caisse à FIH, LSHI et KLZ en USD", () => {
  assert.match(schema, /agency in \('FIH', 'LSHI', 'KLZ'\)/);
  assert.match(schema, /unique[\s\S]*agency|agency text not null unique/i);
  assert.match(schema, /currency = 'USD'/);
  const accountTable = schema.match(/create table public\.cash_accounts[\s\S]+?\n\);/)?.[0] ?? "";
  assert.doesNotMatch(accountTable, /COO|COTONOU/);
});

test("crée les quatre tables et les cinq événements métier", () => {
  for (const table of ["cash_accounts", "cash_events", "cash_daily_closures", "cash_admin_audit"]) {
    assert.match(schema, new RegExp(`create table public\\.${table}`));
  }
  for (const eventType of ["OPENING_BALANCE_RECORDED", "PAYMENT_CREDIT_RECORDED", "EXPENSE_DEBIT_RECORDED", "ADMIN_ADJUSTMENT_RECORDED", "CASH_CORRECTION_RECORDED"]) {
    assert.match(schema, new RegExp(eventType));
  }
});

test("garantit idempotence, versions et clôture active unique", () => {
  assert.match(schema, /unique \(source_type, source_id\)/i);
  assert.match(schema, /unique \(source_type, source_request_id\)/i);
  assert.match(schema, /unique \(cash_account_id, version_after\)/i);
  assert.match(schema, /cash_daily_closures_one_active_idx/i);
  assert.match(schema, /where status = 'CLOSED'/i);
});

test("rend événements, clôtures et audits immutables", () => {
  assert.match(schema, /before update or delete on public\.cash_events/i);
  assert.match(schema, /before update or delete on public\.cash_daily_closures/i);
  assert.match(schema, /before update or delete on public\.cash_admin_audit/i);
  assert.match(schema, /CASH_RECORD_IMMUTABLE/);
});

test("impose les corrections compensatoires et l'audit Admin", () => {
  assert.match(schema, /corrected_event_id is not null and reason is not null and btrim\(reason\) <> ''/i);
  for (const field of ["previous_value", "new_value", "reason", "admin_user_id", "occurred_at", "request_id"]) {
    assert.match(schema, new RegExp(field));
  }
});

test("empêche une divergence entre compte et agence", () => {
  assert.match(schema, /cash_events_account_agency_fk[\s\S]+references public\.cash_accounts\(id, agency\)/i);
  assert.match(schema, /cash_closures_account_agency_fk[\s\S]+references public\.cash_accounts\(id, agency\)/i);
});

test("active et force RLS sur toutes les tables", () => {
  for (const table of ["cash_accounts", "cash_events", "cash_daily_closures", "cash_admin_audit"]) {
    assert.match(security, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(security, new RegExp(`alter table public\\.${table} force row level security`));
  }
});

test("accorde uniquement SELECT au navigateur authentifié", () => {
  assert.match(security, /grant select[\s\S]+to authenticated/i);
  assert.doesNotMatch(security, /grant\s+(insert|update|delete)[^;]+to authenticated/i);
  assert.match(security, /revoke all[\s\S]+from public, anon, authenticated/i);
});

test("calcule l'accès depuis le profil serveur et réserve l'Audit à Admin", () => {
  assert.match(security, /p\.id = auth\.uid\(\)/);
  assert.match(security, /p\.actif is true/);
  assert.match(security, /upper\(trim\(p\.role\)\) = 'AGENT'/);
  assert.match(security, /upper\(trim\(p\.role\)\) = 'ADMIN'/);
  assert.match(security, /cash_audit_admin_read/);
});

test("prévoit toutes les vues, avec COO séparé et sans caisse COO", () => {
  for (const view of ["cash_current_balances", "cash_current_day", "cash_daily_history", "cash_agent_payment_details", "cash_agency_totals", "cash_anomalies", "cash_coo_revenue_outside_cash"]) {
    assert.match(security, new RegExp(`create view public\\.${view}`));
  }
  assert.match(security, /cash_coo_revenue_outside_cash[\s\S]+where false/i);
  assert.match(security, /security_invoker = true/g);
});

test("exige une date métier serveur explicite pour la journée courante", () => {
  const currentDayView = security.match(
    /create view public\.cash_current_day[\s\S]+?group by e\.agency, e\.business_date;/i,
  )?.[0] ?? "";
  assert.match(currentDayView, /e\.business_date/i);
  assert.doesNotMatch(currentDayView, /current_date/i);
  assert.doesNotMatch(currentDayView, /\bnow\s*\(/i);
  assert.match(documentation, /Africa\/Porto-Novo/);
  assert.match(documentation, /filtre explicite `business_date = <date métier>`/i);
  assert.match(documentation, /requête sans date métier[\s\S]+refusée/i);
  assert.doesNotMatch(currentDayView, /\bUTC\b/i);
});

test("documente verrou transactionnel, Sheets non autoritaire et rollback prudent", () => {
  assert.match(documentation, /SELECT \.\.\. FOR UPDATE/);
  assert.match(documentation, /Google Sheets sera unidirectionnel et non autoritaire/i);
  assert.match(rollback, /PREPARATORY ROLLBACK ONLY/);
  assert.match(rollback, /-- drop table if exists public\.cash_accounts/i);
});

test("reste préparatoire, sans données, secret ni exécution distante", () => {
  assert.match(schema, /PREPARATORY ONLY/);
  assert.doesNotMatch(all, /insert\s+into/i);
  assert.doesNotMatch(all, /https?:\/\//i);
  assert.doesNotMatch(all, /(api[_-]?key|service[_-]?role[_-]?key|password|private[_-]?key|bearer\s+[A-Za-z0-9])/i);
});
