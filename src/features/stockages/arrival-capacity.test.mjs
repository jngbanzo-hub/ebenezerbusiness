import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nodeRequire = createRequire(import.meta.url);
const read = (name) => readFileSync(path.join(root, name), "utf8");
const batch = (size) => Array.from({ length: size }, (_, i) => ({ trackingCode: `AT${10000 + i}26`, weightKg: 1.25 }));
const lines = (size) => batch(size).map((p) => `${p.trackingCode}:${p.weightKg}KGs`).join("\n");

// Execute the real TypeScript modules; only external I/O and authorization are simulated.
function harness(agency = "LSHI", authorized = true) {
  const calls = [], notices = [], cache = new Map();
  const stubs = {
    "server-only": {},
    "@supabase/supabase-js": { createClient: () => ({ schema() { return this; }, rpc: async (name, args) => {
      calls.push({ name, args }); return { data: { eventId: "test-event", replayed: false }, error: null };
    } }) },
    "@/server/agent-authorization": { authorizeAgentRequest: async () => ({ authorized, status: 403, identity: { site: agency, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nom: "TEST" } }) },
    "@/server/internal-notifications": { recordInternalNotification: async (n) => { notices.push(n); } },
    "@/server/stockages-rpc-diagnostics": { buildStockagesRpcDiagnostic: () => ({}) },
    "@/server/storage-parcel-identity": { storageParcelDisplayCode: () => "" }
  };
  function load(name) {
    const filename = path.join(root, name);
    if (cache.has(filename)) return cache.get(filename);
    const mod = { exports: {} };
    const code = ts.transpileModule(read(name), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const require = (id) => {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (id.startsWith("@/")) return load(`${id.slice(2)}.ts`);
      if (id.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), `${id}.ts`)));
      return nodeRequire(id);
    };
    vm.runInNewContext(code, { exports: mod.exports, module: mod, require, process: { env: { STOCKAGES_V2_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-only" } }, crypto: webcrypto, console, Intl });
    cache.set(filename, mod.exports); return mod.exports;
  }
  const parser = load("features/stockages/arrival-details.ts");
  const server = load("server/stockages-v2.ts");
  const route = load("app/api/agent/stockages/arrival/route.ts");
  const post = (parcels) => route.POST(new Request("https://example.invalid/api/agent/stockages/arrival", { method: "POST", body: JSON.stringify({ parcels, requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }) }));
  return { ...parser, ...server, post, calls, notices };
}

for (const agency of ["FIH", "LSHI", "KLZ"]) {
  for (const size of [99, 100, 101, 499, 500]) {
    test(`${agency}: ${size} codes accepted intact by parser, server and API`, async () => {
      const h = harness(agency);
      const parsed = h.parseArrivalDetails(lines(size));
      assert.equal(parsed.length, size);
      assert.equal(h.summarizeArrivalDetails(lines(size)).totalWeightKg, size * 1.25);
      const response = await h.post(parsed);
      assert.equal(response.status, 201);
      assert.equal(h.calls.length, 1);
      assert.equal(h.calls[0].name, "record_detailed_arrival");
      assert.equal(h.calls[0].args.p_parcels.length, size);
      assert.equal(h.calls[0].args.p_parcels[size - 1].trackingCode, batch(size)[size - 1].trackingCode);
      assert.equal(h.calls[0].args.p_request_id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
      assert.equal(h.notices[0].agency, agency);
    });
  }
  test(`${agency}: 501 rejected with explicit message and zero I/O`, async () => {
    const h = harness(agency);
    assert.throws(() => h.parseArrivalDetails(lines(501)), /maximum 500/);
    assert.equal(h.summarizeArrivalDetails(lines(501)).parcels.length, 0);
    const response = await h.post(batch(501));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, "ARRIVAL_CAPACITY_EXCEEDED");
    assert.match(body.message, /maximum 500/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.notices.length, 0);
  });
}

test("invalid last row or duplicate rejects the entire 500-row batch", async () => {
  for (const corrupt of [
    (rows) => { rows[499].weightKg = 0; },
    (rows) => { rows[499].weightKg = -1; },
    (rows) => { rows[499].trackingCode = "invalid code!"; },
    (rows) => { rows[499].trackingCode = rows[0].trackingCode.toLowerCase(); }
  ]) {
    const h = harness(), rows = batch(500); corrupt(rows);
    const response = await h.post(rows);
    assert.ok([400, 409].includes(response.status));
    assert.equal(h.calls.length, 0);
    assert.equal(h.notices.length, 0);
  }
});

test("unauthorized and unsupported agency requests never reach storage RPC", async () => {
  for (const [agency, authorized] of [["LSHI", false], ["COO", true]]) {
    const h = harness(agency, authorized);
    assert.equal((await h.post(batch(500))).status, 403);
    assert.equal(h.calls.length, 0);
  }
});

test("existing parsing, decimal weights and B/C/D suffixes are preserved", () => {
  const h = harness();
  const parsed = h.parseArrivalDetails("at105526:1 kg\nAT105526B:3,5 KGS\nAT105526C:2KG\nAT105526D:4KG");
  assert.equal(parsed.length, 4);
  assert.equal(parsed[1].weightKg, 3.5);
  assert.equal(parsed[3].trackingCode, "AT105526D");
  assert.throws(() => h.parseArrivalDetails("AT00126:1KG\nat00126:2kg"), /plusieurs fois/);
  assert.throws(() => h.parseArrivalDetails("AT00126:0KG"), /Poids invalide/);
});

function formHarness(fail = false) {
  const h = harness();
  const source = read("features/stockages/stockages-v2-page.tsx");
  const ast = ts.createSourceFile("form.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const form = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === "AgentCommandForm");
  assert.ok(form);
  const code = ts.transpileModule(`${form.getText(ast)}\nexport { AgentCommandForm };`, { fileName: "form.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = [], messages = [];
  let state = 0, finish, refresh = 0;
  const gate = new Promise((resolve) => { finish = resolve; });
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: (id) => { assert.equal(id, "react/jsx-runtime"); return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }; },
    useState: (initial) => { const index = state++; return [index === 2 ? lines(500) : initial, (value) => { if (index === 0) messages.push(value); }]; },
    useRef: () => ({ current: false }), useMemo: (fn) => fn(),
    summarizeArrivalDetails: h.summarizeArrivalDetails, MAX_ARRIVAL_PARCELS: 500,
    formatStockageWeight: String, Panel: "Panel", Button: "Button", Input: "Input",
    FormData: class { get() { return ""; } }, window: { confirm: () => true }, crypto: webcrypto,
    request: async (endpoint, body) => { calls.push(body); await gate; if (fail) throw new Error("simulated timeout"); return {}; }
  });
  const element = exports.AgentCommandForm({ title: "Arrivage", endpoint: "/api/agent/stockages/arrival", disabled: false, fields: "arrival", onDone: async () => { refresh++; } });
  return { submit: element.props.children.props.onSubmit, event: { preventDefault() {}, currentTarget: { reset() {} } }, calls, messages, finish, refresh: () => refresh };
}

test("real arrival form: two simultaneous submits send one complete 500-row request", async () => {
  const h = formHarness();
  const first = h.submit(h.event), second = h.submit(h.event);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].parcels.length, 500);
  h.finish(); await Promise.all([first, second]);
  assert.equal(h.refresh(), 1);
  assert.equal(h.messages.filter((s) => s.includes("succès")).length, 1);
});

test("a transport failure never displays a success or triggers a refresh", async () => {
  const h = formHarness(true), first = h.submit(h.event);
  h.finish(); await first;
  assert.equal(h.refresh(), 0);
  assert.ok(h.messages.every((s) => !s.includes("succès")));
});

test("500-row parsing and validation performance (CPU only, no database timing)", (t) => {
  const h = harness(), text = lines(500), start = performance.now();
  for (let i = 0; i < 100; i++) assert.equal(h.validateArrivalParcels(h.parseArrivalDetails(text)).length, 500);
  t.diagnostic(`Average parse + server validation: ${((performance.now() - start) / 100).toFixed(2)} ms for 500 rows`);
});
