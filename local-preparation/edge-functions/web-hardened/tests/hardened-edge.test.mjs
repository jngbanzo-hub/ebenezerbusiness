import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts from "typescript";

const root = new URL("../", import.meta.url);
const searchSource = await readFile(
  new URL("paiements-agents-rechercher-colis/index.ts", root),
  "utf8"
);
const paymentSource = await readFile(
  new URL("paiements-agents-enregistrer-paiement/index.ts", root),
  "utf8"
);
const siteClientSource = await readFile(
  new URL("../../../../src/features/agent/functions.ts", import.meta.url),
  "utf8"
);
const agentWorkspaceSource = await readFile(
  new URL("../../../../src/features/agent/agent-workspace.tsx", import.meta.url),
  "utf8"
);
const agentExpenseFormSource = await readFile(
  new URL("../../../../src/features/agent/agent-expense-form.tsx", import.meta.url),
  "utf8"
);

const runtime = {
  authInvalid: false,
  cashAccountActive: true,
  cashRpcError: null,
  cashRows: [],
  fetchCalls: [],
  profiles: {},
  profile: null,
  rpcCalls: [],
  upstream: null
};

globalThis.__edgeRuntime = {
  createClient(_url, key, options = {}) {
    if (key === "local-service-role") {
      return {
        schema() { return this; },
        from(table) {
          const filters = {};
          const chain = {
            select() { return chain; },
            eq(name, value) { filters[name] = value; return chain; },
            async maybeSingle() {
              const data = runtime.cashRows.find((row) =>
                table === "cash_events" &&
                Object.entries(filters).every(([name, value]) => row[name] === value)
              ) ?? null;
              return { data, error: null };
            }
          };
          return chain;
        },
        async rpc(name, params) {
          runtime.rpcCalls.push({ name, params });
          if (!runtime.cashAccountActive) {
            return { data: null, error: { message: "CASH_ACCOUNT_NOT_ACTIVE" } };
          }
          if (runtime.cashRpcError) {
            return { data: null, error: { message: runtime.cashRpcError } };
          }
          const byRequest = runtime.cashRows.find((row) =>
            row.source_request_id === params.p_payment_request_id
          );
          if (byRequest) {
            return byRequest.metadata.commandFingerprint === params.p_command_fingerprint
              ? { data: { eventId: byRequest.event_id, replayed: true, version: byRequest.version_after }, error: null }
              : { data: null, error: { message: "IDEMPOTENCY_CONFLICT" } };
          }
          const sourceId = `parcel:${params.p_agency}:${params.p_payment_reference}`;
          if (runtime.cashRows.some((row) => row.source_id === sourceId)) {
            return { data: null, error: { message: "PAYMENT_ALREADY_CREDITED" } };
          }
          const row = {
            actor_user_id: params.p_actor_user_id,
            agency: params.p_agency,
            amount: params.p_amount,
            event_id: `event-${params.p_payment_request_id}`,
            event_type: "PAYMENT_CREDIT_RECORDED",
            metadata: {
              ...params.p_metadata,
              commandFingerprint: params.p_command_fingerprint
            },
            source_id: sourceId,
            source_type: "PAYMENT_ENGINE",
            source_request_id: params.p_payment_request_id,
            version_after: runtime.cashRows.filter((item) => item.agency === params.p_agency).length + 2
          };
          runtime.cashRows.push(row);
          return { data: { eventId: row.event_id, replayed: false, version: row.version_after }, error: null };
        }
      };
    }
    const token = options.global?.headers?.Authorization?.replace(/^Bearer\s+/i, "") ?? "valid";
    const chain = {
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      async maybeSingle() {
        return { data: runtime.profiles[token] ?? runtime.profile, error: null };
      }
    };
    return {
      auth: {
        async getUser(candidateToken) {
          return runtime.authInvalid
            ? { data: { user: null }, error: new Error("invalid") }
            : { data: { user: { id: runtime.profiles[candidateToken]?.id ?? "user-1" } }, error: null };
        }
      },
      schema() {
        return this;
      },
      from() {
        return chain;
      }
    };
  },
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "public-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
    PAYMENTS_ORCHESTRATION_HMAC_SECRET: "local-orchestration-hmac-secret",
    CASH_PAYMENT_CREDITS_ENABLED: "false",
    PAIEMENTS_AGENTS_APPS_SCRIPT_URL: "https://script.google.test/exec",
    PAIEMENTS_AGENTS_API_KEY: "local-test-key",
    PAIEMENTS_AGENTS_TIMEOUT_MS: "1000"
  },
  async fetch(url, init) {
    runtime.fetchCalls.push({ url, init });
    return typeof runtime.upstream === "function"
      ? runtime.upstream(url, init)
      : runtime.upstream;
  }
};

