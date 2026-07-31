import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hardening = readFileSync(new URL("./003_cash_privileges_hardening.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("./003_cash_privileges_hardening.rollback.sql", import.meta.url), "utf8");
const validation = readFileSync(new URL("./003_cash_privileges_hardening.validate.sql", import.meta.url), "utf8");
const hardeningSql = hardening.replace(/^--.*$/gm, "");
const rollbackSql = rollback.replace(/^--.*$/gm, "");
const views = ["cash_current_balances", "cash_current_day", "cash_daily_history", "cash_agent_payment_details", "cash_agency_totals", "cash_anomalies", "cash_coo_revenue_outside_cash"];

test("durcit exactement les sept vues", () => {
  for (const view of views) assert.match(hardening, new RegExp(`public\\.${view}`));
  assert.match(hardening, /revoke all privileges[\s\S]+from authenticated, service_role/i);
  assert.match(hardening, /grant select[\s\S]+to authenticated, service_role/i);
});

test("accorde au service serveur uniquement les droits nécessaires par table", () => {
  assert.match(hardening, /grant select, insert, update on table public\.cash_accounts to service_role/i);
  for (const table of ["cash_events", "cash_daily_closures", "cash_admin_audit"]) {
    assert.match(hardening, new RegExp(`grant select, insert on table public\\.${table} to service_role`, "i"));
    assert.doesNotMatch(hardening, new RegExp(`grant[^;]*(update|delete|truncate)[^;]*public\\.${table}`, "i"));
  }
});

test("ne modifie ni objets, RLS, triggers, contraintes ou données", () => {
  assert.doesNotMatch(hardeningSql, /\b(create|alter|drop|insert into|update\s+public|delete from|truncate)\b/i);
  assert.doesNotMatch(hardeningSql, /\bpolicy\b|row level security|\btrigger\b|\bconstraint\b/i);
  assert.doesNotMatch(hardeningSql, /public\.agents|auth\.users/i);
});

test("rollback restaure strictement les privilèges complets constatés", () => {
  assert.match(rollback, /PREPARATORY ROLLBACK ONLY/);
  assert.match(rollback, /grant all privileges[\s\S]+to authenticated, service_role/i);
  assert.match(rollback, /grant all privileges[\s\S]+to service_role/i);
  assert.doesNotMatch(rollbackSql, /\b(create|alter|drop|insert into|update\s+public|delete from|truncate)\b/i);
});

test("validation est read-only et contrôle droits exacts et tables vides", () => {
  assert.match(validation, /set transaction read only/i);
  assert.match(validation, /is_conform/i);
  assert.match(validation, /grantee in \('anon', 'PUBLIC'\)/i);
  for (const table of ["cash_accounts", "cash_events", "cash_daily_closures", "cash_admin_audit"]) {
    assert.match(validation, new RegExp(`count\\(\\*\\) from public\\.${table}`));
  }
  assert.doesNotMatch(validation, /\b(create|alter|drop|insert into|update\s+public|delete from|truncate|grant|revoke)\b/i);
});

test("aucun secret ni endpoint n'est présent", () => {
  const content = `${hardening}\n${rollback}\n${validation}`;
  assert.doesNotMatch(content, /https?:\/\//i);
  assert.doesNotMatch(content, /(api[_-]?key|service[_-]?role[_-]?key|password|private[_-]?key|bearer\s+[A-Za-z0-9])/i);
});
