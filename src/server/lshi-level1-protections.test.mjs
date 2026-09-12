import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => readFileSync(path, "utf8");
const appsScript = read("local-preparation/apps-script/payments/unified/Code.gs");
const edge = read("local-preparation/edge-functions/web-hardened/paiements-agents-enregistrer-paiement/index.ts");
const reconciliation = read("src/server/lshi-operational-reconciliation.ts");
const migration = read("supabase/migrations/20260912190000_lshi_level1_observability.sql");
const vercel = JSON.parse(read("vercel.json"));

test("le verrou Apps Script échoue avant le budget Edge sans écriture", () => {
  assert.match(appsScript, /const LOCK_TIMEOUT_MS = 1000/);
  assert.match(appsScript, /verrouObtenu = verrou\.tryLock\(LOCK_TIMEOUT_MS\)/);
  assert.doesNotMatch(appsScript, /LOCK_TIMEOUT_MS = 20000/);
  const busy = appsScript.indexOf('"PAYMENT_LOCK_BUSY"');
  const write = appsScript.indexOf(".setValues([valeurs])");
  assert.ok(busy > 0 && write > busy);
  assert.match(appsScript.slice(busy, write), /retryable = true/);
  assert.match(edge, /return 12_000/);
  assert.match(edge, /PAYMENT_LOCK_BUSY/);
});

test("un verrou occupé retourne une erreur rejouable avant toute ouverture Sheets", () => {
  let spreadsheetReads = 0;
  const context = vm.createContext({
    console,
    LockService: { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => assert.fail("releaseLock inattendu") }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => { spreadsheetReads += 1; throw new Error("écriture interdite"); } }
  });
  vm.runInContext(appsScript, context);
  const error = vm.runInContext(`(() => {
    try {
      enregistrerPaiementUnifie_({ paymentRequestId: "11111111-1111-4111-8111-111111111111" });
    } catch (cause) {
      return cause;
    }
  })()`, context);
  assert.equal(error.publicCode, "PAYMENT_LOCK_BUSY");
  assert.equal(error.retryable, true);
  assert.equal(spreadsheetReads, 0);
});

test("la télémétrie durable est privée et sans donnée client", () => {
  for (const field of ["apps_script_lock_wait_ms", "canonical_payment_ms", "checkpoint_ms", "cash_event_ms", "storage_exit_ms", "finalization_ms", "attempt_count", "timeout", "retry"]) assert.match(migration, new RegExp(field));
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on public\.payment_performance_events from public, anon, authenticated/);
  assert.doesNotMatch(migration, /^\s*(client_name|customer_name|telephone|phone|access_token|secret)\s+/im);
  assert.match(edge, /payment_performance_events/);
  const payload = edge.slice(edge.indexOf('from("payment_performance_events")'), edge.indexOf('if (error) console.error', edge.indexOf('from("payment_performance_events")')));
  assert.doesNotMatch(payload, /client_name|customer_name|telephone|phone|access_token/i);
});

test("la réconciliation est bornée, single-flight et sans réparation métier", () => {
  assert.match(reconciliation, /SHEET_WINDOW_LIMIT = 500/);
  assert.match(reconciliation, /DATABASE_ROW_LIMIT = 500/);
  assert.match(reconciliation, /claim_lshi_reconciliation_run/);
  assert.match(migration, /for update/);
  assert.match(migration, /lease_until/);
  assert.match(read("src/server/admin-payments-sheets.ts"), /readAdminPaymentNextRow/);
  assert.match(read("src/server/admin-payments-sheets.ts"), /\$\{site\}!P2:P/);
  assert.match(reconciliation, /persistedCursorStart === 2/);
  assert.doesNotMatch(reconciliation, /record_cash_payment_credit|finalize_paid_destination_orchestration|record_stockage|replay/i);
  assert.match(reconciliation, /aucune réparation automatique/i);
});

test("les trois cadences LSHI sont configurées", () => {
  const schedules = new Map(vercel.crons.map((item) => [item.path, item.schedule]));
  assert.equal(schedules.get("/api/internal/cron/lshi-operational-reconciliation"), "*/10 * * * *");
  assert.equal(schedules.get("/api/internal/cron/lshi-daily-continuity"), "30 23 * * *");
  assert.equal(schedules.get("/api/internal/cron/lshi-daily-continuity-retry"), "15 5 * * *");
});

test("les contrôles couvrent paiements, caisse, stockage, dépenses et forwarding", () => {
  for (const marker of ["PAIEMENT_CANONIQUE_SANS_ORCHESTRATION", "PAIEMENT_SANS_CASH_EVENT", "PAIEMENT_SANS_SORTIE_STOCKAGE", "MONTANT_PAIEMENT_DIFFERENT_DU_CASH", "POIDS_COLIS_DIFFERENT_DE_LA_SORTIE", "DEPENSE_SANS_DEBIT_CAISSE", "forwardingId"]) assert.match(read("src/server/operational-reconciliation.ts") + reconciliation, new RegExp(marker));
});