globalThis.Deno = {
  env: {
    get(key) {
      return globalThis.__edgeRuntime.env[key];
    }
  }
};
globalThis.fetch = (...args) => globalThis.__edgeRuntime.fetch(...args);

async function loadHandler(source, label) {
  let handler;
  globalThis.__registerHandler = (candidate) => {
    handler = candidate;
  };
  const testable = source
    .replace(
      'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";',
      "const createClient = (...args) => globalThis.__edgeRuntime.createClient(...args);"
    )
    .replace("Deno.serve(", "globalThis.__registerHandler(");
  const compiled = ts.transpileModule(testable, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${label}`
  );
  assert.equal(typeof handler, "function");
  return handler;
}

const searchHandler = await loadHandler(searchSource, "search");
const paymentHandler = await loadHandler(paymentSource, "payment");

function reset(profile = agentProfile("COTONOU")) {
  runtime.authInvalid = false;
  runtime.cashAccountActive = true;
  runtime.cashRpcError = null;
  runtime.cashRows = [];
  runtime.fetchCalls = [];
  runtime.profiles = {};
  runtime.profile = profile;
  runtime.rpcCalls = [];
  runtime.upstream = null;
  globalThis.__edgeRuntime.env.CASH_PAYMENT_CREDITS_ENABLED = "false";
}

function agentProfile(agence, overrides = {}) {
  return {
    id: "user-1",
    nom: "Agent Test",
    agence,
    role: "AGENT",
    actif: true,
    ...overrides
  };
}

function searchRequest(destinationCode, overrides = {}, token = "valid", headers = {}) {
  return new Request("https://edge.test/search", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, ...headers } : headers,
    body: JSON.stringify({
      destinationCode,
      codeColis: "COLIS-001",
      ...overrides
    })
  });
}

const validUuid = "A0B1C2D3-E4F5-4A67-8B90-123456789ABC";
function paymentRequest(overrides = {}, token = "valid") {
  return new Request("https://edge.test/payment", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({
      destinationCode: "FIH",
      codeColis: "COLIS-001",
      montantPaye: 25,
      modePaiement: "ESPECES",
      referencePaiement: "",
      observation: "",
      paymentRequestId: validUuid,
      ...overrides
    })
  });
}

async function signedForwardingPaymentRequest(overrides = {}) {
  const body = {
    destinationCode: "LSHI",
    codeColis: "COLIS-001",
    montantPaye: 66,
    modePaiement: "ESPECES",
    referencePaiement: "",
    observation: "",
    paymentRequestId: validUuid,
    operationContext: {
      type: "INTER_AGENCY_FORWARDING",
      sourceDestinationCode: "LSHI",
      collectionSiteCode: "KLZ",
      forwardingDestinationCode: "KLZ",
      forwardingReference: "JL111126-LSHI-KLZ",
    },
    ...overrides,
  };
  const serialized = JSON.stringify(body);
  const timestamp = Date.now().toString();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(globalThis.__edgeRuntime.env.PAYMENTS_ORCHESTRATION_HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${serialized}`)
  );
  const signature = Array.from(new Uint8Array(signed))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return new Request("https://edge.test/payment", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid",
      "X-Ebe-Orchestration-Timestamp": timestamp,
      "X-Ebe-Orchestration-Signature": signature,
    },
    body: serialized,
  });
}

