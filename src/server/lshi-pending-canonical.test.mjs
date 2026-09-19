import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import ts from "typescript";

function moduleUrl(path, imports = {}, suffix = "") {
  let js = ts.transpileModule(readFileSync(path, "utf8") + suffix, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }, fileName: path }).outputText;
  for (const [name, url] of Object.entries(imports)) js = js.replaceAll(`"${name}"`, JSON.stringify(url));
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
}
const stub = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const typesUrl = moduleUrl("src/features/admin/types.ts");
const parserUrl = moduleUrl("src/features/admin/payments.ts", {
  "@/features/admin/types": typesUrl,
  "@/lib/format-weight": moduleUrl("src/lib/format-weight.ts"),
  "@/features/agent/supabase": stub("export function getSupabaseBrowserClient(){throw Error('BROWSER_FORBIDDEN_IN_TEST')}"),
  "@/features/auth/authenticated-fetch": stub("export function authenticatedRead(){throw Error('NETWORK_FORBIDDEN_IN_TEST')}")
});
const sheetsUrl = moduleUrl("src/server/admin-payments-sheets.ts", { zod: import.meta.resolve("zod"), "@/features/admin/payments": parserUrl, "@/features/admin/types": typesUrl });
const reconciliationUrl = moduleUrl("src/server/operational-reconciliation.ts");
const pendingUrl = moduleUrl("src/server/lshi-pending-canonical.ts");
const { readCanonicalPaymentsByRequestIds } = await import(sheetsUrl);
const { resolveLshiPendingCanonical, replacePendingPayments } = await import(pendingUrl);
const { reconcileOperations, arbitrateOperationalClassifications } = await import(reconciliationUrl);
// Execute the existing non-regression assertions unchanged against the real module.
await import(moduleUrl("src/server/operational-reconciliation.test.ts", { "./operational-reconciliation": reconciliationUrl }));
const scannerImports = {
  "server-only": stub(""), "@supabase/supabase-js": import.meta.resolve("@supabase/supabase-js"),
  "@/server/admin-payments-sheets": sheetsUrl,
  "@/server/agent-expenses-apps-script": stub("export function readAdminExpenses(){throw Error('EXPENSE_READ_NOT_EXPECTED')}"),
  "@/server/lshi-expense-reconciliation-window": moduleUrl("src/server/lshi-expense-reconciliation-window.ts"),
  "@/server/operational-reconciliation": reconciliationUrl,
  "@/server/lshi-pending-canonical": pendingUrl,
  "@/server/exhaustive-pagination": moduleUrl("src/server/exhaustive-pagination.ts")
};
const { readPendingEffects } = await import(moduleUrl("src/server/lshi-operational-reconciliation.ts", scannerImports, "\nexport { readPendingEffects };"));

const now = new Date("2026-09-17T14:00:00Z");
const requestId = "30990f80-ee1c-44ec-884e-678e02bf094c";
const pending = { requestId, trackingCode: "AT101926", agency: "LSHI", state: "PENDING", paymentCreated: false, cashEventId: null, storageEventId: null, lastError: null, attemptCount: 1, createdAt: "2026-09-17T08:31:15Z", updatedAt: "2026-09-17T08:31:15Z", completedAt: null };
const payment = { paymentRequestId: requestId, codeColis: "AT101926", destinationCode: "LSHI", agenceEncaissement: "LSHI", statutPaiement: "SOLDÉ", montantAttendu: 40, montantPaye: 40, soldeRestant: 0, poidsKg: 4, dateTime: "2026-09-17T09:31:28.474Z" };
const readFound = async () => new Map([[requestId, { status: "FOUND", payment }]]);
function reconcile(resolved, { recent = [], cash = [], storage = [], orchestrations = [pending], availability } = {}) {
  return reconcileOperations({ payments: replacePendingPayments(recent, resolved), cash, storage, orchestrations, closures: [], canonicalPaymentStatus: resolved.statuses, now, availability });
}
const types = (result) => result.anomalies.map((row) => row.type);

