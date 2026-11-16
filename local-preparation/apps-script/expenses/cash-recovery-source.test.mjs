import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const code = readFileSync(new URL("./canonical/Code.gs", import.meta.url), "utf8");
const id = "625e5fe7-b0be-4353-b773-fed9c49e8a6f";
const actorId = "12292e33-4be8-4aea-97ed-67df2e77a7a1";

function expense() {
  return [new Date("2026-11-16T12:55:20.461Z"), id, "KLZ", "Connexion", "OK", 1,
    "USD", "ESPÈCES", "", "Maman Deborah", "", "ACTIVE", 1, "Connexion", "OK",
    "", "", "", "", "", ""];
}

function audit() {
  const row = Array(29).fill("");
  row[1] = "CREATION";
  row[2] = new Date("2026-11-16T12:55:20.461Z");
  row[3] = id;
  row[5] = "KLZ";
  row[6] = "KLZ";
  row[7] = actorId;
  row[8] = "Maman Deborah";
  row[11] = "ACTIVE";
  row[13] = "Connexion";
  row[15] = "OK";
  row[17] = 1;
  row[19] = "USD";
  row[21] = "ESPÈCES";
  row[27] = "SUCCES";
  row[28] = id;
  return row;
}

function runtime({ expenses = [expense()], audits = [audit()] } = {}) {
  let writes = 0;
  const sheets = { COO: [], FIH: [], LSHI: [], KLZ: expenses, "AUDIT DEPENSES": audits };
  const getSheetByName = (name) => {
    if (!(name in sheets)) return null;
    const rows = sheets[name];
    return {
      getLastRow: () => rows.length + 1,
      getRange: (firstRow, firstCol, height, width) => ({
        getValues: () => rows.slice(firstRow - 2, firstRow - 2 + height)
          .map((row) => row.slice(firstCol - 1, firstCol - 1 + width)),
        createTextFinder: (needle) => ({
          matchCase() { return this; }, matchEntireCell() { return this; },
          useRegularExpression() { return this; },
          findAll: () => rows.flatMap((row, index) =>
            String(row[firstCol - 1]).toLowerCase() === needle.toLowerCase()
              ? [{ getRow: () => index + 2 }] : [])
        }),
        setValue: () => { writes++; }, setValues: () => { writes++; }
      })
    };
  };
  const context = vm.createContext({
    Date, Error, JSON, Math, Number, Object, RegExp, String,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "server-key" }) },
    Utilities: { formatDate: (date) => date.toISOString() },
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) }
  });
  vm.runInContext(code, context);
  return {
    invoke: (role = "ADMIN") => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({
      apiKey: "server-key", action: "LIRE_DEPENSE_CAISSE_ADMIN",
      acteur: { id: actorId, nom: "Admin", role, actif: true, agence: "COO" },
      donnees: { expenseRequestId: id }
    }) } }).text),
    writes: () => writes
  };
}

test("lecture ciblée Admin : source et audit exacts, zéro écriture", () => {
  const state = runtime();
  const result = state.invoke();
  assert.equal(result.code, "DEPENSE_CAISSE_SOURCE_LUE");
  assert.equal(result.lectureSeule, true);
  assert.equal(result.depense.expenseRequestId, id);
  assert.equal(result.depense.agence, "KLZ");
  assert.equal(result.depense.modePaiement, "ESPÈCES");
  assert.equal(result.depense.creationAuditCount, 1);
  assert.equal(result.depense.creationActorId, actorId);
  assert.equal(state.writes(), 0);
});

test("refuse Agent, absence, doublon et audit absent", () => {
  assert.equal(runtime().invoke("AGENT").code, "ROLE_INTERDIT");
  assert.equal(runtime({ expenses: [] }).invoke().code, "DEPENSE_SOURCE_ABSENTE");
  assert.equal(runtime({ expenses: [expense(), expense()] }).invoke().code, "DEPENSE_SOURCE_AMBIGUE");
  assert.equal(runtime({ audits: [] }).invoke().depense.creationAuditCount, 0);
});

test("un audit contradictoire ou une seconde création ne certifient pas la source", () => {
  const contradiction = audit();
  contradiction[17] = 2;
  assert.equal(runtime({ audits: [contradiction] }).invoke().depense.creationActorId, "");
  assert.equal(runtime({ audits: [audit(), contradiction] }).invoke().depense.creationAuditCount, 2);
});