function searchSuccess(destinationCode = "FIH") {
  return new Response(
    JSON.stringify({
      success: true,
      found: true,
      colis: {
        codeColis: "COLIS-001",
        dateColis: "2026-07-30",
        destinationCode,
        destinationNom: destinationCode,
        poidsKg: 1,
        montantAttendu: 100,
        montantDejaPaye: 0,
        soldeRestant: 100,
        statutColis: "ENREGISTRE"
      }
    }),
    { status: 200 }
  );
}

function paymentSuccess(destinationCode = "FIH", amount = 25) {
  return new Response(
    JSON.stringify({
      success: true,
      simulation: false,
      paiement: {
        codeColis: "COLIS-001",
        destinationCode,
        montantPaye: amount,
        nouveauTotalPaye: amount,
        nouveauSolde: 100 - amount,
        statutPaiement: amount === 100 ? "SOLDE" : "PARTIELLEMENT PAYE",
        datePaiement: "2026-07-30T12:00:00.000Z"
      }
    }),
    { status: 200 }
  );
}

function enableCashCredits() {
  globalThis.__edgeRuntime.env.CASH_PAYMENT_CREDITS_ENABLED = "true";
}

async function json(response) {
  return { status: response.status, body: await response.json() };
}

test("01 JWT absent refusé", async () => {
  reset();
  const result = await json(await searchHandler(searchRequest("FIH", {}, "")));
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "SESSION_EXPIREE");
});

test("02 JWT invalide refusé", async () => {
  reset();
  runtime.authInvalid = true;
  const result = await json(await searchHandler(searchRequest("FIH")));
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "SESSION_EXPIREE");
});

test("03 profil absent refusé", async () => {
  reset(null);
  assert.equal((await searchHandler(searchRequest("FIH"))).status, 403);
});

test("04 profil inactif refusé", async () => {
  reset(agentProfile("COTONOU", { actif: false }));
  const result = await json(await searchHandler(searchRequest("FIH")));
  assert.equal(result.body.error, "COMPTE_DESACTIVE");
});

test("05 rôle inconnu refusé", async () => {
  reset(agentProfile("COTONOU", { role: "UNKNOWN" }));
  const result = await json(await searchHandler(searchRequest("FIH")));
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "ACCES_REFUSE");
});

test("05b ADMIN actif sans contexte QR serveur refusé", async () => {
  reset(agentProfile("ADMIN", { role: "ADMIN" }));
  runtime.upstream = searchSuccess("LSHI");
  const result = await json(await searchHandler(searchRequest("LSHI")));
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "ACCES_REFUSE");
  assert.equal(runtime.fetchCalls.length, 0);
});

test("05c ADMIN actif avec contexte QR serveur autorisé sans agence Agent", async () => {
  reset(agentProfile("ADMIN", { role: "ADMIN" }));
  runtime.upstream = searchSuccess("LSHI");
  const response = await searchHandler(searchRequest("LSHI", {}, "valid", {
    "X-Ebe-Operation-Context": "ADMIN_QR_CORRECTION"
  }));
  assert.equal(response.status, 200);
  assert.equal(runtime.fetchCalls.length, 1);
});

test("06 AGENT actif autorisé", async () => {
  reset();
  runtime.upstream = searchSuccess();
  assert.equal((await searchHandler(searchRequest("FIH"))).status, 200);
});

test("07 rôle envoyé dans le corps ne fait jamais autorité", async () => {
  reset();
  const result = await json(
    await searchHandler(searchRequest("FIH", { role: "AGENT" }))
  );
  assert.equal(result.status, 400);
  assert.equal(runtime.fetchCalls.length, 0);
});

