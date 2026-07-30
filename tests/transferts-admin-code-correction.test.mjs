import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const route = await readFile(
  new URL("../src/app/api/admin/transferts/[transferId]/correct-code/route.ts", import.meta.url),
  "utf8"
);
const helper = await readFile(
  new URL("../src/server/transferts-admin-code-correction.ts", import.meta.url),
  "utf8"
);
const apps = await readFile(
  new URL("../../../Code-TRANSFERTS-PUBLIC-V2-API.gs", import.meta.url),
  "utf8"
).catch(() => "");

test("la route unique expose exclusivement POST et délègue au contrôle Admin", () => {
  assert.ok(route.includes("export async function POST"));
  assert.equal(/export async function (GET|PUT|PATCH|DELETE)/.test(route), false);
  assert.ok(route.includes("correctTransferCodeAsAdmin"));
});

test("l’ordre serveur authentifie, contrôle les flags, valide, lit puis écrit", () => {
  const auth = helper.indexOf("await authorizeAdminRequest");
  const flags = helper.indexOf("getTransfertsFeatureFlags()");
  const validate = helper.indexOf("validateCorrectionInput");
  const read = helper.indexOf('callTransfertsReadApi(');
  const state = helper.indexOf("assertCorrectionAllowed");
  const write = helper.indexOf('callTransfertsWriteApi(');
  assert.ok(auth < flags && flags < validate && validate < read && read < state && state < write);
  assert.ok(helper.includes("!flags.adminEnabled || !flags.writesEnabled"));
});

test("la validation refuse les champs inconnus, confirmations différentes et UUID invalides", () => {
  assert.ok(helper.includes("Champ inconnu."));
  assert.ok(helper.includes("newTransferCode !== confirmTransferCode"));
  assert.ok(helper.includes("UUID.test(correctionRequestId)"));
  assert.equal(helper.includes("actorRole ="), false);
});

test("les états autorisés et interdits sont contrôlés côté site et moteur", { skip: !apps }, () => {
  for (const status of ["ENVOYE", "CODE_RECU", "A_VERIFIER", "FONDS_RETIRES", "CONFIRME", "ANNULE"]) {
    assert.ok(helper.includes(`"${status}"`));
    assert.ok(apps.includes(`'${status}'`));
  }
  assert.ok(helper.includes('transfer.status === "A_VERIFIER" && Boolean(transfer.fundsWithdrawnAt)'));
  assert.ok(apps.includes("oldStatus === 'A_VERIFIER' && found.values[20]"));
  assert.ok(apps.includes("oldStatus === 'CODE_RECU' ? 'ENVOYE' : oldStatus"));
});

test("l’idempotence est persistante sous verrou sans code complet dans la feuille", { skip: !apps }, () => {
  assert.ok(apps.includes("TRANSFERTS CODE CORRECTIONS"));
  assert.ok(apps.includes("LockService.getScriptLock()"));
  assert.ok(apps.includes("CORRECTION_REQUEST_ID_CONFLICT"));
  assert.ok(apps.includes("'EN_COURS'"));
  assert.ok(apps.includes("'SUCCES'"));
  const start = apps.indexOf("HEADERS: ['Correction Request ID'");
  const headers = apps.slice(start, apps.indexOf("]}", start));
  assert.equal(headers.includes("Nouveau code complet"), false);
  assert.equal(headers.includes("Ancien code complet"), false);
});

test("Audit ne conserve que les codes masqués et la réponse Admin reste masquée", { skip: !apps }, () => {
  assert.ok(apps.includes("'CORRECTION_CODE'"));
  assert.ok(apps.includes("ancienCodeMasque"));
  assert.ok(apps.includes("nouveauCodeMasque"));
  assert.ok(apps.includes("const includeFullCode = role === 'AGENT'"));
  assert.equal(helper.includes("console."), false);
});

class Range {
  constructor(sheet, row, column, rows, columns) {
    Object.assign(this, { sheet, row, column, rows, columns });
  }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.columns }, (_, c) =>
        this.sheet.data[this.row - 1 + r]?.[this.column - 1 + c] ?? ""
      )
    );
  }
  getDisplayValues() {
    return this.getValues().map((row) => row.map(String));
  }
  setValues(values) {
    values.forEach((valuesRow, r) => valuesRow.forEach((value, c) => {
      const target = this.row - 1 + r;
      this.sheet.data[target] ??= [];
      this.sheet.data[target][this.column - 1 + c] = value;
    }));
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
}
class Sheet {
  constructor(name, data) { this.name = name; this.data = data; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(0, ...this.data.map((row) => row.length)); }
  getRange(row, column, rows = 1, columns = 1) { return new Range(this, row, column, rows, columns); }
  appendRow(row) { this.data.push([...row]); }
}

