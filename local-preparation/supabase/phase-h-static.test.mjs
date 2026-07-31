import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("./002_logistics_events_rls.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("./002_logistics_events_rls.rollback.sql", import.meta.url),
  "utf8",
);
const documentation = readFileSync(
  new URL("./LOGISTICS_EVENTS_SECURITY.md", import.meta.url),
  "utf8",
);

test("active et force RLS", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
});

test("n'accorde aucun accès anonyme", () => {
  assert.match(migration, /revoke all[^;]+from anon/i);
  assert.doesNotMatch(migration, /grant\s+[^;]+\s+to anon/i);
});

test("accorde uniquement la lecture aux clients authentifiés", () => {
  assert.match(migration, /grant select[^;]+to authenticated/i);
  assert.doesNotMatch(
    migration,
    /grant\s+(insert|update|delete)[^;]+to authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /create policy[\s\S]+?for\s+(insert|update|delete)/i,
  );
});

test("détermine l'agence depuis le profil authentifié", () => {
  assert.match(migration, /from public\.agents as agent_profile/i);
  assert.match(migration, /agent_profile\.id::text = auth\.uid\(\)::text/i);
  assert.match(migration, /agent_profile\.actif is true/i);
  assert.match(migration, /agent_profile\.agence/i);
  assert.match(migration, /any \(logistics_events\.agency_scope\)/i);
});

test("échoue fermement si agency_scope n'a pas été backfillé", () => {
  assert.match(migration, /where agency_scope is null/i);
  assert.match(migration, /LOGISTICS_AGENCY_SCOPE_BACKFILL_REQUIRED/);
  assert.match(migration, /alter column agency_scope set not null/i);
});

test("préserve l'unicité événement et colis-version", () => {
  assert.match(migration, /id text primary key/i);
  assert.match(
    migration,
    /unique\s*\(parcel_id,\s*version_after\)/i,
  );
});

test("contient les index de suivi requis", () => {
  assert.match(migration, /logistics_events_tracking_code_idx/i);
  assert.match(migration, /logistics_events_parcel_id_idx/i);
  assert.match(migration, /logistics_events_occurred_at_idx/i);
});

test("interdit les mutations des événements existants", () => {
  assert.match(migration, /before update or delete/i);
  assert.match(migration, /LOGISTICS_EVENT_IMMUTABLE/);
  assert.match(migration, /revoke update, delete[^;]+from service_role/i);
});

test("ne contient aucune colonne financière", () => {
  const tableDefinition =
    migration.match(/create table[\s\S]+?\n\);/i)?.[0] ?? "";
  assert.doesNotMatch(
    tableDefinition,
    /\b(amount|currency|payment|fee|montant|devise|frais)\b/i,
  );
});

test("fournit un rollback non automatique et prudent", () => {
  assert.match(rollback, /PREPARATORY ROLLBACK ONLY/i);
  assert.match(rollback, /drop policy if exists logistics_events_agent_read/i);
  assert.match(rollback, /drop trigger if exists/i);
  assert.match(rollback, /drop index if exists/i);
  assert.match(rollback, /-- drop table if exists public\.logistics_events/i);
});

test("documente sauvegarde, vérification et dépendance agents", () => {
  assert.match(documentation, /sauvegarde/i);
  assert.match(documentation, /vérifications après migration/i);
  assert.match(documentation, /public\.agents/i);
  assert.match(documentation, /PAYÉ n’est jamais équivalent à LIVRÉ/i);
});

test("reste préparatoire, sans données réelles ni exécution automatique", () => {
  assert.match(migration, /PREPARATORY ONLY/i);
  assert.doesNotMatch(migration, /insert\s+into/i);
  assert.doesNotMatch(migration, /copy\s+public\./i);
  assert.doesNotMatch(migration, /https?:\/\//i);
});

test("ne contient aucun secret", () => {
  const content = `${migration}\n${rollback}\n${documentation}`;
  assert.doesNotMatch(
    content,
    /(api[_-]?key|service[_-]?role[_-]?key|password|private[_-]?key|bearer\s+[A-Za-z0-9])/i,
  );
});