for (const [number, agency, destination, allowed] of [
  ["08", "COTONOU", "FIH", true],
  ["09", "COTONOU", "LSHI", true],
  ["10", "COTONOU", "KLZ", true],
  ["11", "FIH", "FIH", true],
  ["12", "FIH", "LSHI", true],
  ["13", "FIH", "KLZ", true],
  ["14", "LSHI", "LSHI", true],
  ["15", "LSHI", "FIH", true],
  ["16", "LSHI", "KLZ", true],
  ["17", "KLZ", "KLZ", true],
  ["18", "KLZ", "FIH", true],
  ["19", "KLZ", "LSHI", true]
]) {
  test(`${number} ${agency} recherche ${destination} ${
    allowed ? "autorisée" : "refusée"
  }`, async () => {
    reset(agentProfile(agency));
    runtime.upstream = searchSuccess(destination);
    const response = await searchHandler(searchRequest(destination));
    assert.equal(response.status, allowed ? 200 : 403);
    assert.equal(runtime.fetchCalls.length, allowed ? 1 : 0);
  });
}

test("20 destination inconnue refusée", async () => {
  reset();
  assert.equal((await searchHandler(searchRequest("XXX"))).status, 403);
});

test("21 agence inconnue refusée avant Apps Script", async () => {
  reset(agentProfile("UNKNOWN"));
  const response = await searchHandler(searchRequest("FIH"));
  assert.equal(response.status, 403);
  assert.equal(runtime.fetchCalls.length, 0);
});

test("22 COO paiement partiel autorisé", async () => {
  reset();
  runtime.upstream = paymentSuccess("FIH", 25);
  assert.equal((await paymentHandler(paymentRequest())).status, 200);
});

test("23 agence destination paiement partiel refusé", async () => {
  reset(agentProfile("FIH"));
  runtime.upstream = new Response(
    JSON.stringify({
      success: false,
      code: "PAIEMENT_PARTIEL_INTERDIT",
      message: "interne non public"
    }),
    { status: 200 }
  );
  const result = await json(await paymentHandler(paymentRequest()));
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "PAIEMENT_PARTIEL_INTERDIT");
});

test("24 agence falsifiée dans le corps ne fait jamais autorité", async () => {
  reset(agentProfile("FIH"));
  const response = await paymentHandler(
    paymentRequest({ agenceEncaissement: "COO" })
  );
  assert.equal(response.status, 400);
  assert.equal(runtime.fetchCalls.length, 0);
});

test("25 paymentRequestId absent refusé", async () => {
  reset();
  const body = {
    destinationCode: "FIH",
    codeColis: "COLIS-001",
    montantPaye: 25,
    modePaiement: "ESPECES",
    referencePaiement: "",
    observation: ""
  };
  const request = new Request("https://edge.test/payment", {
    method: "POST",
    headers: { Authorization: "Bearer valid" },
    body: JSON.stringify(body)
  });
  const result = await json(await paymentHandler(request));
  assert.equal(result.body.error, "PAYMENT_REQUEST_ID_INVALIDE");
});

test("26 UUID non-v4 refusé", async () => {
  reset();
  const response = await paymentHandler(
    paymentRequest({ paymentRequestId: "not-an-uuid" })
  );
  assert.equal(response.status, 400);
});

test("27 UUID v4 valide accepté", async () => {
  reset();
  runtime.upstream = paymentSuccess();
  assert.equal((await paymentHandler(paymentRequest())).status, 200);
});

test("28 UUID normalisé en minuscules", async () => {
  reset();
  runtime.upstream = paymentSuccess();
  await paymentHandler(paymentRequest());
  const payload = JSON.parse(runtime.fetchCalls[0].init.body);
  assert.equal(payload.paymentRequestId, validUuid.toLowerCase());
});

test("29 UUID transmis sans remplacement", async () => {
  reset();
  runtime.upstream = paymentSuccess();
  await paymentHandler(paymentRequest());
  const payload = JSON.parse(runtime.fetchCalls[0].init.body);
  assert.equal(payload.paymentRequestId, validUuid.toLowerCase());
});

test("30 double tentative conserve le même UUID", async () => {
  reset();
  runtime.upstream = paymentSuccess();
  await paymentHandler(paymentRequest());
  await paymentHandler(paymentRequest());
  const identifiers = runtime.fetchCalls.map(
    ({ init }) => JSON.parse(init.body).paymentRequestId
  );
  assert.deepEqual(identifiers, [validUuid.toLowerCase(), validUuid.toLowerCase()]);
});

