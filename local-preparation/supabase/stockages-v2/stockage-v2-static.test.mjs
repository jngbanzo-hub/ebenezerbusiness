import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const sqlFiles = readdirSync(here).filter((name) => name.endsWith(".sql"));
const read = (name) => readFileSync(join(here, name), "utf8");
const all = sqlFiles.map(read).join("\n");

test("le schéma contient exactement les cinq tables Stockages V2", () => {
  const schema = read("001_stockage_schema.sql");
  for (const table of ["stockage_accounts", "stockage_events", "stockage_parcels", "stockage_admin_audit", "stockage_anomalies"]) {
    assert.match(schema, new RegExp(`create table public\\.${table}\\b`, "i"));
  }
  assert.equal((schema.match(/create table public\./gi) ?? []).length, 5);
});

test("COO et les colonnes financières sont exclus du schéma", () => {
  const schema = read("001_stockage_schema.sql");
  assert.doesNotMatch(schema, /agency\s+in\s*\([^)]*(?:COO|COTONOU)/i);
  assert.doesNotMatch(schema, /\b(?:amount|currency|payment_status)\s+[a-z]/i);
});

test("les compteurs, poids et versions sont protégés", () => {
  const schema = read("001_stockage_schema.sql");
  assert.match(schema, /current_parcel_count\s*>=\s*0/i);
  assert.match(schema, /current_weight_kg\s*>=\s*0/i);
  assert.match(schema, /version\s*>\s*0/i);
  assert.match(schema, /unique \(account_id, account_version_after\)/i);
});

test("la livraison est unique et verrouille colis puis compte", () => {
  const delivery = read("006_stockage_delivery_rpc.sql");
  assert.match(read("001_stockage_schema.sql"), /unique index stockage_events_delivery_unique/i);
  const parcelLock = delivery.indexOf("from public.stockage_parcels where tracking_code=v_code for update");
  const accountLock = delivery.indexOf("from public.stockage_accounts where agency=v_agency for update");
  assert.ok(parcelLock >= 0 && accountLock > parcelLock);
});

test("les arrivages verrouillent seulement leur compte agence", () => {
  const arrival = read("005_stockage_arrival_rpc.sql");
  assert.match(arrival, /where agency=v_agency for update/i);
  assert.doesNotMatch(arrival, /pg_advisory_lock|lock table/i);
});

test("les événements et l'Audit refusent UPDATE et DELETE", () => {
  const schema = read("001_stockage_schema.sql");
  assert.match(schema, /before update or delete on public\.stockage_events/i);
  assert.match(schema, /before update or delete on public\.stockage_admin_audit/i);
});

test("RLS est activée et forcée sur toutes les tables", () => {
  const rls = read("002_stockage_rls_and_views.sql");
  for (const table of ["stockage_accounts", "stockage_events", "stockage_parcels", "stockage_admin_audit", "stockage_anomalies"]) {
    assert.match(rls, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(rls, new RegExp(`alter table public\\.${table} force row level security`, "i"));
  }
});

test("aucune écriture navigateur et RPC service_role seulement", () => {
  const privileges = read("003_stockage_privileges_hardening.sql");
  assert.doesNotMatch(privileges, /grant\s+(?:insert|update|delete|truncate|all)[\s\S]{0,120}\bauthenticated\b/i);
  for (const rpc of ["004_stockage_opening_rpc.sql", "005_stockage_arrival_rpc.sql", "006_stockage_delivery_rpc.sql", "007_stockage_admin_controls_rpc.sql"]) {
    const body = read(rpc);
    assert.match(body, /revoke all on function[\s\S]*from public, anon, authenticated/i);
    assert.match(body, /grant execute on function[\s\S]*to service_role/i);
  }
});

test("les huit vues existent et n'utilisent aucune date implicite", () => {
  const rls = read("002_stockage_rls_and_views.sql");
  for (const view of ["stockage_current_balances", "stockage_current_day", "stockage_arrivals_history", "stockage_deliveries_history", "stockage_agent_activity", "stockage_agency_totals", "stockage_anomalies_open", "stockage_admin_audit_view"]) {
    assert.match(rls, new RegExp(`create view public\\.${view}\\b`, "i"));
  }
  assert.doesNotMatch(rls, /\bcurrent_date\b|\bnow\s*\(/i);
  assert.match(rls, /security_invoker\s*=\s*true/i);
});

test("les anomalies prévues sont enregistrables par une RPC serveur", () => {
  const schema = read("001_stockage_schema.sql");
  const admin = read("007_stockage_admin_controls_rpc.sql");
  for (const type of ["WEIGHT_MISSING", "WEIGHT_AMBIGUOUS", "WEIGHT_CONFLICT", "AGENCY_MISMATCH", "INSUFFICIENT_STOCK", "PARCEL_NOT_FOUND", "DUPLICATE_DELIVERY_ATTEMPT", "IDEMPOTENCY_CONFLICT", "VERSION_CONFLICT"]) {
    assert.match(schema, new RegExp(type));
  }
  assert.match(admin, /function public\.record_stockage_anomaly/i);
});

test("le test transactionnel se termine par ROLLBACK", () => {
  const transactional = read("stockage_v2.transactional-tests.sql").trim();
  assert.match(transactional, /^--[\s\S]*\bbegin\s*;/i);
  assert.match(transactional, /rollback;$/i);
});

test("aucun secret, paiement automatique ou dépendance MANIFESTE n'est introduit", () => {
  assert.doesNotMatch(all, /service_role_key|api[_-]?key\s*=|password\s*=|bearer\s+[a-z0-9]/i);
  assert.doesNotMatch(all, /from\s+public\.(?:payments|manifeste)|insert\s+into\s+public\.(?:payments|manifeste)/i);
});
