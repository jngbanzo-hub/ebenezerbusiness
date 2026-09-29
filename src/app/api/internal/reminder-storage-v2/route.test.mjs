import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("Stockage machine remains GET-only and has no write capability", () => {
  assert.match(source, /export async function GET/);
  assert.match(source, /authorizeReminderBilanRead/);
  assert.match(source, /readExhaustivePages/);
  assert.match(source, /private, no-store/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  assert.deepEqual(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? [], []);
});

test("without/wrong token fail; valid token reads bounded physical proof", async () => {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const rows = {
    stockage_parcels: [{ parcel_id: "p1", forwarding_id: null, tracking_code: "AA001", agency: "FIH", canonical_weight_kg: 3,
      weight_source_reference: "arrival:r1", delivery_status: "AVAILABLE", stockage_forwardings: null }],
    stockage_events: [{ event_id: "e1", event_type: "MANUAL_ARRIVAL_RECORDED", agency: "FIH", tracking_code: null,
      request_id: "r1", business_date: "2026-09-10", occurred_at: "2026-09-10T12:00:00Z", parcel_count_delta: 1,
      source_type: "PHYSICAL_AGENT_CONFIRMATION", source_request_id: null, metadata: { parcels: [{ trackingCode: "AA001", weightKg: 3 }] } }]
  };
  function query(table) {
    const filters = [];
    const self = { select: () => self, eq: (key, value) => { filters.push([key, value]); return self; },
      in: (key, values) => { filters.push([key, values]); return self; }, order: () => self,
      range: async () => ({ data: rows[table].filter(row => filters.every(([key, expected]) => Array.isArray(expected) ? expected.includes(row[key]) : row[key] === expected)), error: null }) };
    return self;
  }
  const exports = {};
  const require = name => {
    if (name === "next/server") return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
    if (name === "@supabase/supabase-js") return { createClient: () => ({ schema: () => ({ from: query }) }) };
    if (name === "@/server/reminder-bilan-machine-auth") return { authorizeReminderBilanRead: request => request.headers.get("Authorization") === "Bearer valid" };
    if (name === "@/server/exhaustive-pagination") return { readExhaustivePages: async reader => ({ rows: await reader(0, 999) }) };
    throw new Error(`unexpected ${name}`);
  };
  vm.runInNewContext(compiled, { exports, require, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only" } }, URL, Set, Map, Number, String, Array, Error });
  const request = token => new Request("https://example.invalid/api/internal/reminder-storage-v2?agency=FIH&code=AA001", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.equal((await exports.GET(request())).status, 401);
  assert.equal((await exports.GET(request("wrong"))).status, 401);
  const result = await exports.GET(request("valid"));
  assert.equal(result.status, 200);
  assert.equal(result.body.proofs.length, 1);
  assert.equal(result.body.proofs[0].nature, "NATIF");
  assert.equal(result.body.proofs[0].arrivals.length, 1);
  assert.equal(result.body.proofs[0].exitsChecked, true);
  assert.equal(result.body.proofs[0].laterExit, false);
});