function appsHarness(status, { fundsWithdrawnAt = "" } = {}) {
  const parameterHeaders = ["Clé", "Valeur", "Description", "Modifié le", "Modifié par"];
  const transferHeaders = [
    "Transfer ID", "Date et heure d’envoi", "Agence expéditrice", "Agent expéditeur",
    "Agence bénéficiaire", "Agent bénéficiaire", "Montant envoyé", "Devise", "Frais de transfert",
    "Montant net attendu", "Service de transfert", "Code de transfert", "Code masqué",
    "Nom de l’expéditeur", "Nom du bénéficiaire", "Téléphone bénéficiaire", "Statut",
    "Code reçu par", "Date de réception du code", "Fonds retirés par", "Date de retrait des fonds",
    "Confirmé par", "Date de confirmation", "Observation", "Transfer Request ID", "Créé le",
    "Modifié le", "Annulé", "Motif annulation"
  ];
  const auditHeaders = [
    "Date et heure", "Utilisateur", "Action", "Agence expéditrice", "Agence bénéficiaire",
    "Transfer ID", "Ancienne valeur", "Nouvelle valeur", "Résultat", "Détails", "Audit ID"
  ];
  const correctionHeaders = [
    "Correction Request ID", "Transfer ID", "Empreinte correction", "Date reçue",
    "Admin User ID", "Admin Email", "Agence de traçabilité", "Résultat", "Ancien statut",
    "Nouveau statut", "Ancien code masqué", "Nouveau code masqué", "Motif"
  ];
  const transfer = [
    "transfer-1", new Date(), "LSHI", "agent@example.com", "COO", "", 1, "USD", 0, 1,
    "TEST", "OLD-CODE-1234", "*********1234", "TEST LSHI", "TEST COO", "+2290000",
    status, "beneficiary@example.com", new Date(), fundsWithdrawnAt ? "agent" : "",
    fundsWithdrawnAt, "", "", "Observation", randomUUID(), new Date(), new Date(), false, ""
  ];
  const sheets = new Map([
    ["PARAMETRES", new Sheet("PARAMETRES", [parameterHeaders, ["SYSTEM_STATUS", "ACTIF", "", "", ""]])],
    ["TRANSFERTS", new Sheet("TRANSFERTS", [transferHeaders, transfer])],
    ["AUDIT", new Sheet("AUDIT", [auditHeaders])],
    ["TRANSFERTS CODE CORRECTIONS", new Sheet("TRANSFERTS CODE CORRECTIONS", [correctionHeaders])]
  ]);
  const digest = (text) => [...createHash("sha256").update(String(text)).digest()]
    .map((byte) => byte > 127 ? byte - 256 : byte);
  const context = {
    console,
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: (name) => sheets.get(name) ?? null })
    },
    Utilities: {
      Charset: { UTF_8: "UTF_8" },
      DigestAlgorithm: { SHA_256: "SHA_256" },
      computeDigest: (_algorithm, text) => digest(text),
      getUuid: randomUUID
    }
  };
  vm.createContext(context);
  vm.runInContext(`${apps}\nglobalThis.__correct = corrigerCodeTransfertAdmin;`, context);
  return { correct: context.__correct, sheets };
}

function correctionInput(overrides = {}) {
  return {
    transferId: "transfer-1",
    newTransferCode: "NEW-CODE-5678",
    motif: "Correction vérifiée",
    correctionRequestId: randomUUID(),
    adminUserId: "admin-id",
    adminEmail: "admin@example.com",
    actorAgency: "COO",
    ...overrides
  };
}

test("CODE_RECU revient à ENVOYE, efface la réception et produit un Audit masqué", { skip: !apps }, () => {
  const harness = appsHarness("CODE_RECU");
  const input = correctionInput();
  const result = harness.correct(input);
  const row = harness.sheets.get("TRANSFERTS").data[1];
  assert.equal(row[11], "NEW-CODE-5678");
  assert.equal(row[16], "ENVOYE");
  assert.equal(row[17], "");
  assert.equal(row[18], "");
  assert.equal(result.transferCode, undefined);
  assert.equal(result.maskedCode.endsWith("5678"), true);
  const audit = harness.sheets.get("AUDIT").data[1];
  assert.equal(audit[2], "CORRECTION_CODE");
  assert.equal(audit[6], "CODE_RECU");
  assert.equal(audit[7], "ENVOYE");
  assert.equal(JSON.stringify(audit).includes("NEW-CODE-5678"), false);
});

test("même correctionRequestId est idempotent et une autre empreinte entre en conflit", { skip: !apps }, () => {
  const harness = appsHarness("ENVOYE");
  const input = correctionInput();
  assert.doesNotThrow(() => harness.correct(input));
  assert.doesNotThrow(() => harness.correct(input));
  assert.throws(
    () => harness.correct({ ...input, motif: "Autre motif" }),
    /CORRECTION_REQUEST_ID_CONFLICT/
  );
  assert.equal(harness.sheets.get("AUDIT").data.length, 2);
  const technical = JSON.stringify(harness.sheets.get("TRANSFERTS CODE CORRECTIONS").data);
  assert.equal(technical.includes("NEW-CODE-5678"), false);
});

test("A_VERIFIER est maintenu sans retrait et interdit après retrait", { skip: !apps }, () => {
  const allowed = appsHarness("A_VERIFIER");
  allowed.correct(correctionInput());
  assert.equal(allowed.sheets.get("TRANSFERTS").data[1][16], "A_VERIFIER");

  const forbidden = appsHarness("A_VERIFIER", { fundsWithdrawnAt: new Date() });
  assert.throws(
    () => forbidden.correct(correctionInput()),
    /ADMIN_CODE_CORRECTION_AFTER_WITHDRAWAL/
  );
});

test("FONDS_RETIRES, CONFIRME et ANNULE refusent toute correction", { skip: !apps }, () => {
  for (const status of ["FONDS_RETIRES", "CONFIRME", "ANNULE"]) {
    const harness = appsHarness(status);
    assert.throws(
      () => harness.correct(correctionInput()),
      /ADMIN_CODE_CORRECTION_STATUS_FORBIDDEN/
    );
  }
});
