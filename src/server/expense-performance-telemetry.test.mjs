import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apps = readFileSync("local-preparation/apps-script/expenses/canonical/Code.gs", "utf8");
const route = readFileSync("src/app/api/agent/expenses/route.ts", "utf8");
const client = readFileSync("src/features/agent/agent-expense-form.tsx", "utf8");
const telemetry = readFileSync("src/server/expense-performance-telemetry.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260903213000_expense_performance_telemetry.sql", "utf8");

test("rend INCREMENTAL et FULL_FALLBACK durablement certifiables", () => {
  assert.match(apps, /cheminStatistiques = 'INCREMENTAL'/);
  assert.match(apps, /cheminStatistiques = 'FULL_FALLBACK'/);
  for (const reason of ["RESUME_ABSENT_OU_STRUCTURE_INVALIDE", "DATE_INVALIDE", "AGREGAT_JOURNALIER_ABSENT", "AGREGAT_MENSUEL_ABSENT", "AGREGAT_INVALIDE"]) assert.match(apps, new RegExp(reason));
  for (const step of ["attente_verrou", "recherche_idempotence", "ecriture_depense", "ecriture_audit", "lecture_validation_statistiques", "mise_a_jour_statistiques", "statistiques"]) assert.match(apps, new RegExp(step));
});

test("compte les familles d'appels Sheets sans journaliser le métier", () => {
  for (const call of ["textFinder", "getRange", "getValues", "setValue", "setValues", "insertRows", "clear", "formatage", "autoResize", "flush", "autres"]) assert.match(apps, new RegExp(call));
  const logger = apps.slice(apps.indexOf("function journaliserPerformanceDepenses_"), apps.indexOf("function compterAppelDepenses_"));
  assert.doesNotMatch(logger, /description|montant|client|telephone|solde/i);
});

test("la persistance est service-role, hachée, RLS et non bloquante pour le métier", () => {
  assert.match(telemetry, /createHash\("sha256"\)/);
  assert.match(telemetry, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(telemetry, /cache: "no-store"/);
  assert.match(telemetry, /controller\.abort\(\), 250/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* anon, authenticated/);
  assert.match(route, /persistExpensePerformanceTelemetry/);
  assert.match(route, /\.catch\(\(\) => false\)/);
  assert.match(route, /delete publicResult\.performanceTelemetry/);
  assert.match(route, /result: "ERROR"/);
});

test("le navigateur mesure jusqu'au rendu sans bloquer la confirmation", () => {
  for (const metric of ["clickToFetch", "fetchToResponse", "responseToSetResult", "setResultToRendered", "clickToRendered"]) assert.match(client, new RegExp(metric));
  assert.match(client, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(client, /keepalive: true/);
  assert.match(client, /\.catch\(\(\) => undefined\)/);
});

test("anti-doublon, verrou, Caisse et notification restent en place", () => {
  assert.match(apps, /LockService\.getScriptLock/);
  assert.match(apps, /CONFIG_DEPENSES\.feuillesAgences\.length/);
  assert.match(apps, /matchEntireCell\(true\)/);
  assert.match(route, /forwardAgentExpenseRequest/);
  assert.match(route, /recordInternalNotification/);
  assert.ok(route.indexOf("forwardAgentExpenseRequest") < route.indexOf("recordInternalNotification"));
});
