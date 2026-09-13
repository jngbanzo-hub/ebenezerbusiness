import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

async function importTypeScript(path) {
  const source = readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    },
    fileName: path
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const windowModule = await importTypeScript("src/server/lshi-expense-reconciliation-window.ts");
const reconciliationModule = await importTypeScript("src/server/operational-reconciliation.ts");
const { isTimestampInLshiExpenseWindow, lshiExpenseReconciliationWindow } = windowModule;
const { reconcileOperations } = reconciliationModule;

const incrementalNow = new Date("2026-09-13T12:00:00.000Z");
const incrementalWindow = lshiExpenseReconciliationWindow("INCREMENTAL", "2026-09-12", incrementalNow);

function filter(rows, window) {
  return rows.filter((row) => isTimestampInLshiExpenseWindow(row.occurredAt, window));
}

function reconcileExpenses(expenses, expenseCash, now = incrementalNow) {
  return reconcileOperations({
    payments: [],
    cash: [],
    storage: [],
    orchestrations: [],
    closures: [],
    expenses,
    expenseCash,
    now
  });
}

function expense(requestId, occurredAt, amountUsd = 10) {
  return { requestId, agency: "LSHI", amountUsd, occurredAt };
}

function cash(requestId, occurredAt, amountUsd = 10) {
  return { eventId: `cash-${requestId}`, requestId, agency: "LSHI", amountUsd, occurredAt };
}

test("cas 1: dépense et débit récents sont rapprochés dans la même fenêtre", () => {
  const expenses = filter([expense("recent", "2026-09-13T11:00:00.000Z")], incrementalWindow);
  const debits = filter([cash("recent", "2026-09-13T11:00:05.000Z")], incrementalWindow);
  assert.equal(reconcileExpenses(expenses, debits).metrics.expensesWithoutCash, 0);
});

test("cas 2: une dépense ancienne et son débit sortent ensemble de la fenêtre incrémentale", () => {
  const expenses = filter([expense("old", "2026-09-13T08:00:00.000Z")], incrementalWindow);
  const debits = filter([cash("old", "2026-09-13T08:00:05.000Z")], incrementalWindow);
  assert.equal(expenses.length, 0);
  assert.equal(debits.length, 0);
  assert.equal(reconcileExpenses(expenses, debits).metrics.expensesWithoutCash, 0);
});

test("cas 3: la journée métier inclut 23:55 et 23:56 heure de Porto-Novo", () => {
  const window = lshiExpenseReconciliationWindow("DAILY", "2026-09-12", incrementalNow);
  const expenses = filter([expense("midnight", "2026-09-12T22:55:00.000Z")], window);
  const debits = filter([cash("midnight", "2026-09-12T22:56:00.000Z")], window);
  assert.equal(expenses.length, 1);
  assert.equal(debits.length, 1);
  assert.equal(reconcileExpenses(expenses, debits).metrics.expensesWithoutCash, 0);
});

test("cas 4: les bornes UTC représentent exactement la journée Africa/Porto-Novo", () => {
  const window = lshiExpenseReconciliationWindow("DAILY", "2026-09-12", incrementalNow);
  assert.deepEqual(window, {
    startInclusive: "2026-09-11T23:00:00.000Z",
    endExclusive: "2026-09-12T23:00:00.000Z",
    sheetDateStart: "2026-09-12",
    sheetDateEnd: "2026-09-12"
  });
  assert.equal(isTimestampInLshiExpenseWindow("2026-09-11T22:59:59.999Z", window), false);
  assert.equal(isTimestampInLshiExpenseWindow("2026-09-11T23:00:00.000Z", window), true);
  assert.equal(isTimestampInLshiExpenseWindow("2026-09-12T22:59:59.999Z", window), true);
  assert.equal(isTimestampInLshiExpenseWindow("2026-09-12T23:00:00.000Z", window), false);
});

