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
        [
          "30/07/2026",
          `PKG-${agency}`,
          "PRIVÉ",
          "PRIVÉ",
          2.5,
          100,
          "",
          "",
          options.sourceStatus ?? "ARRIVÉ",
        ],
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

function parseWithCurrentSearchEdge(response) {
  if (
    response.found === false ||
    (
      response.success === false &&
      [response.erreur, response.message, response.code]
        .filter((value) => typeof value === "string")
        .join(" ")
        .toLowerCase()
        .match(/introuvable|non trouv|not found|aucun colis/)
    )
  ) {
    return { error: "COLIS_INTROUVABLE" };
  }

  const candidate = response.data ?? response.result ?? response.colis ?? response;
  return candidate && typeof candidate === "object" ? candidate : null;
}

function parseWithCurrentPaymentEdge(response) {
  if (
    response === null ||
    typeof response !== "object" ||
    response.success !== true ||
    response.simulation !== false
  ) {
    return null;
  }

  const payment = response.paiement;
  if (
    payment === null ||
    typeof payment !== "object" ||
    typeof payment.nouveauSolde !== "number" ||
    !["SOLDE", "PARTIELLEMENT PAYE"].includes(payment.statutPaiement)
  ) {
    return null;
  }

  return payment;
}

function parseErrorWithCurrentPaymentEdge(response) {
  const supportedCodes = new Set([
    "PAIEMENT_DEJA_ENREGISTRE",
    "MONTANT_INVALIDE",
    "MODE_PAIEMENT_INVALIDE",
    "PAYMENT_REQUEST_ID_INVALIDE",
    "COLIS_DEJA_SOLDE",
    "MONTANT_SUPERIEUR_SOLDE",
    "PAIEMENT_PARTIEL_INTERDIT",
    "AGENCE_INVALIDE",
    "DESTINATION_INVALIDE",
    "COLIS_INTROUVABLE",
    "PAIEMENT_REFUSE",
  ]);
  if (
    response?.success !== false ||
    typeof response.code !== "string" ||
    typeof response.message !== "string" ||
    !supportedCodes.has(response.code)
  ) {
    return null;
  }
  return { code: response.code, message: response.message };
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

test("le statut source affiché Arrivé est normalisé avant écriture", () => {
  const harness = createHarness({ sourceStatus: "Arrivé" });
  const response = harness.request(harness.basePayment());
  assert.equal(response.ok, true);
  assert.equal(harness.payments.getSheetByName("COO").rows[1][13], "ARRIVÉ");
});

for (const sourceStatus of [
  "EN ATTENTE",
  "ENREGISTRÉ",
  "EN VOL",
  "EN TRANSIT",
  "ARRIVÉ",
]) {
  test(`le statut admissible ${sourceStatus} est accepté`, () => {
    const harness = createHarness({ sourceStatus });
    const response = harness.request(harness.basePayment());
    assert.equal(response.ok, true);
    assert.equal(
      harness.payments.getSheetByName("COO").rows[1][13],
      sourceStatus
    );
  });
}

for (const sourceStatus of ["LIVRÉ", "SORTI", "ANNULÉ", "INCONNU"]) {
  test(`le statut non admissible ${sourceStatus} est refusé`, () => {
    const harness = createHarness({ sourceStatus });
    const response = harness.request(harness.basePayment());
    assert.equal(errorCode(response), "STATUT_COLIS_INVALIDE");
    assert.equal(harness.payments.getSheetByName("COO").rows.length, 1);
  });
}

test("un statut source incompatible est refusé avant écriture", () => {
  const harness = createHarness({ sourceStatus: "INCONNU" });
  const response = harness.request(harness.basePayment());
  assert.equal(errorCode(response), "STATUT_COLIS_INVALIDE");
  assert.equal(harness.payments.getSheetByName("COO").rows.length, 1);
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

for (const [inputMode, expectedSheetMode] of [
  ["ESPECES", "ESPÈCES"],
  ["ESPÈCES", "ESPÈCES"],
  ["especes", "ESPÈCES"],
  ["espèces", "ESPÈCES"],
  ["MOBILE MONEY", "MOBILE MONEY"],
  ["MOBILE_MONEY", "MOBILE MONEY"],
  ["mobile_money", "MOBILE MONEY"],
  ["VIREMENT", "VIREMENT"],
  ["AUTRE", "AUTRE"],
]) {
  test(`le mode ${inputMode} est accepté et écrit ${expectedSheetMode}`, () => {
    const harness = createHarness();
    const response = harness.request(
      harness.basePayment({ modePaiement: inputMode })
    );
    assert.equal(response.ok, true);
    assert.equal(
      harness.payments.getSheetByName("COO").rows[1][10],
      expectedSheetMode
    );
  });
}

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

const INTER_AGENCY_ROUTES = [
  ["FIH", "LSHI", 30],
  ["FIH", "KLZ", 35],
  ["LSHI", "FIH", 32.5],
  ["LSHI", "KLZ", 27.5],
  ["KLZ", "FIH", 40],
  ["KLZ", "LSHI", 32.5],
];

for (const [sourceAgency, collectionAgency, amount] of INTER_AGENCY_ROUTES) {
  test(`l'acheminement ${sourceAgency} vers ${collectionAgency} lit la source et encaisse à destination`, () => {
    const harness = createHarness();
    const reference = `FWD-${sourceAgency}-${collectionAgency}-0001`;
    const response = harness.request(harness.basePayment({
      destinationCode: sourceAgency,
      codeColis: `PKG-${sourceAgency}`,
      agenceEncaissement: collectionAgency,
      agent: `AGENT-${collectionAgency}`,
      montantPaye: amount,
      operationType: "INTER_AGENCY_FORWARDING",
      sourceDestinationCode: sourceAgency,
      collectionSiteCode: collectionAgency,
      forwardingDestinationCode: collectionAgency,
      forwardingReference: reference,
    }));

    assert.equal(response.ok, true);
    assert.equal(response.data.paiement.destinationCode, sourceAgency);
    assert.equal(response.data.paiement.montantPaye, amount);
    assert.equal(harness.payments.getSheetByName(collectionAgency).rows.length, 2);
    assert.equal(harness.payments.getSheetByName(sourceAgency).rows.length, sourceAgency === collectionAgency ? 2 : 1);
    const audit = JSON.parse(harness.payments.getSheetByName(collectionAgency).rows[1][14]);
    assert.equal(audit.operationType, "INTER_AGENCY_FORWARDING");
    assert.equal(audit.sourceDestinationCode, sourceAgency);
    assert.equal(audit.collectionSiteCode, collectionAgency);
    assert.equal(audit.forwardingDestinationCode, collectionAgency);
    assert.equal(audit.forwardingReference, reference);
    assert.equal(audit.paymentRequestId, PAYMENT_ID);
  });
}

test("un rejeu inter-agences après perte de réponse retourne le résultat sans seconde écriture", () => {
  const harness = createHarness();
  const command = harness.basePayment({
    destinationCode: "LSHI",
    codeColis: "PKG-LSHI",
    agenceEncaissement: "KLZ",
    agent: "AGENT-KLZ",
    montantPaye: 27.5,
    operationType: "INTER_AGENCY_FORWARDING",
    sourceDestinationCode: "LSHI",
    collectionSiteCode: "KLZ",
    forwardingDestinationCode: "KLZ",
    forwardingReference: "FWD-LSHI-KLZ-REPLAY",
  });
  assert.equal(harness.request(command).ok, true);
  const rowsAfterFirst = harness.payments.getSheetByName("KLZ").rows.length;
  const replay = harness.request(command);
  assert.equal(replay.ok, true);
  assert.equal(replay.data.replayed, true);
  assert.equal(replay.data.paymentRequestId, PAYMENT_ID);
  assert.equal(harness.payments.getSheetByName("KLZ").rows.length, rowsAfterFirst);
});

test("un requestId inter-agences réutilisé avec un contenu différent est refusé", () => {
  const harness = createHarness();
  const command = harness.basePayment({
    destinationCode: "LSHI",
    codeColis: "PKG-LSHI",
    agenceEncaissement: "KLZ",
    agent: "AGENT-KLZ",
    montantPaye: 27.5,
    operationType: "INTER_AGENCY_FORWARDING",
    sourceDestinationCode: "LSHI",
    collectionSiteCode: "KLZ",
    forwardingDestinationCode: "KLZ",
    forwardingReference: "FWD-LSHI-KLZ-CONFLICT",
  });
  assert.equal(harness.request(command).ok, true);
  const conflict = harness.request({ ...command, montantPaye: 28 });
  assert.equal(errorCode(conflict), "IDEMPOTENCY_CONFLICT");
  assert.equal(harness.payments.getSheetByName("KLZ").rows.length, 2);
});

for (const [label, overrides] of [
  ["source identique à la destination", {
    destinationCode: "FIH", sourceDestinationCode: "FIH", agenceEncaissement: "FIH",
    collectionSiteCode: "FIH", forwardingDestinationCode: "FIH",
  }],
  ["COO comme source", {
    destinationCode: "COO", sourceDestinationCode: "COO", agenceEncaissement: "FIH",
    collectionSiteCode: "FIH", forwardingDestinationCode: "FIH",
  }],
  ["COO comme destination", {
    destinationCode: "FIH", sourceDestinationCode: "FIH", agenceEncaissement: "COO",
    collectionSiteCode: "COO", forwardingDestinationCode: "COO",
  }],
]) {
  test(`un acheminement avec ${label} est refusé`, () => {
    const harness = createHarness();
    const response = harness.request(harness.basePayment({
      operationType: "INTER_AGENCY_FORWARDING",
      forwardingReference: "FWD-ROUTE-REFUSED",
      montantPaye: 100,
      ...overrides,
    }));
    assert.ok(["AGENCE_INVALIDE", "DESTINATION_INVALIDE"].includes(errorCode(response)));
    assert.equal(harness.paymentSheets.every((sheet) => sheet.rows.length === 1), true);
  });
}

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
  assert.equal(payment.paiement.codeColis, payment.data.paiement.codeColis);
  assert.equal(payment.paiement.montantPaye, payment.data.paiement.montantPaye);
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

test("une recherche réussie est interprétable par le parseur Edge actuel", () => {
  const harness = createHarness();
  const response = harness.request({
    action: "rechercherColis",
    apiKey: API_KEY,
    destinationCode: "FIH",
    codeColis: "PKG-FIH",
  });
  assert.deepEqual(parseWithCurrentSearchEdge(response), response.data);
});

test("un colis introuvable conserve V2 et les alias Edge au premier niveau", () => {
  const harness = createHarness();
  const response = harness.request({
    action: "rechercherColis",
    apiKey: API_KEY,
    destinationCode: "FIH",
    codeColis: "ABSENT",
  });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "COLIS_INTROUVABLE");
  assert.equal(response.code, response.error.code);
  assert.equal(response.message, response.error.message);
  assert.equal(response.erreur, response.error.message);
  assert.equal(response.found, false);
  assert.deepEqual(parseWithCurrentSearchEdge(response), {
    error: "COLIS_INTROUVABLE",
  });
});

test("un paiement réel expose simulation false au premier niveau", () => {
  const harness = createHarness();
  const response = harness.request(harness.basePayment());
  assert.equal(response.simulation, false);
  assert.equal(response.data.simulation, false);
});

test("les deux soldes de compatibilité sont présents et identiques", () => {
  const harness = createHarness();
  const response = harness.request(harness.basePayment());
  assert.equal(typeof response.paiement.nouveauSolde, "number");
  assert.equal(typeof response.paiement.soldeRestant, "number");
  assert.equal(
    response.paiement.nouveauSolde,
    response.paiement.soldeRestant
  );
});

test("le statut partiel interne est adapté à la forme Edge historique", () => {
  const harness = createHarness();
  const response = harness.request(harness.basePayment());
  assert.equal(response.data.paiement.statutPaiement, "PARTIELLEMENT_PAYE");
  assert.equal(response.paiement.statutPaiement, "PARTIELLEMENT PAYE");
});

test("un succès de paiement est interprétable par le parseur Edge actuel", () => {
  const harness = createHarness();
  const response = harness.request(harness.basePayment());
  const parsed = parseWithCurrentPaymentEdge(response);
  assert.notEqual(parsed, null);
  assert.equal(parsed.nouveauSolde, 60);
});

test("une erreur de paiement est interprétable par le parseur Edge actuel", () => {
  const harness = createHarness();
  const response = harness.request(
    harness.basePayment({ modePaiement: "CARTE" })
  );
  assert.deepEqual(parseErrorWithCurrentPaymentEdge(response), {
    code: "MODE_PAIEMENT_INVALIDE",
    message: "Mode de paiement invalide.",
  });
  assert.equal(response.error.code, response.code);
});

test("les codes V2 de solde et paiement partiel ont leurs alias Edge", () => {
  const harness = createHarness();
  const overBalance = harness.request(
    harness.basePayment({ montantPaye: 101 })
  );
  assert.equal(overBalance.error.code, "MONTANT_SUPERIEUR_AU_SOLDE");
  assert.equal(overBalance.code, "MONTANT_SUPERIEUR_SOLDE");
  assert.equal(
    parseErrorWithCurrentPaymentEdge(overBalance).code,
    "MONTANT_SUPERIEUR_SOLDE"
  );

  const partial = harness.request(
    harness.basePayment({
      agenceEncaissement: "FIH",
      montantPaye: 40,
      paymentRequestId: "223e4567-e89b-42d3-a456-426614174000",
    })
  );
  assert.equal(partial.error.code, "PAIEMENT_PARTIEL_NON_AUTORISE");
  assert.equal(partial.code, "PAIEMENT_PARTIEL_INTERDIT");
  assert.equal(
    parseErrorWithCurrentPaymentEdge(partial).code,
    "PAIEMENT_PARTIEL_INTERDIT"
  );
});

test("un montant attendu nul produit COLIS_DEJA_SOLDE sans écriture", () => {
  const harness = createHarness();
  harness.manifest.getSheetByName("FIH").rows[1][5] = 0;
  const response = harness.request(harness.basePayment());
  assert.equal(errorCode(response), "COLIS_DEJA_SOLDE");
  assert.notEqual(errorCode(response), "SERVICE_INDISPONIBLE");
  assert.equal(harness.payments.getSheetByName("COO").rows.length, 1);
  assert.equal(harness.lockReleased, true);
});

test("un solde nul est refusé sans nouvelle écriture", () => {
  const harness = createHarness();
  harness.payments.getSheetByName("COO").rows.push([
    "", "PKG-FIH", "", "", 100, 0, "COO", "FIH / Kinshasa",
    "SOLDÉ", "", "", "", "", "", "",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ]);
  const rowCount = harness.payments.getSheetByName("COO").rows.length;
  const response = harness.request(harness.basePayment());
  assert.equal(errorCode(response), "COLIS_DEJA_SOLDE");
  assert.equal(harness.payments.getSheetByName("COO").rows.length, rowCount);
});

test("le statut LIVRÉ ne transforme pas un colis soldé en paiement autorisé", () => {
  const harness = createHarness();
  harness.manifest.getSheetByName("FIH").rows[1][8] = "LIVRÉ";
  harness.payments.getSheetByName("FIH").rows.push([
    "", "PKG-FIH", "", "", 100, 0, "FIH", "FIH / Kinshasa",
    "SOLDÉ", "", "", "", "", "", "",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ]);
  const response = harness.request(harness.basePayment());
  assert.equal(errorCode(response), "COLIS_DEJA_SOLDE");
  assert.equal(harness.sourceSheets.every((sheet) => sheet.writeCount === 0), true);
});

test("un paiement destination Stockage ne lit pas le Manifeste Public", () => {
  const harness = createHarness();
  harness.sourceSheets.forEach((sheet) => { sheet.rows = []; });
  const response = harness.request(harness.basePayment({
    agenceEncaissement: "FIH",
    montantPaye: 60,
    operationType: "STORAGE_DESTINATION_PAYMENT",
    sourceDestinationCode: "FIH",
    collectionSiteCode: "FIH",
    canonicalWeightKg: 2.5,
    canonicalExpectedAmount: 100,
    canonicalTotalPaid: 40
  }));
  assert.equal(response.success, true);
  assert.equal(response.paiement.montantPaye, 60);
  assert.equal(response.paiement.nouveauSolde, 0);
  assert.equal(harness.sourceSheets.every((sheet) => sheet.writeCount === 0), true);
});
