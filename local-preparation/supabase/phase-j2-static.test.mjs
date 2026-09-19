import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const migration = read("003_harden_agents_privileges.sql");
const rollback = read("003_harden_agents_privileges.rollback.sql");
const validation = read("003_harden_agents_privileges.validate.sql");

function executableSql(source) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function executableKeywords(source) {
  return executableSql(source).replace(/'(?:''|[^'])*'/g, "''");
}

test("retire uniquement les privilèges inutiles de authenticated", () => {
  assert.match(
    migration,
    /revoke\s+truncate,\s*trigger\s+on table public\.agents\s+from authenticated/i,
  );
  assert.match(
    migration,
    /revoke\s+references\s+on table public\.agents\s+from authenticated/i,
  );
  assert.doesNotMatch(migration, /\brevoke\s+select\b/i);
  assert.doesNotMatch(migration, /\bservice_role\b/i);
});

test("ne modifie ni données, ni schéma, ni RLS", () => {
  assert.doesNotMatch(
    executableSql(migration),
    /\b(alter|create|drop|insert\s+into|update\s+public\.|delete\s+from|comment)\b/i,
  );
  assert.doesNotMatch(migration, /\b(policy|row level security)\b/i);
  const statements = executableSql(migration)
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  assert.equal(statements.length, 2);
  statements.forEach((statement) => assert.match(statement, /^revoke\b/i));
});

test("le rollback restaure exactement les privilèges retirés", () => {
  assert.match(
    rollback,
    /grant\s+truncate,\s*trigger\s+on table public\.agents\s+to authenticated/i,
  );
  assert.match(
    rollback,
    /grant\s+references\s+on table public\.agents\s+to authenticated/i,
  );
  assert.doesNotMatch(rollback, /\bgrant\s+select\b/i);
  assert.doesNotMatch(rollback, /\bservice_role\b/i);
  assert.doesNotMatch(rollback, /\bgrant\s+all\b/i);
});

test("la validation est strictement en lecture seule", () => {
  assert.match(validation, /\bhas_table_privilege\b/i);
  assert.match(validation, /'public\.agents'/i);
  assert.match(validation, /'authenticated'/i);
  assert.match(validation, /'service_role'/i);
  assert.match(validation, /'anon'/i);
  assert.match(validation, /'PUBLIC'/i);
  assert.doesNotMatch(
    executableKeywords(validation),
    /\b(create|alter|drop|insert|update|delete|truncate|grant|revoke|comment|execute|do)\b/i,
  );
});

test("aucun script ne contient de donnée réelle ou de secret", () => {
  const content = `${migration}\n${rollback}\n${validation}`;
  assert.doesNotMatch(content, /\b(email|telephone|phone|nom|adresse)\b/i);
  assert.doesNotMatch(
    content,
    /(api[_-]?key|service[_-]?role[_-]?key|password|private[_-]?key|bearer\s+[A-Za-z0-9]|https?:\/\/)/i,
  );
});