test("31 clé inattendue refusée selon le contrat strict", async () => {
  reset();
  assert.equal(
    (await searchHandler(searchRequest("FIH", { unexpected: true }))).status,
    400
  );
});

test("31b contexte inter-agences injecté par le navigateur refusé sans appel amont", async () => {
  reset(agentProfile("KLZ"));
  const response = await json(await paymentHandler(paymentRequest({
    destinationCode: "LSHI",
    montantPaye: 66,
    operationContext: {
      type: "INTER_AGENCY_FORWARDING",
      sourceDestinationCode: "LSHI",
      collectionSiteCode: "KLZ",
      forwardingDestinationCode: "KLZ",
      forwardingReference: "JL111126-LSHI-KLZ",
    },
  })));
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "ACCES_REFUSE");
  assert.equal(runtime.fetchCalls.length, 0);
});

test("31c contexte inter-agences signé conserve la source et l'agence authentifiée", async () => {
  reset(agentProfile("KLZ"));
  runtime.upstream = paymentSuccess("LSHI", 66);
  const response = await json(await paymentHandler(await signedForwardingPaymentRequest()));
  assert.equal(response.status, 200);
  assert.equal(runtime.fetchCalls.length, 1);
  const upstream = JSON.parse(runtime.fetchCalls[0].init.body);
  assert.equal(upstream.destinationCode, "LSHI");
  assert.equal(upstream.agenceEncaissement, "KLZ");
  assert.equal(upstream.operationType, "INTER_AGENCY_FORWARDING");
  assert.equal(upstream.sourceDestinationCode, "LSHI");
  assert.equal(upstream.collectionSiteCode, "KLZ");
  assert.equal(upstream.forwardingDestinationCode, "KLZ");
  assert.equal(upstream.paymentRequestId, validUuid.toLowerCase());
});

test("32 code colis invalide refusé", async () => {
  reset();
  assert.equal(
    (await searchHandler(searchRequest("FIH", { codeColis: "!" }))).status,
    400
  );
});

test("33 mode invalide refusé", async () => {
  reset();
  assert.equal(
    (await paymentHandler(paymentRequest({ modePaiement: "CRYPTO" }))).status,
    400
  );
});

test("34 montant invalide refusé", async () => {
  reset();
  assert.equal(
    (await paymentHandler(paymentRequest({ montantPaye: -1 }))).status,
    400
  );
});

test("35 réponse Apps Script malformée refusée", async () => {
  reset();
  runtime.upstream = new Response(JSON.stringify({ success: true }), {
    status: 200
  });
  assert.equal((await paymentHandler(paymentRequest())).status, 503);
});

test("36 message Apps Script non sûr non exposé", async () => {
  reset();
  runtime.upstream = new Response(
    JSON.stringify({
      success: false,
      code: "PAIEMENT_PARTIEL_INTERDIT",
      message: "SQL agents secret stack"
    }),
    { status: 200 }
  );
  const result = await json(await paymentHandler(paymentRequest()));
  assert.equal(result.status, 400);
  assert.equal(JSON.stringify(result.body).includes("SQL agents secret stack"), false);
  assert.equal(
    result.body.message,
    "Le paiement partiel n’est pas autorisé pour cette agence."
  );
});

test("36b statut colis invalide propagé sans refus générique", async () => {
  reset();
  runtime.upstream = new Response(
    JSON.stringify({
      success: false,
      code: "STATUT_COLIS_INVALIDE",
      message: "détail amont non exposable",
    }),
    { status: 200 }
  );
  const result = await json(await paymentHandler(paymentRequest()));
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "STATUT_COLIS_INVALIDE");
  assert.equal(
    result.body.message,
    "Le statut du colis est incompatible avec la feuille de paiement."
  );
  assert.equal(JSON.stringify(result.body).includes("détail amont"), false);
});

test("37 expiration de session correctement signalée", async () => {
  reset();
  runtime.authInvalid = true;
  const result = await json(await paymentHandler(paymentRequest()));
  assert.deepEqual(result, {
    status: 401,
    body: { error: "SESSION_EXPIREE" }
  });
});

