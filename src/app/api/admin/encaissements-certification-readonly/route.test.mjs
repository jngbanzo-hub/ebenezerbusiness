import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const route = readFileSync(join(process.cwd(), "src/app/api/admin/encaissements-certification-readonly/route.ts"), "utf8");

test("façade certification est Admin, GET-only et server-side", () => {
  assert.match(route, /authorizeAdminRequest\(request\)/);
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.match(route, /readAdminManifestRows\(\)/);
  assert.match(route, /readAdminPayments\(\)/);
  assert.match(route, /readBilanOriginMonths\(\)/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /\.\s*(?:insert|update|delete|upsert|rpc)\s*\(/);
});

test("façade ne renvoie que des agrégats et détails read-only non sensibles", () => {
  assert.match(route, /readOnly:\s*true/);
  assert.match(route, /source:\s*"MANIFEST_COO_GLM"/);
  assert.match(route, /diagnosticRows/);
  assert.match(route, /firstFail/);
  assert.match(route, /manifestMatches/);
  assert.doesNotMatch(route, /expediteurRaw|phone|telephone|email/i);
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /NextResponse\.json\([^)]*SUPABASE_SERVICE_ROLE_KEY/);
});
