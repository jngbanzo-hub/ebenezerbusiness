import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const enginePath = path.join(directory, "..", "Code.gs");
const source = fs.readFileSync(enginePath, "utf8");
const API_KEY = "local-test-key";
const PAYMENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const HEADERS = [
  "Date et heure",
  "Code colis",
  "Poids (Kg)",
  "Montant attendu",
  "Montant payé",
  "Solde restant",
  "Agence d'encaissement",
  "Destination du colis",
  "Statut paiement",
  "Agent",
  "Mode de paiement",
  "Référence paiement",
  "Date du colis",
  "Statut colis",
  "Observation",
  "Payment Request ID",
];

class RangeMock {
  constructor(sheet, row, column, rows = 1, columns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }

  getValues() {
    return this.#read();
  }

  getDisplayValues() {
    return this.#read().map((row) =>
      row.map((value) => value === null || value === undefined ? "" : String(value))
    );
  }

  getDisplayValue() {
    return this.getDisplayValues()[0][0];
  }

  setValues(values) {
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const targetRow = this.row - 1 + row;
        const targetColumn = this.column - 1 + column;
        this.sheet.rows[targetRow] ??= [];
        this.sheet.rows[targetRow][targetColumn] = values[row][column];
      }
    }
    this.sheet.writeCount += 1;
    return this;
  }

  #read() {
    return Array.from({ length: this.rows }, (_, row) =>
      Array.from(
        { length: this.columns },
        (_, column) =>
          this.sheet.rows[this.row - 1 + row]?.[this.column - 1 + column] ?? ""
      )
    );
  }
}

class SheetMock {
  constructor(name, rows) {
    this.name = name;
    this.rows = rows.map((row) => [...row]);
    this.writeCount = 0;
  }

  getLastRow() {
    return this.rows.length;
  }

  getRange(row, column, rows = 1, columns = 1) {
    return new RangeMock(this, row, column, rows, columns);
  }
}

class SpreadsheetMock {
  constructor(sheets) {
    this.sheets = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  }

  getSheetByName(name) {
    return this.sheets.get(name) ?? null;
  }
}

