import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const quiet = { info() {}, warn() {}, error() {} };
function load(path, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, console: quiet, Request, Response, URL, AbortController, setTimeout, clearTimeout,
    require(id) {
      if (id in mocks) return mocks[id];
      if (id === "server-only") return {};
      if (["node:crypto", "zod", "next/server"].includes(id)) return require(id);
      throw new Error(`Unexpected dependency: ${id}`);
    }
  });
  return mod.exports;
}
const schema = load("./qr-batch-confirmation-schema.ts");
let manifestRows = [];
const pre = load("./qr-batch-prevalidation.ts", {
  "@supabase/supabase-js": {},
  "@/server/admin-manifest-sheets": { readCanonicalPaymentManifestRows: async () => manifestRows }
});
function serviceModule() { return load("./qr-batch-assignment-service.ts", {
  "@supabase/supabase-js": {}, "@/server/qr-batch-confirmation-schema": schema, "@/server/qr-batch-prevalidation": pre
}); }
const service = serviceModule();
const commands = n => Array.from({ length: n }, (_, i) => ({ lineNumber: i + 1, displayNumber: i + 1,
  agency: ["FIH", "LSHI", "KLZ"][i % 3], trackingCode: `AT${10000 + i}26`, expectedVersion: 1, requestId: randomUUID() }));
