import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourceText = readFileSync(new URL("./expense-cash-recovery.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exportsObject = {};
const moduleObject = { exports: exportsObject };
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const context = vm.createContext({
  exports: exportsObject,
  module: moduleObject,
  require: (name) => {
    if (name === "server-only") return {};
    if (name === "@supabase/supabase-js") return { createClient: () => { throw new Error("unexpected database call"); } };
    if (name === "@/server/agent-expenses-apps-script") return {};
    if (name === "@/server/cash-expense-debit") return { fingerprint: hash };
    throw new Error(`Unexpected import: ${name}`);
  },
  Date, Intl, Number, Object, Error, process
});
vm.runInContext(javascript, context);
const { inspectExpenseCashRecovery, confirmExpenseCashRecovery } = moduleObject.exports;

const id = "625e5fe7-b0be-4353-b773-fed9c49e8a6f";
const admin = { userId: "11111111-1111-4111-8111-111111111111", email: "admin@example.test", agency: "COO" };
const source = Object.freeze({
  expenseRequestId: id,
  dateHeure: "2026-11-16T12:55:20.461Z",
  agence: "KLZ",
  categorie: "Connexion",
  description: "OK",
  montant: 1,
  devise: "USD",
  modePaiement: "ESPÈCES",
  reference: "",
  agent: "Maman Deborah",
  observation: "",
  statut: "ACTIVE",
  creationAuditCount: 1,
  creationActorId: "12292e33-4be8-4aea-97ed-67df2e77a7a1",
  creationActorName: "Maman Deborah"
});

function harness(overrides = {}) {
  const events = [];
  const writes = [];
  const dependencies = {
    readSource: async () => ({ ...source, ...overrides }),
    readLinkedCashEvents: async () => [...events],
    now: () => new Date("2026-11-16T15:00:00.000Z"),
    writer: async (input) => {
      writes.push(input);
      if (events.length) return { replayed: true };
      events.push({
        event_id: "test-event",
        agency: input.agency,
        amount: input.amount,
        currency: "USD",
        event_type: "EXPENSE_DEBIT_RECORDED",
        direction: "DEBIT",
        source_type: "EXPENSE_ENGINE",
        source_id: `expense:${input.agency}:${id}`,
        source_request_id: id,
        metadata: { commandFingerprint: input.commandFingerprint }
      });
      return { replayed: false };
    }
  };
  return { dependencies, events, writes };
}

test("débit absent : source recertifiée, débit unique sans recréer la dépense", async () => {
  const state = harness();
  const preview = await inspectExpenseCashRecovery(admin, id, state.dependencies);
  assert.equal(preview.eligible, true);
  const result = await confirmExpenseCashRecovery(admin, id, state.dependencies);
  assert.equal(result.debitCreated, true);
  assert.equal(state.events.length, 1);
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].allowCreate, true);
  assert.equal(state.writes[0].expenseRequestId, id);
  assert.equal(state.writes[0].businessDate, "2026-11-16");
  assert.equal(state.writes[0].metadata.sourceActorId, source.creationActorId);
  assert.equal(state.writes[0].metadata.sourceOccurredAt, source.dateHeure);
  assert.equal(state.writes[0].actorUserId, admin.userId);
});

test("débit déjà présent et répétition : aucun deuxième mouvement", async () => {
  const state = harness();
  await confirmExpenseCashRecovery(admin, id, state.dependencies);
  const second = await confirmExpenseCashRecovery(admin, id, state.dependencies);
  assert.equal(second.alreadyRecorded, true);
  assert.equal(state.events.length, 1);
  assert.equal(state.writes.length, 1);
});

test("deux confirmations simultanées : un seul débit", async () => {
  const state = harness();
  const results = await Promise.all([
    confirmExpenseCashRecovery(admin, id, state.dependencies),
    confirmExpenseCashRecovery(admin, id, state.dependencies)
  ]);
  assert.equal(state.events.length, 1);
  assert.equal(results.filter((item) => item.debitCreated).length, 1);
});

test("échec de la Caisse : aucune modification partielle locale", async () => {
  const state = harness();
  state.dependencies.writer = async () => { throw new Error("cash unavailable"); };
  await assert.rejects(confirmExpenseCashRecovery(admin, id, state.dependencies));
  assert.equal(state.events.length, 0);
});

test("refuse dépense annulée, champs contradictoires et audit absent", async () => {
  for (const override of [
    { statut: "ANNULEE" }, { montant: 2 }, { devise: "CDF" },
    { agence: "FIH" }, { reference: "autre" },
    { creationAuditCount: 0 }, { creationActorId: "22222222-2222-4222-8222-222222222222" }
  ]) {
    const state = harness(override);
    await assert.rejects(confirmExpenseCashRecovery(admin, id, state.dependencies), { code: "EXPENSE_SOURCE_MISMATCH" });
    assert.equal(state.writes.length, 0);
  }
});

test("refuse événement Caisse lié ambigu ou contradictoire", async () => {
  const state = harness();
  await confirmExpenseCashRecovery(admin, id, state.dependencies);
  state.events[0].amount = 99;
  await assert.rejects(confirmExpenseCashRecovery(admin, id, state.dependencies), { code: "CASH_EVENT_CONFLICT" });
  assert.equal(state.writes.length, 1);
  state.events[0].amount = 1;
  state.events.push({ ...state.events[0], event_id: "duplicate" });
  await assert.rejects(confirmExpenseCashRecovery(admin, id, state.dependencies), { code: "CASH_EVENT_CONFLICT" });
});

test("identifiant hors dossier refusé avant lecture ou écriture", async () => {
  const state = harness();
  await assert.rejects(confirmExpenseCashRecovery(admin, "11111111-1111-4111-8111-111111111111", state.dependencies), { code: "EXPENSE_NOT_IN_SCOPE" });
  assert.equal(state.writes.length, 0);
});
