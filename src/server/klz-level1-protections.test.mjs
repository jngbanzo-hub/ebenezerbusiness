import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const reconciliation = read("src/server/klz-operational-reconciliation.ts");
const anomalyCenter = read("src/server/operational-anomalies.ts");
const migration = read("supabase/migrations/20260915120000_klz_level1_observability.sql");
const vercel = JSON.parse(read("vercel.json"));

test("la réconciliation KLZ est bornée, single-flight et detect-only", () => {
  assert.match(reconciliation, /agency: "KLZ" as const/);
  assert.match(reconciliation, /SHEET_WINDOW_LIMIT = 500/);
  assert.match(reconciliation, /DATABASE_ROW_LIMIT = 500/);
  assert.match(reconciliation, /claim_klz_reconciliation_run/);
  assert.match(migration, /for update/);
  assert.match(migration, /lease_until/);
  assert.match(reconciliation, /persistedCursorStart === 2/);
  assert.doesNotMatch(reconciliation, /record_cash_payment_credit|finalize_paid_destination_orchestration|record_stockage|replay/i);
  assert.match(reconciliation, /aucune réparation automatique/i);
});

test("la migration KLZ ne persiste que l'observabilité de réconciliation", () => {
  assert.match(migration, /create table if not exists public\.klz_reconciliation_state/);
  assert.match(migration, /create table if not exists public\.klz_reconciliation_runs/);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(cash_|stockage_|payments?|expenses?|forwardings?)/i);
  assert.doesNotMatch(migration, /record_cash_payment_credit|finalize_paid_destination_orchestration|record_stockage|replay/i);
});

test("les trois cadences KLZ reprennent les garanties LSHI", () => {
  const schedules = new Map(vercel.crons.map((item) => [item.path, item.schedule]));
  assert.equal(schedules.get("/api/internal/cron/klz-operational-reconciliation"), "*/10 * * * *");
  assert.equal(schedules.get("/api/internal/cron/klz-daily-continuity"), "30 23 * * *");
  assert.equal(schedules.get("/api/internal/cron/klz-daily-continuity-retry"), "15 5 * * *");
});

test("les routes KLZ sont GET-only et protégées par le secret cron", () => {
  for (const route of [
    "src/app/api/internal/cron/klz-operational-reconciliation/route.ts",
    "src/app/api/internal/cron/klz-daily-continuity/route.ts",
    "src/app/api/internal/cron/klz-daily-continuity-retry/route.ts"
  ]) {
    const source = read(route);
    assert.match(source, /export async function GET/);
    assert.match(source, /isAuthorizedInternalCron/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  }
});

test("les contrôles KLZ couvrent paiements, caisse, stockage, dépenses et forwarding", () => {
  const generic = read("src/server/operational-reconciliation.ts");
  for (const marker of [
    "PAIEMENT_CANONIQUE_SANS_ORCHESTRATION",
    "PAIEMENT_SANS_CASH_EVENT",
    "PAIEMENT_SANS_SORTIE_STOCKAGE",
    "MONTANT_PAIEMENT_DIFFERENT_DU_CASH",
    "POIDS_COLIS_DIFFERENT_DE_LA_SORTIE",
    "DEPENSE_SANS_DEBIT_CAISSE",
    "forwardingId"
  ]) assert.match(generic + reconciliation, new RegExp(marker));
});

test("la continuité KLZ compare Caisse et Stockage sans mutation", () => {
  assert.match(reconciliation, /ECART_CAISSE_PAIEMENTS/);
  assert.match(reconciliation, /ECART_CAISSE_DEPENSES/);
  assert.match(reconciliation, /ECART_STOCKAGE_JOURNAL/);
  assert.match(reconciliation, /previousSnapshot\.parcelCount/);
  assert.doesNotMatch(reconciliation, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("le Centre d'anomalies ingère KLZ sans classification LSHI", () => {
  assert.match(anomalyCenter, /readLatestKlzReconciliationReport/);
  assert.match(anomalyCenter, /KLZ_RECONCILIATION/);
  assert.match(reconciliation, /id: `klz:\$\{type\}`/);
  assert.match(reconciliation, /dossierKey: `KLZ:\$\{type\}`/);
  assert.doesNotMatch(reconciliation, /agency: "LSHI"/);
});

test("AT11826 reste hors scanner car sa remise physique COO vers KLZ est légitime", () => {
  assert.match(reconciliation, /\.in\("event_type", \["SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", "SORTIE_APRES_REMISE_ACHEMINEMENT"\]\)/);
  assert.doesNotMatch(reconciliation, /CONFIRMED_DELIVERY_RECORDED/);
});

test("l'identité technique KLZ est un UUID v4 distinct de LSHI", () => {
  const actor = reconciliation.match(/userId: "([0-9a-f-]+)"/)?.[1];
  const lshiActor = read("src/server/lshi-operational-reconciliation.ts").match(/userId: "([0-9a-f-]+)"/)?.[1];
  assert.match(actor ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(actor, lshiActor);
  assert.match(reconciliation, /email: "KLZ_RECONCILIATION_READER"/);
});

test("Dépenses et débits Caisse KLZ partagent la même fenêtre bornée", () => {
  assert.match(reconciliation, /lshiExpenseReconciliationWindow\(input\.kind, input\.businessDate, input\.now\)/);
  assert.match(reconciliation, /agence: "KLZ"/);
  assert.match(reconciliation, /dateDebut: expenseWindow\.sheetDateStart, dateFin: expenseWindow\.sheetDateEnd/);
  assert.match(reconciliation, /isTimestampInLshiExpenseWindow\(row\.dateHeure, expenseWindow\)/);
  assert.match(reconciliation, /\.gte\("occurred_at", expenseWindow\.startInclusive\)\.lt\("occurred_at", expenseWindow\.endExclusive\)/);
});