test("cas 5: une vraie dépense sans débit reste détectée", () => {
  const expenses = filter([expense("orphan", "2026-09-13T11:55:00.000Z")], incrementalWindow);
  const result = reconcileExpenses(expenses, []);
  assert.equal(result.metrics.expensesWithoutCash, 1);
  assert.equal(result.anomalies[0].type, "DEPENSE_SANS_DEBIT_CAISSE");
});

test("cas 6: un débit sans dépense ne devient pas une fausse dépense orpheline", () => {
  const result = reconcileExpenses([], [cash("cash-only", "2026-09-13T11:00:00.000Z")]);
  assert.equal(result.metrics.expensesWithoutCash, 0);
  assert.equal(result.anomalies.length, 0);
});

test("cas 7: des relances répétées sont déterministes et ne mutent pas les entrées", () => {
  const expenses = [expense("repeat", "2026-09-13T11:00:00.000Z")];
  const debits = [cash("repeat", "2026-09-13T11:00:05.000Z")];
  const snapshot = JSON.stringify({ expenses, debits });
  const first = reconcileExpenses(filter(expenses, incrementalWindow), filter(debits, incrementalWindow));
  const second = reconcileExpenses(filter(expenses, incrementalWindow), filter(debits, incrementalWindow));
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify({ expenses, debits }), snapshot);
});

test("cas 8: deux montants identiques restent rapprochés par requestId", () => {
  const expenses = [expense("expense-a", "2026-09-13T11:00:00.000Z", 25), expense("expense-b", "2026-09-13T11:01:00.000Z", 25)];
  const result = reconcileExpenses(expenses, [cash("expense-a", "2026-09-13T11:00:05.000Z", 25)]);
  assert.equal(result.metrics.expensesWithoutCash, 1);
  assert.equal(result.anomalies[0].paymentRequestId, "expense-b");
});

test("cas 9: le contrôle quotidien rapproche matin et soir de la même journée", () => {
  const window = lshiExpenseReconciliationWindow("DAILY", "2026-09-12", incrementalNow);
  const expenses = filter([expense("day-long", "2026-09-12T06:00:00.000Z")], window);
  const debits = filter([cash("day-long", "2026-09-12T20:00:00.000Z")], window);
  assert.equal(reconcileExpenses(expenses, debits).metrics.expensesWithoutCash, 0);
});

test("cas 10: une anomalie récente suffisamment ancienne pour la grâce reste visible", () => {
  const expenses = filter([expense("recent-orphan", "2026-09-13T11:58:00.000Z")], incrementalWindow);
  const result = reconcileExpenses(expenses, []);
  assert.equal(result.metrics.expensesWithoutCash, 1);
  assert.equal(result.anomalies[0].paymentRequestId, "recent-orphan");
});

test("la régression des 20 faux positifs sort les deux côtés de la fenêtre", () => {
  const expenses = Array.from({ length: 20 }, (_, index) => expense(`historical-${index}`, `2026-09-13T08:${String(index).padStart(2, "0")}:00.000Z`));
  const debits = expenses.map((row) => cash(row.requestId, new Date(Date.parse(row.occurredAt) + 5_000).toISOString()));
  const result = reconcileExpenses(filter(expenses, incrementalWindow), filter(debits, incrementalWindow));
  assert.equal(result.metrics.expensesWithoutCash, 0);
  assert.equal(result.anomalies.length, 0);
});

test("le scanner reste sans primitive d'écriture financière", () => {
  const source = readFileSync("src/server/lshi-operational-reconciliation.ts", "utf8");
  assert.match(source, /isTimestampInLshiExpenseWindow\(row\.dateHeure, expenseWindow\)/);
  assert.match(source, /\.gte\("occurred_at", expenseWindow\.startInclusive\)\.lt\("occurred_at", expenseWindow\.endExclusive\)/);
  assert.doesNotMatch(source, /record_cash_payment_credit|attachConfirmedExpenseDebit|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