test("paiement récent <2h: résolution sans double comptage", async () => {
  const resolved = await resolveLshiPendingCanonical([pending], async () => new Map([[requestId, { status: "FOUND", payment: { ...payment, dateTime: "2026-09-17T13:30:00Z" } }]]));
  assert.equal(replacePendingPayments(resolved.payments, resolved).length, 1);
  assert.equal(reconcile(resolved).anomalies.length, 3);
});
test("AT101926 SOLDÉ >2h: les trois anomalies réelles restent seules", async () => {
  let requested;
  const resolved = await resolveLshiPendingCanonical([pending], async (ids) => { requested = ids; return readFound(); });
  assert.deepEqual(requested, [requestId]);
  assert.deepEqual(types(reconcile(resolved)), ["PAIEMENT_SANS_CASH_EVENT", "PAIEMENT_SANS_SORTIE_STOCKAGE", "ORCHESTRATION_PENDING_TROP_LONGTEMPS"]);
  assert.equal(reconcile(resolved).information.length, 0);
});
test("AT43326: absence canonique certifiée, historique INFO inchangé", async () => {
  const row = { ...pending, requestId: "c9a90809-11ec-417e-a18b-42e49cd5d48c", trackingCode: "AT43326", createdAt: "2026-09-10T12:38:37Z", updatedAt: "2026-09-10T12:39:00Z" };
  const original = JSON.stringify(row);
  const resolved = await resolveLshiPendingCanonical([row], async () => new Map([[row.requestId, { status: "ABSENT" }]]));
  const result = reconcile(resolved, { orchestrations: [row] });
  assert.equal(result.anomalies.length, 0);
  assert.equal(result.information[0].severity, "INFO");
  assert.equal(result.information[0].temporalClass, "HISTORIQUE");
  assert.equal(JSON.stringify(row), original);
});
test("source indisponible: À VÉRIFIER, jamais absence certifiée", async () => {
  const resolved = await resolveLshiPendingCanonical([pending], async () => { throw Error("unavailable"); });
  const result = reconcile(resolved);
  assert.deepEqual(types(result), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
  assert.equal(result.anomalies[0].status, "A_VERIFIER");
  assert.equal(result.information.length, 0);
});
test("source indisponible du contrôle global ne génère pas d'information légitime", () => {
  const result = reconcileOperations({ payments: [], cash: [], storage: [], orchestrations: [pending], closures: [], now, availability: { payments: false } });
  assert.deepEqual(types(result), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
  assert.equal(result.information.length, 0);
});
test("réponse canonique omise, invalide, partielle ou identité différente: non certifié", async () => {
  for (const response of [undefined, { status: "UNKNOWN" }, { status: "FOUND", payment: { ...payment, codeColis: "OTHER" } }, { status: "FOUND", payment: { ...payment, destinationCode: "KLZ" } }, { status: "FOUND", payment: { ...payment, statutPaiement: "PARTIEL", soldeRestant: 10 } }]) {
    const resolved = await resolveLshiPendingCanonical([pending], async () => new Map(response ? [[requestId, response]] : []));
    assert.deepEqual(types(reconcile(resolved)), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
    assert.equal(reconcile(resolved).information.length, 0);
  }
});
test("ancien paiement et anciens effets retrouvés: aucune fausse absence d'effet", async () => {
  const resolved = await resolveLshiPendingCanonical([pending], readFound);
  const base = resolved.payments[0];
  const result = reconcile(resolved, { cash: [{ ...base, eventId: "cash" }], storage: [{ ...base, eventId: "exit" }] });
  assert.ok(!types(result).includes("PAIEMENT_SANS_CASH_EVENT"));
  assert.ok(!types(result).includes("PAIEMENT_SANS_SORTIE_STOCKAGE"));
  assert.ok(types(result).includes("ORCHESTRATION_PENDING_TROP_LONGTEMPS"));
});
test("arbitrage: ancien INFO et CRITICAL, un seul verdict par requestId", async () => {
  const current = reconcile(await resolveLshiPendingCanonical([pending], readFound));
  const stale = reconcileOperations({ payments: [], cash: [], storage: [], orchestrations: [pending], closures: [], now });
  const merged = arbitrateOperationalClassifications(current.anomalies, stale.information, current, new Set([requestId]));
  assert.equal(merged.anomalies.length, 3);
  assert.equal(merged.information.length, 0);
});
test("arbitrage: panne actuelle remplace anciennes conclusions sans inventer d'absence", async () => {
  const old = reconcile(await resolveLshiPendingCanonical([pending], readFound));
  const current = reconcile(await resolveLshiPendingCanonical([pending], async () => { throw Error(); }));
  const merged = arbitrateOperationalClassifications(old.anomalies, [], current, new Set([requestId]));
  assert.deepEqual(types(merged), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
  assert.equal(merged.information.length, 0);
});
test("arbitrage: aucun ancien INFO LSHI ne survit à une lecture d'orchestrations indisponible", () => {
  const stale = reconcileOperations({ payments: [], cash: [], storage: [], orchestrations: [pending], closures: [], now });
  const merged = arbitrateOperationalClassifications([], stale.information, { anomalies: [], information: [] }, new Set());
  assert.equal(merged.information.length, 0);
});
test("un checkpoint positif opposé à une absence canonique reste non certifié", async () => {
  const row = { ...pending, paymentCreated: true };
  const resolved = await resolveLshiPendingCanonical([row], async () => new Map([[requestId, { status: "ABSENT" }]]));
  assert.deepEqual(types(reconcile(resolved, { orchestrations: [row] })), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
});
test("effets présents mais paiement non certifié: pas d'accusation de sortie sans paiement", async () => {
  const resolved = await resolveLshiPendingCanonical([pending], async () => { throw Error(); });
  const base = { requestId, agency: "LSHI", amountUsd: 40, occurredAt: payment.dateTime };
  const result = reconcile(resolved, { cash: [{ ...base, eventId: "cash" }], storage: [{ ...base, eventId: "exit", trackingCode: "AT101926", weightKg: 4 }] });
  assert.deepEqual(types(result), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
});
test("forwarding avec requestId de sortie différent: l'identité forte propage NON CERTIFIÉ", async () => {
  const row = { ...pending, forwardingId: "forwarding-test" };
  const resolved = await resolveLshiPendingCanonical([row], async () => { throw Error(); });
  const result = reconcile(resolved, { orchestrations: [row], storage: [{ requestId: "legacy-exit", agency: "LSHI", eventId: "exit", forwardingId: row.forwardingId, trackingCode: "AT101926", weightKg: 4, occurredAt: payment.dateTime }] });
  assert.deepEqual(types(result), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
});
test("paiement absent mais effet orphelin: le scanner lui-même n'ajoute pas INFO contradictoire", async () => {
  const resolved = await resolveLshiPendingCanonical([pending], async () => new Map([[requestId, { status: "ABSENT" }]]));
  const result = reconcile(resolved, { cash: [{ requestId, agency: "LSHI", amountUsd: 40, eventId: "cash", occurredAt: payment.dateTime }] });
  assert.ok(types(result).includes("CASH_EVENT_SANS_PAIEMENT_CANONIQUE"));
  assert.equal(result.information.length, 0);
});
test("FIH/KLZ/COO et COMPLETED complets ne déclenchent aucune nouvelle lecture", async () => {
  let calls = 0;
  const resolved = await resolveLshiPendingCanonical([...["FIH", "KLZ", "COO"].map((agency) => ({ ...pending, agency })), { ...pending, state: "COMPLETED", cashEventId: "cash", storageEventId: "exit" }], async () => { calls++; return new Map(); });
  assert.equal(calls, 0);
  assert.equal(resolved.pending.length, 0);
});

test("lecteur officiel: index exhaustif, puis lignes exactes; doublons et lignes invalides non certifiés", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "test@example.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  process.env.GOOGLE_SHEETS_PAYMENTS_SPREADSHEET_ID = "synthetic-test-only";
  t.after(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });
  let mode = "normal";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.origin === "https://oauth2.googleapis.com") return Response.json({ access_token: "synthetic-not-a-secret", expires_in: 3600 });
    assert.equal(parsed.origin, "https://sheets.googleapis.com");
    assert.equal(options.method ?? "GET", "GET");
    const ranges = parsed.searchParams.getAll("ranges"); calls.push(ranges);
    if (mode === "failure") return Response.json({}, { status: 503 });
    if (ranges[0].endsWith("!P2:P")) return Response.json({ valueRanges: ranges.slice(0, mode === "incomplete" ? 3 : 4).map((range) => ({ range, values: range.startsWith("LSHI") ? [[requestId], ...(mode === "duplicate" ? [[requestId]] : [])] : [] })) });
    const row = ["2026-09-17T09:31:28.474Z", "AT101926", 4, 40, 40, 0, "LSHI", "LSHI", "SOLDÉ", "", "", "", "", "", "", mode === "moved" ? "other" : requestId];
    if (mode === "invalid") row[0] = "INVALID";
    return Response.json({ valueRanges: ranges.map((range) => ({ range, values: [row] })) });
  };
  const absent = "c9a90809-11ec-417e-a18b-42e49cd5d48c";
  const result = await readCanonicalPaymentsByRequestIds([requestId, absent]);
  assert.equal(result.get(requestId).status, "FOUND");
  assert.equal(result.get(requestId).payment.statutPaiement, "SOLDÉ");
  assert.equal(result.get(absent).status, "ABSENT");
  assert.deepEqual(calls, [["COO!P2:P", "FIH!P2:P", "LSHI!P2:P", "KLZ!P2:P"], ["LSHI!A2:P2"]]);
  for (mode of ["duplicate", "invalid", "moved"]) assert.equal((await readCanonicalPaymentsByRequestIds([requestId])).get(requestId).status, "UNKNOWN");
  for (mode of ["failure", "incomplete"]) await assert.rejects(readCanonicalPaymentsByRequestIds([requestId]));
});

test("lecture des effets: hors fenêtre, identité forte et pagination exhaustive", async () => {
  const trace = [];
  const data = Array.from({ length: 1001 }, (_, index) => ({ event_id: `event-${index}`, source_request_id: requestId, request_id: requestId, amount: 40, tracking_code: "AT101926", weight_kg_delta: -4, occurred_at: payment.dateTime, metadata: {} }));
  const client = { from(table) {
    const query = { select() { return query; }, eq(...args) { trace.push(["eq", ...args]); return query; }, in(...args) { trace.push(["in", ...args]); return query; }, or(value) { trace.push(["or", value]); return query; }, order() { return query; }, range(from, to) { trace.push([table, from, to]); return Promise.resolve({ data: data.slice(from, to + 1), error: null }); } };
    return query;
  } };
  for (const kind of ["cash", "storage"]) assert.equal((await readPendingEffects(client, [pending], kind)).rows.length, 1001);
  assert.ok(trace.some((row) => row[0] === "cash_events" && row[1] === 1000));
  assert.ok(trace.some((row) => row[0] === "stockage_events" && row[1] === 1000));
  assert.ok(trace.filter((row) => row[0] === "or").every((row) => row[1].includes(requestId) && !row[1].includes("tracking_code")));
});
test("échec lecture des effets: exception, pas de faux résultat vide", async () => {
  const query = { select(){return this;}, eq(){return this;}, in(){return this;}, or(){return this;}, order(){return this;}, range(){return Promise.resolve({data:null,error:{message:"unavailable"}});} };
  await assert.rejects(readPendingEffects({from(){return query;}}, [pending], "cash"));
});
test("aucune nouvelle primitive d'écriture; les agrégats quotidiens gardent leur fenêtre", () => {
  const reader = readFileSync("src/server/admin-payments-sheets.ts", "utf8");
  const resolver = readFileSync("src/server/lshi-pending-canonical.ts", "utf8");
  const scanner = readFileSync("src/server/lshi-operational-reconciliation.ts", "utf8");
  const newReader = reader.slice(reader.indexOf("export async function readCanonicalPaymentsByRequestIds"), reader.indexOf("export async function readAdminPayments("));
  assert.doesNotMatch(newReader + resolver, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(scanner, /const expectedCredits = money\(sheet.rows.reduce/);
  assert.match(scanner, /readPendingEffects\(client, canonical.effectOrchestrations, "cash"\)/);
  assert.match(scanner, /readPendingEffects\(client, canonical.effectOrchestrations, "storage"\)/);
  assert.match(scanner, /canonicalPaymentStatus: canonical.statuses/);
});

const completed = { ...pending, state: "COMPLETED", paymentCreated: true, cashEventId: "cash", storageEventId: "exit", updatedAt: "2026-09-17T15:11:37Z", completedAt: "2026-09-17T15:11:37Z" };
const repairedCash = { requestId, agency: "LSHI", amountUsd: 40, eventId: "cash", occurredAt: "2026-09-17T15:11:37Z" };
const repairedExit = { requestId, agency: "LSHI", trackingCode: "AT101926", weightKg: 4, eventId: "exit", occurredAt: "2026-09-17T15:11:37Z" };

test("AT101926 COMPLETED: paiement ancien + effets récents + sheetRows=0 => zéro anomalie", async () => {
  const original = JSON.stringify([completed, repairedCash, repairedExit]);
  let calls = 0;
  const resolved = await resolveLshiPendingCanonical([completed], async (ids) => { calls++; assert.deepEqual(ids, [requestId]); return readFound(); }, [repairedCash, repairedExit]);
  assert.equal(calls, 1);
  assert.equal(resolved.pending.length, 0);
  assert.deepEqual(resolved.effectOrchestrations, [completed]);
  assert.equal(resolved.statuses.get(requestId), "PRESENT");
  const result = reconcile(resolved, { cash: [repairedCash], storage: [repairedExit], orchestrations: [completed] });
  assert.deepEqual(result.anomalies, []);
  assert.deepEqual(result.information, []);
  assert.equal(JSON.stringify([completed, repairedCash, repairedExit]), original);
});

test("chacun des effets suffit à résoudre le paiement ancien et demander les deux effets hors fenêtre", async () => {
  for (const effect of [repairedCash, repairedExit]) {
    const resolved = await resolveLshiPendingCanonical([completed], readFound, [effect]);
    assert.equal(resolved.statuses.get(requestId), "PRESENT");
    assert.deepEqual(resolved.effectOrchestrations, [completed]);
  }
});

test("événements sans orchestration: présence, absence et panne sont distinctes", async () => {
  for (const [response, expected] of [
    [{ status: "FOUND", payment }, []],
    [{ status: "ABSENT" }, ["CASH_EVENT_SANS_PAIEMENT_CANONIQUE", "SORTIE_SANS_PAIEMENT_CANONIQUE"]],
    [{ status: "UNKNOWN" }, ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]]
  ]) {
    const resolved = await resolveLshiPendingCanonical([], async () => new Map([[requestId, response]]), [repairedCash, repairedExit]);
    const result = reconcile(resolved, { orchestrations: [], cash: [repairedCash], storage: [repairedExit] });
    assert.deepEqual(types(result).sort(), expected.sort());
    assert.equal(result.information.length, 0);
  }
});

test("COMPLETED + source indisponible: À VÉRIFIER, ni orphelin ni zéro trompeur", async () => {
  const resolved = await resolveLshiPendingCanonical([completed], async () => { throw Error("unavailable"); }, [repairedCash, repairedExit]);
  const result = reconcile(resolved, { orchestrations: [completed], cash: [repairedCash], storage: [repairedExit] });
  assert.deepEqual(types(result), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
  assert.equal(result.anomalies[0].status, "A_VERIFIER");
  assert.equal(result.anomalies[0].severity, "ATTENTION");
});

test("source certifie absent mais checkpoint COMPLETED positif: contradiction NON CERTIFIÉE", async () => {
  const resolved = await resolveLshiPendingCanonical([completed], async () => new Map([[requestId, { status: "ABSENT" }]]), [repairedCash, repairedExit]);
  assert.deepEqual(types(reconcile(resolved, { orchestrations: [completed], cash: [repairedCash], storage: [repairedExit] })), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
});

test("un même tracking code avec un autre requestId ne certifie jamais le paiement", async () => {
  const resolved = await resolveLshiPendingCanonical([completed], async () => new Map([[requestId, { status: "FOUND", payment: { ...payment, paymentRequestId: "other-request" } }]]), [repairedCash, repairedExit]);
  assert.equal(resolved.statuses.get(requestId), "UNKNOWN");
});

test("forwarding COMPLETED: requestId legacy relié seulement par identité forte", async () => {
  const row = { ...completed, forwardingId: "forwarding-test" };
  const exit = { ...repairedExit, requestId: "legacy-exit", forwardingId: row.forwardingId };
  const resolved = await resolveLshiPendingCanonical([row], async (ids) => { assert.deepEqual(ids, [requestId]); return readFound(); }, [exit]);
  assert.deepEqual(types(reconcile(resolved, { orchestrations: [row], cash: [repairedCash], storage: [exit] })), []);
  const unavailable = await resolveLshiPendingCanonical([row], async () => { throw Error(); }, [exit]);
  assert.deepEqual(types(reconcile(unavailable, { orchestrations: [row], cash: [], storage: [exit] })), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
});

test("arbitrage Centre: les deux anciennes alertes orphelines sont remplacées sans masquer une vraie anomalie", async () => {
  const stale = reconcileOperations({ payments: [], cash: [repairedCash], storage: [repairedExit], orchestrations: [completed], closures: [], now });
  assert.equal(stale.anomalies.length, 2);
  const resolved = await resolveLshiPendingCanonical([completed], readFound, [repairedCash, repairedExit]);
  const current = reconcile(resolved, { orchestrations: [completed], cash: [repairedCash], storage: [repairedExit] });
  assert.equal(arbitrateOperationalClassifications(stale.anomalies, [], current, new Set([requestId])).anomalies.length, 0);
  const unavailable = reconcile(await resolveLshiPendingCanonical([completed], async () => { throw Error(); }, [repairedCash]), { orchestrations: [completed], cash: [repairedCash], storage: [repairedExit] });
  assert.deepEqual(types(arbitrateOperationalClassifications(stale.anomalies, [], unavailable, new Set([requestId]))), ["PAIEMENT_CANONIQUE_NON_CERTIFIE"]);
  assert.equal(arbitrateOperationalClassifications(stale.anomalies, [], stale, new Set([requestId])).anomalies.length, 2);
});

test("AT101926 réparé et AT43326 simultanés: zéro anomalie, une seule INFO historique", async () => {
  const negative = { ...pending, requestId: "c9a90809-11ec-417e-a18b-42e49cd5d48c", trackingCode: "AT43326", createdAt: "2026-09-10T12:38:37Z", updatedAt: "2026-09-10T12:39:00Z" };
  const resolved = await resolveLshiPendingCanonical([completed, negative], async () => new Map([[requestId, { status: "FOUND", payment }], [negative.requestId, { status: "ABSENT" }]]), [repairedCash, repairedExit]);
  const result = reconcile(resolved, { orchestrations: [completed, negative], cash: [repairedCash], storage: [repairedExit] });
  assert.equal(result.anomalies.length, 0);
  assert.equal(result.information.length, 1);
  assert.equal(result.information[0].trackingCode, "AT43326");
  assert.equal(result.information[0].severity, "INFO");
  assert.equal(result.information[0].temporalClass, "HISTORIQUE");
});

test("références COMPLETED: identifiants ledger non UUID acceptés; séparateurs PostgREST refusés", async () => {
  const filters = [];
  const query = { select(){return this;}, eq(){return this;}, in(){return this;}, or(value){filters.push(value);return this;}, order(){return this;}, range(){return Promise.resolve({data:[],error:null});} };
  const row = { ...completed, cashEventId: `cash-payment-${"a".repeat(64)}`, storageEventId: `stockage-paid-exit-${"b".repeat(64)}` };
  for (const kind of ["cash", "storage"]) await readPendingEffects({from(){return query;}}, [row], kind);
  assert.ok(filters[0].includes(row.cashEventId));
  assert.ok(filters[1].includes(row.storageEventId));
  await assert.rejects(readPendingEffects({from(){return query;}}, [{ ...row, cashEventId: "bad),agency.eq.FIH" }], "cash"), /PENDING_EFFECT_IDENTITY_INVALID/);
});

test("scanner INCREMENTAL réel: sheetRows=0, COMPLETED, effets récents/anciens, aucune anomalie et aucune écriture", async () => {
  const negativeId = "c9a90809-11ec-417e-a18b-42e49cd5d48c";
  const { inspect } = await import(moduleUrl("src/server/lshi-operational-reconciliation.ts", {
    ...scannerImports,
    "@/server/admin-payments-sheets": stub(`
      export async function readAdminPaymentNextRow(){return 202;}
      export async function readAdminPaymentWindow(){return {payments:[${JSON.stringify(payment)}],nextRow:202,limitReached:false};}
      export async function readCanonicalPaymentsByRequestIds(ids){
        if(ids.length!==2 || !ids.includes('${requestId}') || !ids.includes('${negativeId}')) throw Error('EXPECTED_BOTH_REQUEST_IDS');
        return new Map([['${requestId}',{status:'FOUND',payment:${JSON.stringify(payment)}}],['${negativeId}',{status:'ABSENT'}]]);
      }
    `),
    "@/server/agent-expenses-apps-script": stub("export async function readAdminExpenses(){return {depenses:[],pagination:{totalPages:1}};}")
  }, "\nexport { inspect };"));
  const cashId = `cash-payment-${"a".repeat(64)}`, exitId = `stockage-paid-exit-${"b".repeat(64)}`;
  for (const oldEffect of [null, "cash_events", "stockage_events"]) {
    const data = {
      cash_events: [{ event_id: cashId, source_request_id: requestId, source_type: "PAYMENT_ENGINE", agency: "LSHI", amount: 40, occurred_at: oldEffect === "cash_events" ? payment.dateTime : completed.updatedAt, metadata: {} }],
      stockage_events: [{ event_id: exitId, request_id: requestId, source_type: "PAYMENT_ENGINE", source_request_id: requestId, agency: "LSHI", tracking_code: "AT101926", weight_kg_delta: -4, event_type: "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", occurred_at: oldEffect === "stockage_events" ? payment.dateTime : completed.updatedAt, metadata: {} }],
      stockage_payment_orchestrations: [
        { request_id: requestId, tracking_code: "AT101926", agency: "LSHI", state: "COMPLETED", payment_created: true, cash_event_id: cashId, stockage_event_id: exitId, created_at: pending.createdAt, updated_at: completed.updatedAt, completed_at: completed.completedAt, parcel_id: null, forwarding_id: null, attempt_count: 1 },
        { request_id: negativeId, tracking_code: "AT43326", agency: "LSHI", state: "PENDING", payment_created: false, cash_event_id: null, stockage_event_id: null, created_at: "2026-09-10T12:38:37Z", updated_at: "2026-09-10T12:39:00Z", parcel_id: null, forwarding_id: null, attempt_count: 2 }
      ]
    };
    const original = JSON.stringify(data);
    const readTrace = [];
    const client = { from(table) {
      let rows = [...(data[table] ?? [])];
      const query = {
        select(){return this;}, eq(key,value){rows=rows.filter((row)=>row[key]===value);return this;},
        in(key,values){rows=rows.filter((row)=>values.includes(row[key]));return this;},
        gte(key,value){rows=rows.filter((row)=>row[key]>=value);return this;},
        lt(key,value){rows=rows.filter((row)=>row[key]<value);return this;},
        lte(key,value){rows=rows.filter((row)=>row[key]<=value);return this;},
        or(value){readTrace.push([table,value]);return this;}, order(){return this;}, limit(n){rows=rows.slice(0,n);return this;},
        range(from,to){return Promise.resolve({data:rows.slice(from,to+1),error:null});},
        then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}
      };
      return query;
    } };
    const result = await inspect(client, { businessDate: "2026-09-16", cursorStart: 202, kind: "INCREMENTAL", now: new Date("2026-09-17T15:20:00Z") });
    assert.equal(result.metrics.sheetRows, 0);
    assert.equal(result.sources.pendingCanonical, "AVAILABLE");
    assert.equal(result.sources.pendingCash, "AVAILABLE");
    assert.equal(result.sources.pendingStorage, "AVAILABLE");
    assert.deepEqual(result.anomalies, []);
    assert.equal(result.information.length, 1);
    assert.equal(result.information[0].trackingCode, "AT43326");
    assert.ok(readTrace.some(([table,filter]) => table === "cash_events" && filter.includes(cashId)));
    assert.ok(readTrace.some(([table,filter]) => table === "stockage_events" && filter.includes(exitId)));
    assert.equal(JSON.stringify(data), original);
  }
});