for (const [number, label, forbidden] of [
  ["38", "aucune modification de statut colis", /set.*statut|update.*statut/i],
  ["39", "aucun événement de livraison", /DELIVERY_CONFIRMED|LIVRAISON_EVENT/],
  ["40", "aucun mouvement de stock", /StockEvent|STOCK_MOVEMENT/],
  ["41", "aucun appel Transferts", /TRANSFERTS_API|transferId/],
  ["42", "aucune ancienne API Caisse ni FinancialEvent", /CAISSE_API|FinancialEvent/],
  ["43", "aucune écriture Google Sheets directe", /spreadsheets\.googleapis\.com/]
]) {
  test(`${number} ${label}`, () => {
    assert.equal(forbidden.test(`${searchSource}\n${paymentSource}`), false);
  });
}

test("44 réponse de recherche interprétable par le site actuel", async () => {
  reset();
  runtime.upstream = searchSuccess();
  const result = await json(await searchHandler(searchRequest("FIH")));
  for (const field of [
    "codeColis",
    "dateColis",
    "destinationCode",
    "destinationNom",
    "montantAttendu",
    "montantDejaPaye",
    "soldeRestant",
    "poidsKg",
    "statutColis"
  ]) {
    assert.ok(field in result.body);
  }
});

test("44b réponse Apps Script V15 normalisée vers le contrat historique du site", async () => {
  reset(agentProfile("KLZ"));
  runtime.upstream = new Response(
    JSON.stringify({
      ok: true,
      data: {
        codeColis: "COLIS-001",
        dateColis: "2026-08-07",
        destinationCode: "FIH",
        destinationNom: "Kinshasa",
        poidsKg: 1,
        montantAttendu: 9,
        montantPaye: 0,
        solde: 9,
        statutColis: "EN ATTENTE"
      }
    }),
    { status: 200 }
  );
  const result = await json(await searchHandler(searchRequest("FIH")));
  assert.equal(result.status, 200);
  assert.equal(result.body.montantDejaPaye, 0);
  assert.equal(result.body.soldeRestant, 9);
  assert.equal(result.body.poidsKg, 1);
  assert.equal(result.body.statutColis, "EN ATTENTE");
});

test("45 colis introuvable interprétable par le site actuel", async () => {
  reset();
  runtime.upstream = new Response(
    JSON.stringify({ success: false, found: false, message: "Aucun colis" }),
    { status: 200 }
  );
  const result = await json(await searchHandler(searchRequest("FIH")));
  assert.deepEqual(result, {
    status: 404,
    body: { error: "COLIS_INTROUVABLE" }
  });
});

test("46 paiement réussi interprétable par le site actuel", async () => {
  reset();
  runtime.upstream = paymentSuccess();
  const result = await json(await paymentHandler(paymentRequest()));
  for (const field of [
    "codeColis",
    "destinationCode",
    "destinationNom",
    "montantPaye",
    "nouveauTotalPaye",
    "nouveauSolde",
    "statutPaiement",
    "datePaiement"
  ]) {
    assert.ok(field in result.body);
  }
  assert.ok(siteClientSource.includes("parsePaymentResult"));
});

test("47 paiement déjà enregistré interprétable par le site actuel", async () => {
  reset();
  runtime.upstream = new Response(
    JSON.stringify({ code: "PAIEMENT_DEJA_ENREGISTRE" }),
    { status: 409 }
  );
  const result = await json(await paymentHandler(paymentRequest()));
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "PAIEMENT_DEJA_ENREGISTRE");
  assert.equal(result.body.success, false);
});

