import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const preflight = read("00_preflight_read_only.sql");
const postcheck = read("01_post_migration_read_only.sql");
const transaction = read("02_transactional_verification.sql");
const runbook = read("README.md");

function executableSql(source) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function executableKeywords(source) {
  return executableSql(source).replace(/'(?:''|[^'])*'/g, "''");
}

const mutationPattern =
  /\b(create|alter|drop|truncate|insert|update|delete|upsert|grant|revoke|execute|do)\b/i;

test("le préflight est strictement en lecture seule", () => {
  assert.doesNotMatch(executableKeywords(preflight), mutationPattern);
  assert.match(preflight, /information_schema\.columns/i);
  assert.match(preflight, /from public\.agents/i);
  assert.match(preflight, /left join auth\.users/i);
});

test("le préflight vérifie agences, rôles, activité et identités", () => {
  assert.match(preflight, /when 'COTONOU' then 'COO'/i);
  assert.match(preflight, /unexpected_roles/i);
  assert.match(preflight, /profile_activity/i);
  assert.match(preflight, /orphan_agent_profiles/i);
});

test("le post-check est strictement en lecture seule", () => {
  assert.doesNotMatch(executableKeywords(postcheck), mutationPattern);
  assert.match(postcheck, /pg_policies/i);
  assert.match(postcheck, /role_table_grants/i);
  assert.match(postcheck, /relrowsecurity/i);
  assert.match(postcheck, /relforcerowsecurity/i);
});

test("le post-check couvre contraintes, index et privilèges", () => {
  assert.match(postcheck, /table_constraints/i);
  assert.match(postcheck, /pg_indexes/i);
  assert.match(postcheck, /authenticated_insert_denied/i);
  assert.match(postcheck, /service_update_denied/i);
});

test("le test transactionnel est non destructif et se termine par ROLLBACK", () => {
  const sql = executableSql(transaction);
  assert.match(sql, /^\s*begin\s*;/i);
  assert.match(sql, /set local transaction read only\s*;/i);
  assert.match(sql, /rollback\s*;\s*$/i);
  assert.doesNotMatch(executableKeywords(transaction), mutationPattern);
});

test("aucun script Phase I ne contient de DROP actif", () => {
  [preflight, postcheck, transaction].forEach((source) => {
    assert.doesNotMatch(executableSql(source), /\bdrop\b/i);
  });
});

test("aucune donnée ou colonne financière n'est créée", () => {
  const sql = `${preflight}\n${postcheck}\n${transaction}`;
  assert.doesNotMatch(executableSql(sql), /\bcreate\s+table\b/i);
  assert.doesNotMatch(executableSql(sql), /\binsert\s+into\b/i);
  assert.match(postcheck, /financial_columns_absent/i);
});

test("aucun secret ou endpoint n'est présent", () => {
  const content = `${preflight}\n${postcheck}\n${transaction}\n${runbook}`;
  assert.doesNotMatch(
    content,
    /(api[_-]?key|service[_-]?role[_-]?key|password|private[_-]?key|bearer\s+[A-Za-z0-9]|https?:\/\/)/i,
  );
});

test("le runbook définit sauvegarde, deux temps, rollback et GO NO-GO", () => {
  assert.match(runbook, /sauvegarde/i);
  assert.match(runbook, /Application en deux temps/i);
  assert.match(runbook, /agency_scope/i);
  assert.match(runbook, /Rollback/i);
  assert.match(runbook, /Critères GO/i);
  assert.match(runbook, /Critères NO-GO/i);
});

test("le runbook ne fait jamais confiance à l'agence du navigateur", () => {
  assert.match(runbook, /jamais une agence reçue du navigateur/i);
  assert.match(runbook, /COTONOU → COO/i);
  assert.match(runbook, /PAYÉ ≠ LIVRÉ/i);
});
