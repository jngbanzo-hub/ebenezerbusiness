import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import * as crypto from "node:crypto";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("../../../../server/reminder-bilan-machine-auth.ts", import.meta.url), "utf8");
const source = readFileSync(new URL("../../../../server/reminder-certified-source.ts", import.meta.url), "utf8");

test("new route is GET only, dedicated and no-store", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /authorizeReminderBilanRead/);
  assert.match(route, /readCertifiedSnapshot\(\)/);
  assert.match(route, /private, no-store/);
  assert.match(route, /\["FIH", "LSHI", "KLZ"\]/);
  assert.match(route, /audit\.conservation\[agency\] === "PASS"/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
});
test("machine credential is separate and never falls back to Admin or Direction", () => {
  assert.match(auth, /REMINDER_BILAN_READER_TOKEN/);
  assert.match(auth, /timingSafeEqual/);
  assert.doesNotMatch(auth, /WHATSAPP_DIRECTION_READER_TOKEN|SUPABASE_SERVICE_ROLE_KEY|authorizeAdminRequest/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|D360_API_KEY|phone|telephone/i);
});
test("certified source is shared, not copied", () => {
  assert.match(source, /export async function readCertifiedSnapshot/);
  assert.match(source, /buildModernManifestAudit\(manifests, payments, physicalMatches/);
  assert.doesNotMatch(route, /function buildModernManifestAudit/);
  assert.match(route, /row\.state === "PARTIEL" \|\| row\.state === "NON PAYÉ" \|\| row\.state === "FUTURE DETTE"/);
});
test("new TypeScript modules parse without syntax diagnostics", () => {
  for (const sourceText of [route, auth, source]) {
    const result = ts.transpileModule(sourceText, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    assert.deepEqual(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? [], []);
  }
});
test("machine auth rejects absent and wrong tokens, accepts only its dedicated token", () => {
  const compiled = ts.transpileModule(auth, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, process: { env: {} }, require: name => name === "node:crypto" ? crypto : {} });
  const authorize = exports.authorizeReminderBilanRead;
  const expected = "test-only-capability-token-32-characters";
  assert.equal(authorize(new Request("https://example.invalid/internal"), expected), false);
  assert.equal(authorize(new Request("https://example.invalid/internal", { headers: { Authorization: "Bearer wrong" } }), expected), false);
  assert.equal(authorize(new Request("https://example.invalid/internal", { headers: { Authorization: `Bearer ${expected}` } }), expected), true);
});

test("GET refuses unauthenticated calls and projects certified candidates only", async () => {
  const compiled = ts.transpileModule(route, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const row = { cohort: "2026-09", code: "TEST001", sourceSheet: "FIH", state: "PARTIEL", remainingUsd: 12,
    sender: "Sender", beneficiary: "Recipient", physicalMatches: [{ parcelId: "p1", forwardingId: null, agency: "FIH" }], phone: "must-not-leak" };
  const snapshot = { modernManifestAudit: { conservation: { FIH: "PASS", LSHI: "PASS", KLZ: "PASS" }, rows: [row, { ...row, state: "SOLDÉ" }] } };
  const require = name => {
    if (name === "next/server") return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers }) } };
    if (name === "@/server/reminder-bilan-machine-auth") return { authorizeReminderBilanRead: request => request.headers.get("Authorization") === "Bearer valid-test-token" };
    if (name === "@/server/reminder-certified-source") return { readCertifiedSnapshot: async () => snapshot };
    throw new Error(`unexpected import ${name}`);
  };
  vm.runInNewContext(compiled, { exports, require, Error });
  assert.equal((await exports.GET(new Request("https://example.invalid/internal"))).status, 401);
  const response = await exports.GET(new Request("https://example.invalid/internal", { headers: { Authorization: "Bearer valid-test-token" } }));
  assert.equal(response.status, 200);
  assert.equal(response.body.candidates.length, 1);
  assert.equal(response.body.candidates[0].code, "TEST001");
  assert.equal(JSON.stringify(response.body).includes("must-not-leak"), false);
  snapshot.modernManifestAudit.conservation.KLZ = "FAIL";
  assert.equal((await exports.GET(new Request("https://example.invalid/internal", { headers: { Authorization: "Bearer valid-test-token" } }))).status, 503);
  delete snapshot.modernManifestAudit.conservation.KLZ;
  assert.equal((await exports.GET(new Request("https://example.invalid/internal", { headers: { Authorization: "Bearer valid-test-token" } }))).status, 503);
});
