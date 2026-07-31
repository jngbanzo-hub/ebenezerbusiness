import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./canonical/Code.gs", import.meta.url), "utf8");
const rows = {
  COO: [expenseRow("10000000-0000-4000-8000-000000000001", "2026-08-01T08:00:00Z", "Transport", 100, "FCFA", "Agent COO", "ACTIVE", "REF-COO")],
  FIH: [expenseRow("10000000-0000-4000-8000-000000000002", "2026-08-01T09:00:00Z", "Loyer", 20, "USD", "Agent A", "ACTIVE", "REF-A")],
  LSHI: [expenseRow("10000000-0000-4000-8000-000000000003", "2026-07-31T09:00:00Z", "Transport", 30, "USD", "Agent B", "CORRIGEE", "REF-B")],
  KLZ: []
};

function expenseRow(id, date, category, amount, currency, agent, status, reference) {
  return [new Date(date), id, "", category, `Description ${category}`, amount, currency, "ESPÈCES", reference, agent, "Observation", status, amount, category, `Description ${category}`, "", "", "", "", "", ""];
}

function createRuntime() {
  const writes = [];
  const sheets = Object.fromEntries(Object.entries(rows).map(([name, values]) => [name, {
    getLastRow: () => values.length + 1,
    getRange: () => ({
      getValues: () => values,
      setValue: (...args) => writes.push(args),
      setValues: (...args) => writes.push(args)
    })
  }]));
  const context = vm.createContext({
    Date, Error, JSON, Map, Math, Number, Object, RegExp, Set, String,
    isNaN,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (name) => sheets[name] ?? null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "server-key" }) },
    Utilities: { formatDate: (date, _zone, format) => format === "yyyy-MM-dd" ? date.toISOString().slice(0, 10) : date.toISOString() },
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) }
  });
  vm.runInContext(source, context);
  return { context, writes };
}

function invoke(context, { apiKey = "server-key", role = "ADMIN", data = {} } = {}) {
  const body = { apiKey, action: "LISTER_DEPENSES_ADMIN", acteur: { id: "20000000-0000-4000-8000-000000000001", nom: "Admin", role, actif: true, agence: "COO" }, donnees: data };
  return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text);
}

test("refuse une requête non signée et un Agent", () => {
  const { context } = createRuntime();
  assert.equal(invoke(context, { apiKey: "wrong-key" }).code, "NON_AUTORISE");
  assert.equal(invoke(context, { role: "AGENT" }).code, "ROLE_INTERDIT");
});

test("filtre, pagine et sépare les totaux par devise sans écriture", () => {
  const { context, writes } = createRuntime();
  const result = invoke(context, { data: { dateDebut: "2026-08-01", dateFin: "2026-08-01", page: 1, pageSize: 1 } });
  assert.equal(result.success, true);
  assert.equal(result.lectureSeule, true);
  assert.equal(result.depenses.length, 1);
  assert.deepEqual(result.pagination, { page: 1, pageSize: 1, total: 2, totalPages: 2 });
  assert.deepEqual(result.totaux.parDevise, { FCFA: 100, USD: 20 });
  assert.equal(writes.length, 0);
});

test("applique les filtres agence, catégorie, devise, Agent, statut et référence", () => {
  const { context } = createRuntime();
  const result = invoke(context, { data: { agence: "FIH", categorie: "Loyer", devise: "USD", agent: "agent a", statut: "ACTIVE", reference: "ref-a" } });
  assert.equal(result.pagination.total, 1);
  assert.equal(result.depenses[0].agence, "FIH");
});

test("refuse dates, agence, devise et pageSize invalides", () => {
  const { context } = createRuntime();
  assert.equal(invoke(context, { data: { dateDebut: "2026-02-30" } }).code, "DATE_DEBUT_INVALIDE");
  assert.equal(invoke(context, { data: { agence: "PARIS" } }).code, "AGENCE_INVALIDE");
  assert.equal(invoke(context, { data: { devise: "EUR" } }).code, "DEVISE_INVALIDE");
  assert.equal(invoke(context, { data: { pageSize: 101 } }).code, "PAGE_SIZE_INVALIDE");
});

test("préserve les actions d'écriture historiques sans les appeler", () => {
  assert.match(source, /action === 'ENREGISTRER_DEPENSE'/);
  assert.match(source, /action === 'DEMANDER_CORRECTION'/);
  assert.match(source, /action === 'DECIDER_CORRECTION'/);
  assert.match(source, /action === 'ANNULER_DEPENSE'/);
  const body = source.match(/function listerDepensesAdmin_\([\s\S]*?\n}\n\nfunction validerFiltresDepensesAdmin_/)?.[0] ?? "";
  assert.doesNotMatch(body, /setValue|setValues|appendRow|deleteRow|insertRow|LockService/);
});