function createHarness(options = {}) {
  const paymentSheets = ["COO", "FIH", "LSHI", "KLZ"].map(
    (agency) => new SheetMock(agency, [[...HEADERS]])
  );
  const sourceSheets = ["FIH", "LSHI", "KLZ"].map(
    (agency) =>
      new SheetMock(agency, [
        ["Date", "Code", "Nom", "Téléphone", "Poids", "Montant", "", "", "Statut"],
        ["30/07/2026", `PKG-${agency}`, "PRIVÉ", "PRIVÉ", 2.5, 100, "", "", "ARRIVÉ"],
      ])
  );
  const payments = new SpreadsheetMock(paymentSheets);
  const manifest = new SpreadsheetMock(sourceSheets);
  let flushCount = 0;
  let lockReleased = false;
  const lock = {
    tryLock: () => options.lockAvailable !== false,
    releaseLock: () => {
      lockReleased = true;
    },
  };
  let uuidCounter = 0;

  const context = vm.createContext({
    Array,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    RegExp,
    String,
    console: {
      log() {},
      error() {},
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(content) {
        return {
          content,
          mimeType: null,
          setMimeType(mimeType) {
            this.mimeType = mimeType;
            return this;
          },
        };
      },
    },
    LockService: {
      getScriptLock: () => lock,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () =>
          options.missingStoredApiKey ? null : API_KEY,
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => payments,
      openById: () => manifest,
      flush: () => {
        flushCount += 1;
      },
    },
    Utilities: {
      getUuid: () =>
        `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
    },
  });

  vm.runInContext(source, context, { filename: enginePath });

  function request(body, raw) {
    context.__event = raw !== undefined
      ? { postData: { contents: raw } }
      : { postData: { contents: JSON.stringify(body) } };
    const output = vm.runInContext("doPost(__event)", context);
    return JSON.parse(output.content);
  }

  function basePayment(overrides = {}) {
    return {
      action: "enregistrerPaiement",
      apiKey: API_KEY,
      destinationCode: "FIH",
      codeColis: "PKG-FIH",
      agenceEncaissement: "COO",
      agent: "AGENT-COO",
      modePaiement: "ESPÈCES",
      montantPaye: 40,
      paymentRequestId: PAYMENT_ID,
      ...overrides,
    };
  }

  return {
    request,
    basePayment,
    payments,
    manifest,
    paymentSheets,
    sourceSheets,
    get flushCount() {
      return flushCount;
    },
    get lockReleased() {
      return lockReleased;
    },
  };
}

function errorCode(response) {
  return response.error?.code;
}

test("une seule déclaration doPost existe", () => {
  assert.equal((source.match(/function\s+doPost\s*\(/g) ?? []).length, 1);
});

test("ping retourne le contrat V2 sans configuration interne", () => {
  const harness = createHarness();
  const response = harness.request({ action: "ping", apiKey: API_KEY });
  assert.equal(response.ok, true);
  assert.deepEqual(response.data, {
    service: "paiements-agents",
    status: "available",
    contractVersion: "2",
  });
  assert.equal(JSON.stringify(response).includes("SOURCE_COLIS_ID"), false);
});

test("une action inconnue est refusée", () => {
  const response = createHarness().request({ action: "autre", apiKey: API_KEY });
  assert.equal(errorCode(response), "ACTION_NON_AUTORISEE");
});

test("un JSON invalide est refusé", () => {
  const response = createHarness().request(null, "{");
  assert.equal(errorCode(response), "JSON_INVALIDE");
});

test("une clé API absente est refusée", () => {
  const response = createHarness().request({ action: "ping" });
  assert.equal(errorCode(response), "ACCES_REFUSE");
});

test("une clé API incorrecte est refusée sans être renvoyée", () => {
  const response = createHarness().request({ action: "ping", apiKey: "wrong" });
  assert.equal(errorCode(response), "ACCES_REFUSE");
  assert.equal(JSON.stringify(response).includes("wrong"), false);
});

test("la recherche FIH retourne une projection limitée", () => {
  const response = createHarness().request({
    action: "rechercherColis",
    apiKey: API_KEY,
    destinationCode: "FIH",
    codeColis: "PKG-FIH",
  });
  assert.equal(response.ok, true);
  assert.equal(response.data.codeColis, "PKG-FIH");
  assert.equal(response.data.montantAttendu, 100);
  assert.equal(JSON.stringify(response).includes("PRIVÉ"), false);
});

test("la recherche distingue le colis introuvable", () => {
  const response = createHarness().request({
    action: "rechercherColis",
    apiKey: API_KEY,
    destinationCode: "FIH",
    codeColis: "ABSENT",
  });
  assert.equal(errorCode(response), "COLIS_INTROUVABLE");
});

test("une destination invalide est refusée", () => {
  const response = createHarness().request({
    action: "rechercherColis",
    apiKey: API_KEY,
    destinationCode: "COO",
    codeColis: "PKG-FIH",
  });
  assert.equal(errorCode(response), "DESTINATION_INVALIDE");
});

test("COO peut effectuer un paiement partiel", () => {
  const harness = createHarness();
  const response = harness.request(harness.basePayment());
  assert.equal(response.ok, true);
  assert.equal(response.data.paiement.soldeRestant, 60);
});

for (const agency of ["FIH", "LSHI", "KLZ"]) {
  test(`${agency} refuse un paiement partiel`, () => {
    const harness = createHarness();
    const response = harness.request(
      harness.basePayment({
        destinationCode: agency,
        codeColis: `PKG-${agency}`,
        agenceEncaissement: agency,
      })
    );
    assert.equal(errorCode(response), "PAIEMENT_PARTIEL_NON_AUTORISE");
  });
}

test("FIH ne peut pas encaisser LSHI", () => {
  const harness = createHarness();
  const response = harness.request(
    harness.basePayment({
      destinationCode: "LSHI",
      codeColis: "PKG-LSHI",
      agenceEncaissement: "FIH",
    })
  );
  assert.equal(errorCode(response), "AGENCE_INVALIDE");
});

test("COO peut encaisser LSHI", () => {
  const harness = createHarness();
  const response = harness.request(
    harness.basePayment({
      destinationCode: "LSHI",
      codeColis: "PKG-LSHI",
    })
  );
  assert.equal(response.ok, true);
});

test("un montant supérieur au solde est refusé", () => {
  const harness = createHarness();
  const response = harness.request(harness.basePayment({ montantPaye: 101 }));
  assert.equal(errorCode(response), "MONTANT_SUPERIEUR_AU_SOLDE");
});

for (const amount of [0, -1, 1.001]) {
  test(`le montant invalide ${amount} est refusé`, () => {
    const harness = createHarness();
    const response = harness.request(harness.basePayment({ montantPaye: amount }));
    assert.equal(errorCode(response), "MONTANT_INVALIDE");
  });
}

test("un mode inconnu est refusé", () => {
  const harness = createHarness();
  const response = harness.request(harness.basePayment({ modePaiement: "CARTE" }));
  assert.equal(errorCode(response), "MODE_PAIEMENT_INVALIDE");
});

test("paymentRequestId absent est refusé", () => {
  const harness = createHarness();
  const body = harness.basePayment();
  delete body.paymentRequestId;
  assert.equal(
    errorCode(harness.request(body)),
    "PAYMENT_REQUEST_ID_INVALIDE"
  );
});

test("un UUID non v4 est refusé", () => {
  const harness = createHarness();
  const response = harness.request(
    harness.basePayment({ paymentRequestId: "invalid" })
  );
  assert.equal(errorCode(response), "PAYMENT_REQUEST_ID_INVALIDE");
});

test("un doublon paymentRequestId est refusé sans seconde ligne", () => {
  const harness = createHarness();
  assert.equal(harness.request(harness.basePayment()).ok, true);
  const rowsAfterFirst = harness.payments.getSheetByName("COO").rows.length;
  const duplicate = harness.request(harness.basePayment());
  assert.equal(errorCode(duplicate), "PAIEMENT_DEJA_ENREGISTRE");
  assert.equal(harness.payments.getSheetByName("COO").rows.length, rowsAfterFirst);
});

test("l'anti-doublon couvre les quatre feuilles", () => {
  for (const agency of ["COO", "FIH", "LSHI", "KLZ"]) {
    const harness = createHarness();
    harness.payments.getSheetByName(agency).rows.push([
      "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", PAYMENT_ID,
    ]);
    assert.equal(
      errorCode(harness.request(harness.basePayment())),
      "PAIEMENT_DEJA_ENREGISTRE"
    );
  }
});

test("la colonne 16 sans en-tête est refusée", () => {
  const harness = createHarness();
  harness.payments.getSheetByName("COO").rows[0][15] = "";
  assert.equal(
    errorCode(harness.request(harness.basePayment())),
    "STRUCTURE_FEUILLE_INVALIDE"
  );
});

test("un en-tête incorrect est refusé", () => {
  const harness = createHarness();
  harness.payments.getSheetByName("FIH").rows[0][15] = "Request";
  assert.equal(
    errorCode(harness.request(harness.basePayment())),
    "STRUCTURE_FEUILLE_INVALIDE"
  );
});

test("un verrou indisponible produit une erreur stable", () => {
  const harness = createHarness({ lockAvailable: false });
  assert.equal(
    errorCode(harness.request(harness.basePayment())),
    "VERROU_INDISPONIBLE"
  );
});

test("les erreurs ne contiennent aucune stack trace", () => {
  const response = createHarness().request(null, "{");
  assert.equal("stack" in response.error, false);
  assert.equal(JSON.stringify(response).includes(enginePath), false);
});

test("un paiement ne modifie aucun statut du manifeste", () => {
  const harness = createHarness();
  const before = structuredClone(harness.sourceSheets.map((sheet) => sheet.rows));
  harness.request(harness.basePayment());
  assert.deepEqual(harness.sourceSheets.map((sheet) => sheet.rows), before);
  assert.equal(harness.sourceSheets.every((sheet) => sheet.writeCount === 0), true);
});

test("un paiement ne crée aucun mouvement de stock", () => {
  assert.equal(/createStockEvent|StockEvent|SORTIE_DESTINATION/.test(source), false);
});

test("aucun type ou appel Transferts n'existe", () => {
  assert.equal(/\bTRANSFER\b|\bTRANSFERTS?\b/i.test(source), false);
});

test("aucun lien avec la Caisse n'existe", () => {
  assert.equal(/\bCAISSE\b/i.test(source), false);
});

test("les champs de compatibilité dérivent de l'enveloppe V2", () => {
  const harness = createHarness();
  const search = harness.request({
    action: "rechercherColis",
    apiKey: API_KEY,
    destinationCode: "FIH",
    codeColis: "PKG-FIH",
  });
  assert.deepEqual(search.colis, search.data);
  assert.equal(search.found, true);
  assert.equal(search.success, search.ok);
  assert.equal(search.succes, search.ok);

  const payment = harness.request(harness.basePayment());
  assert.deepEqual(payment.paiement, payment.data.paiement);
  assert.equal(payment.paymentRequestId, payment.data.paymentRequestId);
});

test("requestId et paymentRequestId restent distincts", () => {
  const harness = createHarness();
  const response = harness.request(harness.basePayment());
  assert.equal(response.data.paymentRequestId, PAYMENT_ID);
  assert.notEqual(response.requestId, response.data.paymentRequestId);
});

test("l'écriture contient exactement 16 colonnes et libère le verrou", () => {
  const harness = createHarness();
  const response = harness.request(harness.basePayment());
  const row = harness.payments.getSheetByName("COO").rows[1];
  assert.equal(response.ok, true);
  assert.equal(row.length, 16);
  assert.equal(row[15], PAYMENT_ID);
  assert.equal(harness.flushCount, 1);
  assert.equal(harness.lockReleased, true);
});