test("48 erreurs métier interprétables par le site actuel", () => {
  for (const code of [
    "COLIS_INTROUVABLE",
    "DESTINATION_INVALIDE",
    "MONTANT_INVALIDE",
    "MODE_PAIEMENT_INVALIDE",
    "PAYMENT_REQUEST_ID_INVALIDE",
    "PAIEMENT_DEJA_ENREGISTRE",
    "COLIS_DEJA_SOLDE",
    "MONTANT_SUPERIEUR_SOLDE",
    "PAIEMENT_PARTIEL_INTERDIT",
    "IDEMPOTENCY_CONFLICT",
    "SERVICE_INDISPONIBLE"
  ]) {
    assert.ok(siteClientSource.includes(code), code);
  }
});

test("49 aucune recherche ne modifie les données", async () => {
  reset(agentProfile("FIH"));
  runtime.upstream = searchSuccess("LSHI");
  await searchHandler(searchRequest("LSHI"));
  assert.equal(runtime.fetchCalls.length, 1);
  const payload = JSON.parse(runtime.fetchCalls[0].init.body);
  assert.deepEqual(Object.keys(payload).sort(), [
    "action",
    "apiKey",
    "codeColis",
    "destinationCode"
  ]);
  assert.equal(payload.action, "rechercherColis");
  assert.equal(searchSource.includes("enregistrerPaiement"), false);
  assert.equal(searchSource.includes(".update("), false);
  assert.equal(searchSource.includes(".insert("), false);
  assert.equal(searchSource.includes(".delete("), false);
});

test("50 paiement confirmé crée un unique crédit de caisse", async () => {
  reset(agentProfile("FIH"));
  enableCashCredits();
  runtime.upstream = paymentSuccess("FIH", 100);
  const result = await json(await paymentHandler(paymentRequest({ montantPaye: 100 })));
  assert.equal(result.status, 200);
  assert.equal(result.body.replayed, false);
  assert.equal(runtime.cashRows.length, 1);
  assert.equal(runtime.cashRows[0].event_type, "PAYMENT_CREDIT_RECORDED");
  assert.equal(runtime.cashRows[0].actor_user_id, "user-1");
});

test("51 même paymentRequestId et même contenu est rejoué sans Apps Script", async () => {
  reset(agentProfile("FIH"));
  enableCashCredits();
  runtime.upstream = paymentSuccess("FIH", 100);
  const request = () => paymentRequest({ montantPaye: 100 });
  assert.equal((await json(await paymentHandler(request()))).body.replayed, false);
  assert.equal((await json(await paymentHandler(request()))).body.replayed, true);
  assert.equal(runtime.cashRows.length, 1);
  assert.equal(runtime.fetchCalls.length, 1);
});

test("52 même paymentRequestId avec contenu différent retourne 409", async () => {
  reset(agentProfile("FIH"));
  enableCashCredits();
  runtime.upstream = paymentSuccess("FIH", 100);
  await paymentHandler(paymentRequest({ montantPaye: 100 }));
  const result = await json(await paymentHandler(paymentRequest({ montantPaye: 99 })));
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "IDEMPOTENCY_CONFLICT");
  assert.equal(runtime.cashRows.length, 1);
});

test("53 deux agents de la même agence créditent deux paiements indépendants", async () => {
  reset();
  enableCashCredits();
  runtime.profiles = {
    "agent-a": agentProfile("FIH", { id: "user-a", nom: "Agent A" }),
    "agent-b": agentProfile("FIH", { id: "user-b", nom: "Agent B" })
  };
  runtime.upstream = (_url, init) => {
    const payload = JSON.parse(init.body);
    return new Response(JSON.stringify({
      success: true, simulation: false,
      paiement: {
        codeColis: payload.codeColis,
        destinationCode: "FIH",
        montantPaye: payload.montantPaye,
        nouveauTotalPaye: payload.montantPaye,
        nouveauSolde: 0,
        statutPaiement: "SOLDE",
        datePaiement: "2026-07-31T12:00:00.000Z"
      }
    }), { status: 200 });
  };
  const requestA = paymentRequest({ codeColis: "COLIS-A", montantPaye: 10 }, "agent-a");
  const requestB = paymentRequest({
    codeColis: "COLIS-B",
    montantPaye: 20,
    paymentRequestId: "B0B1C2D3-E4F5-4A67-8B90-123456789ABC"
  }, "agent-b");
  const results = await Promise.all([paymentHandler(requestA), paymentHandler(requestB)]);
  assert.deepEqual(results.map((response) => response.status), [200, 200]);
  assert.equal(runtime.cashRows.length, 2);
  assert.deepEqual(new Set(runtime.cashRows.map((row) => row.actor_user_id)), new Set(["user-a", "user-b"]));
  assert.equal(runtime.cashRows.reduce((sum, row) => sum + row.amount, 0), 30);
});