function fixture(rows, { invalid, fail, lost } = {}) {
  let writes = 0, reads = 0, rpc = 0;
  const records = new Map();
  const dependencies = {
    read: async (_, id) => { reads++; return records.get(id) ?? null; },
    prevalidate: (lines, token) => pre.prevalidateQrBatch(lines, token, {
      readRegistry: async () => ({ registry: rows.map(c => ({ qrId: `EEBQR${String(c.displayNumber).padStart(6, "0")}`,
        displayNumber: c.displayNumber, status: c.lineNumber === invalid ? "ASSIGNED" : "UNASSIGNED", version: 1 })), activeAssignments: [] }),
      readManifestIdentities: async () => new Set(rows.map(c => `${c.agency}|${c.trackingCode}`))
    }),
    assign: async (_, batchId, lines) => {
      rpc++;
      if (records.has(batchId)) return records.get(batchId).result;
      const result = { batchId, status: fail ? "REJECTED" : "COMPLETED", lines: lines.map(c => ({ ...c,
        state: fail ? "ERROR" : "ASSOCIATED", application: fail ? "NOT_APPLIED" : "APPLIED", retrySafe: !!fail,
        ...(fail ? { code: "QR_BATCH_ROLLED_BACK" } : {}) })) };
      if (!fail) writes += lines.length;
      records.set(batchId, { commands: lines, result });
      if (lost) throw Error("response lost after commit");
      return result;
    }
  };
  return { runner: service.createQrBatchRunner(dependencies), dependencies, records, stats: () => ({ writes, reads, rpc }) };
}
function route(runner, auth = { authorized: true, identity: { userId: "test-actor", site: "COO" } }) {
  return load("../app/api/agent/qr/batch-assign/route.ts", {
    "@/server/qr-batch-confirmation-schema": schema,
    "@/server/agent-authorization": { authorizeAgentRequest: async () => auth },
    "@/server/qr-batch-assignment-service": { assignQrBatchInternally: runner, bounded: service.bounded }
  });
}
const request = (lines, batchId = randomUUID()) => new Request("https://example.invalid/local-test", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, lines })
});
for (const n of [1, 99, 100, 101, 249, 250, 251]) test(`confirmation ${n} lignes: un seul RPC de mutation`, async () => {
  const rows = commands(n), f = fixture(rows), response = await route(f.runner).POST(request(rows));
  assert.equal(response.status, n <= 250 ? 200 : 400);
  assert.equal(f.stats().rpc, n <= 250 ? 1 : 0);
  assert.equal(f.stats().writes, n <= 250 ? n : 0);
  if (n > 250) { assert.equal((await response.json()).code, "INVALID_QR_BATCH"); assert.equal(f.stats().reads, 0); }
  else assert((await response.json()).lines.every(l => l.application === "APPLIED"));
});
test("250 avec QR déjà utilisé : aucun RPC de mutation", async () => {
  const rows = commands(250), f = fixture(rows, { invalid: 200 });
  const out = await f.runner("actor", rows, randomUUID());
  assert.equal(f.stats().rpc, 0); assert.equal(out.lines[199].code, "QR_ALREADY_ASSIGNED");
  assert(out.lines.every(l => l.application === "NOT_APPLIED"));
});
for (const field of ["displayNumber", "requestId", "lineNumber", "parcel"]) test(`doublon ${field} : refus avant lecture/écriture`, async () => {
  const rows = commands(250);
  if (field === "parcel") { rows[249].agency = rows[0].agency; rows[249].trackingCode = rows[0].trackingCode; }
  else rows[249][field] = rows[0][field];
  const f = fixture(rows), out = await f.runner("actor", rows, randomUUID());
  assert(out.lines.every(l => l.code === "DUPLICATE_IN_LIST"));
  assert.equal(f.stats().reads, 0); assert.equal(f.stats().rpc, 0);
});
test("250 avec code invalide : HTTP 400 avant mutation", async () => {
  const rows = commands(250); rows[249].trackingCode = "<INVALID>"; const f = fixture(rows);
  assert.equal((await route(f.runner).POST(request(rows))).status, 400);
  assert.equal(f.stats().rpc, 0); assert.equal(f.stats().reads, 0);
});
test("identité répétée : rejet confirmation, prévalidation historique inchangée", async () => {
  manifestRows = [{ sourceSite: "KLZ", codeColisRaw: "AT12326B" }, { sourceSite: "KLZ", codeColisRaw: "AT12326B" }];
  assert.equal((await pre.readCanonicalManifestIdentities()).size, 1);
  assert.equal((await pre.readCanonicalManifestIdentities(true)).size, 0);
});
test("deux modules indépendants récupèrent le journal partagé, sans mémoire commune", async () => {
  const rows = commands(250), f = fixture(rows), id = randomUUID();
  const secondInstance = serviceModule().createQrBatchRunner(f.dependencies);
  const [a, b] = await Promise.all([f.runner("actor", rows, id), secondInstance("actor", rows, id)]);
  assert.equal(a.status, "COMPLETED"); assert.equal(b.status, "COMPLETED");
  assert.equal(f.stats().writes, 250);
  // Actual DB mutual exclusion is independently tested with concurrent PG connections.
});
test("réponse perdue : seconde instance lit le résultat sans nouveau RPC de mutation", async () => {
  const rows = commands(250), f = fixture(rows, { lost: true }), id = randomUUID();
  await assert.rejects(f.runner("actor", rows, id));
  const second = serviceModule().createQrBatchRunner(f.dependencies);
  const out = await second("actor", rows, id);
  assert.equal(out.status, "COMPLETED"); assert.equal(f.stats().writes, 250); assert.equal(f.stats().rpc, 1);
});
test("même batchId, contenu modifié : rejet d'idempotence", async () => {
  const rows = commands(1), f = fixture(rows), id = randomUUID();
  await f.runner("actor", rows, id);
  await assert.rejects(f.runner("actor", [{ ...rows[0], trackingCode: "OTHER26" }], id), /QR_IDEMPOTENCY_CONFLICT/);
  assert.equal(f.stats().rpc, 1);
});
test("rejet transactionnel : toutes les lignes NON APPLIQUÉ, IDs conservés", async () => {
  const rows = commands(250), f = fixture(rows, { fail: true });
  const out = await f.runner("actor", rows, randomUUID());
  assert.equal(out.status, "REJECTED"); assert(out.lines.every(l => l.retrySafe && l.application === "NOT_APPLIED"));
  assert.equal(f.stats().writes, 0); assert.equal(out.lines[119].requestId, rows[119].requestId);
});
test("source absente ou version périmée : aucune écriture", async () => {
  let writes = 0;
  for (const checked of [[], [{ lineNumber: 1, displayNumber: "1", agency: "FIH", trackingCode: "AT1000026", ready: true, version: 2 }]]) {
    const runner = service.createQrBatchRunner({ read: async () => null, prevalidate: async () => checked, assign: async () => { writes++; } });
    const out = await runner("actor", commands(1), randomUUID());
    assert(out.lines.every(l => l.application === "NOT_APPLIED"));
  }
  assert.equal(writes, 0);
});
test("périmètre COO : destinations et non authentifiés refusés", async () => {
  for (const site of ["FIH", "LSHI", "KLZ"]) {
    const r = route(() => { throw Error("Forbidden"); }, { authorized: true, identity: { site } });
    assert.equal((await r.POST(request(commands(1)))).status, 403);
  }
  assert.equal((await route(() => {}, { authorized: false, status: 401 }).POST(request(commands(1)))).status, 401);
});
test("borne de temps : source suspendue ne déclenche pas une écriture tardive", async () => {
  let completed = false;
  await assert.rejects(service.bounded(() => new Promise(resolve => setTimeout(() => { completed = true; resolve(); }, 30)), 1), /QR_SERVICE_UNAVAILABLE/);
  assert.equal(completed, false);
});
test("GET état du lot : pas d'écriture, refus des destinations et absence non conclusive", async () => {
  let auth = { authorized: true, identity: { userId: "actor", site: "COO" } }, reads = 0;
  const r = load("../app/api/agent/qr/batch-status/route.ts", {
    "@/server/agent-authorization": { authorizeAgentRequest: async () => auth },
    "@/server/qr-batch-assignment-service": { bounded: service.bounded, readQrBatchStatus: async () => { reads++; return null; } }
  });
  const req = new Request("https://example.invalid/status?batchId=" + randomUUID());
  assert.equal((await (await r.GET(req)).json()).status, "NOT_OBSERVED");
  auth = { authorized: true, identity: { site: "KLZ" } };
  assert.equal((await r.GET(req)).status, 403); assert.equal(reads, 1);
});

function uiFixture(invalid = false) {
  const slots = []; let cursor = 0, submitCount = 0, release, reject, submitted, lastPrevalidated, batchId, statusReads = 0;
  const React = {
    useState(value) { const id = cursor++; if (!(id in slots)) slots[id] = value;
      return [slots[id], next => { slots[id] = typeof next === "function" ? next(slots[id]) : next; }]; },
    useRef(value) { const id = cursor++; return slots[id] ??= { current: value }; },
    useMemo(fn) { return fn(); }, useEffect() {}
  };
  const parser = load("../features/agent/qr-batch-parser.ts");
  const component = load("../features/agent/qr-batch-association.tsx", {
    react: React, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "lucide-react": { CheckCircle2: "icon", LoaderCircle: "icon", ShieldCheck: "icon" },
    "@/components/ui/button": { Button: "button" },
    "@/features/agent/supabase": { getSupabaseBrowserClient: () => ({ auth: {} }) },
    "@/features/agent/qr-batch-parser": parser,
    "@/features/agent/qr-association-client": {
      createQrAssignmentRequestId: randomUUID,
      prevalidateQrBatch: async (_, lines) => { lastPrevalidated = lines; return lines.map(l => ({ ...l,
        version: 1, result: invalid && l.lineNumber === 2 ? "INVALID_CODE" : "READY", ready: !(invalid && l.lineNumber === 2) })); },
      submitQrBatchAssociation: async (_, lines, id) => { submitCount++; submitted = lines; batchId = id; return new Promise((resolve, fail) => { release = resolve; reject = fail; }); },
      readQrBatchStatus: async () => { statusReads++; return { batchId, status: "COMPLETED", lines: submitted.map(c => ({ ...c, state: "ASSOCIATED", application: "APPLIED", retrySafe: false })) }; }
    }
  });
  return { render() { cursor = 0; return component.QrBatchAssociation({ initialInput: "1|FIH|AT1000026\n2|KLZ|AT1000126\n3|LSHI|AT1000226" }); },
    submitCount: () => submitCount, submitted: () => submitted, lastPrevalidated: () => lastPrevalidated,
    loseResponse: () => reject(Error("response lost")), statusReads: () => statusReads,
    release: value => release({ batchId, status: value.every(l => l.application === "APPLIED") ? "COMPLETED" : "REJECTED", lines: value }) };
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}
function textOf(node) { return Array.isArray(node) ? node.map(textOf).join("") : typeof node === "object" && node ? textOf(node.props?.children) : String(node ?? ""); }
const button = (tree, label) => elements(tree).find(el => el.type === "button" && textOf(el).includes(label));
const tick = () => new Promise(resolve => setImmediate(resolve));
test("UI réelle : double clic bloqué, reprise uniquement ligne non appliquée, requestId conservé", async () => {
  const ui = uiFixture();
  button(ui.render(), "Prévalider la série").props.onClick(); await tick();
  elements(ui.render()).find(el => el.type === "input").props.onChange({ target: { checked: true } });
  const confirm = button(ui.render(), "Confirmer les associations valides");
  confirm.props.onClick(); confirm.props.onClick();
  assert.equal(ui.submitCount(), 1);
  const original = ui.submitted();
  ui.release(original.map((c, i) => ({ ...c, state: i === 0 ? "ASSOCIATED" : "ERROR",
    application: i === 0 ? "APPLIED" : i === 1 ? "NOT_APPLIED" : "UNKNOWN", retrySafe: i === 1,
    code: i === 1 ? "QR_VERSION_CONFLICT" : undefined })));
  await tick();
  assert(textOf(ui.render()).includes("ÉTAT À VÉRIFIER"));
  assert(!textOf(ui.render()).includes("ASSOCIATIONS RÉUSSIES"));
  button(ui.render(), "Prévalider uniquement les lignes non appliquées").props.onClick(); await tick();
  assert(textOf(ui.render()).includes("ÉTAT À VÉRIFIER"));
  assert(textOf(ui.render()).includes("AT1000026"));
  assert.equal(ui.lastPrevalidated().length, 1); assert.equal(ui.lastPrevalidated()[0].lineNumber, 2);
  elements(ui.render()).find(el => el.type === "input").props.onChange({ target: { checked: true } });
  button(ui.render(), "Confirmer les associations valides").props.onClick();
  assert.equal(ui.submitted().length, 1); assert.equal(ui.submitted()[0].requestId, original[1].requestId);
  ui.release(ui.submitted().map(c => ({ ...c, state: "ASSOCIATED", application: "APPLIED", retrySafe: false })));
  await tick();
  assert(!textOf(ui.render()).includes("ASSOCIATIONS RÉUSSIES"));
});
test("UI : une ligne invalide interdit la confirmation du lot entier", async () => {
  const ui = uiFixture(true);
  button(ui.render(), "Prévalider la série").props.onClick(); await tick();
  elements(ui.render()).find(el => el.type === "input").props.onChange({ target: { checked: true } });
  const confirm = button(ui.render(), "Confirmer les associations valides");
  assert.equal(confirm.props.disabled, true);
  confirm.props.onClick(); assert.equal(ui.submitCount(), 0);
});