test("54 deux agents sur le même colis ne produisent qu'un crédit", async () => {
  reset();
  enableCashCredits();
  runtime.profiles = {
    "agent-a": agentProfile("FIH", { id: "user-a", nom: "Agent A" }),
    "agent-b": agentProfile("FIH", { id: "user-b", nom: "Agent B" })
  };
  runtime.upstream = paymentSuccess("FIH", 100);
  await paymentHandler(paymentRequest({ montantPaye: 100 }, "agent-a"));
  const result = await json(await paymentHandler(paymentRequest({
    montantPaye: 100,
    paymentRequestId: "B0B1C2D3-E4F5-4A67-8B90-123456789ABC"
  }, "agent-b")));
  assert.equal(result.status, 503);
  assert.equal(runtime.cashRows.length, 1);
});

test("55 COO reste hors caisse et conserve sa réponse paiement", async () => {
  reset(agentProfile("COTONOU"));
  enableCashCredits();
  runtime.upstream = paymentSuccess("FIH", 25);
  const result = await json(await paymentHandler(paymentRequest()));
  assert.equal(result.status, 200);
  assert.equal(result.body.replayed, false);
  assert.equal(runtime.cashRows.length, 0);
  assert.equal(runtime.rpcCalls.length, 0);
});

test("56 compte SUSPENDED conserve le succès paiement sans mouvement Caisse", async () => {
  reset(agentProfile("FIH"));
  enableCashCredits();
  runtime.cashAccountActive = false;
  runtime.upstream = () => paymentSuccess("FIH", 100);
  const result = await json(await paymentHandler(paymentRequest({ montantPaye: 100 })));
  assert.equal(result.status, 200);
  assert.equal(result.body.cashRecorded, false);
  assert.equal(result.body.cashStatus, "ACCOUNT_NOT_ACTIVE");
  assert.equal(runtime.fetchCalls.length, 1);
  assert.equal(runtime.cashRows.length, 0);
});

test("57 rejeu suspendu reste un succès source sans mouvement Caisse", async () => {
  reset(agentProfile("FIH"));
  enableCashCredits();
  runtime.cashAccountActive = false;
  runtime.upstream = () => paymentSuccess("FIH", 100);
  const request = () => paymentRequest({ montantPaye: 100 });
  assert.equal((await json(await paymentHandler(request()))).status, 200);
  const replay = await json(await paymentHandler(request()));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.cashStatus, "ACCOUNT_NOT_ACTIVE");
  assert.equal(runtime.cashRows.length, 0);
});

test("58 une autre erreur Caisse reste bloquante", async () => {
  reset(agentProfile("FIH"));
  enableCashCredits();
  runtime.cashRpcError = "CASH_VERSION_CONFLICT";
  runtime.upstream = paymentSuccess("FIH", 100);
  const result = await json(await paymentHandler(paymentRequest({ montantPaye: 100 })));
  assert.equal(result.status, 503);
  assert.equal(result.body.error, "SERVICE_INDISPONIBLE");
  assert.equal(runtime.cashRows.length, 0);
});

test("59 les interfaces Agent affichent un succès non bloquant sans Request ID", () => {
  assert.match(agentWorkspaceSource, /Paiement enregistré avec succès\. La caisse de l’agence n’est pas encore ouverte/);
  assert.match(agentExpenseFormSource, /Dépense enregistrée avec succès\. La caisse de l’agence n’est pas encore ouverte/);
  assert.doesNotMatch(agentWorkspaceSource, /Request ID/i);
  assert.doesNotMatch(agentExpenseFormSource, /Request ID/i);
});