test("client : aucune retransmission automatique du POST après 503 ou réponse perdue", async () => {
  const authModule = load("../features/auth/authenticated-fetch.ts");
  const client = load("../features/agent/qr-association-client.ts", { "@/features/auth/authenticated-fetch": authModule });
  const auth = { getSession: async () => ({ data: { session: { access_token: "synthetic" } }, error: null }) };
  for (const lost of [true, false]) {
    let calls = 0;
    await assert.rejects(client.submitQrBatchAssociation(auth, commands(1), randomUUID(), async () => {
      calls++;
      if (lost) throw Error("lost response");
      return new Response("{}", { status: 503 });
    }));
    assert.equal(calls, 1);
  }
});

test("UI réponse perdue : récupération par lecture seule sans second POST", async () => {
  const ui = uiFixture();
  button(ui.render(), "Prévalider la série").props.onClick(); await tick();
  elements(ui.render()).find(el => el.type === "input").props.onChange({ target: { checked: true } });
  button(ui.render(), "Confirmer les associations valides").props.onClick();
  ui.loseResponse(); await tick();
  assert(textOf(ui.render()).includes("ÉTAT À VÉRIFIER"));
  button(ui.render(), "Vérifier le lot (lecture seule)").props.onClick(); await tick();
  assert.equal(ui.statusReads(), 1); assert.equal(ui.submitCount(), 1);
  assert(textOf(ui.render()).includes("ASSOCIATIONS RÉUSSIES"));
  assert(!textOf(ui.render()).includes("ÉTAT À VÉRIFIER"));
});

test("250 avec latence réseau simulée : nombre constant d'appels, pas 63 vagues", async () => {
  const rows = commands(250), f = fixture(rows);
  for (const key of ["read", "prevalidate", "assign"]) {
    const operation = f.dependencies[key];
    f.dependencies[key] = async (...args) => { await new Promise(resolve => setTimeout(resolve, 250)); return operation(...args); };
  }
  const started = performance.now(), out = await f.runner("actor", rows, randomUUID());
  const ms = performance.now() - started;
  assert.equal(out.status, "COMPLETED"); assert.equal(f.stats().rpc, 1); assert.equal(f.stats().writes, 250);
  assert(ms < 4000);
  console.log(JSON.stringify({ test: "250-with-simulated-network", artificialDelayPerStageMs: 250, ms: +ms.toFixed(2), mutationRpc: 1, effects: 250 }));
});
