import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("route Admin authentifiée et strictement en lecture", () => {
  assert.match(source, /authorizeAdminRequest\(request\)/);
  assert.match(source, /readAdminExpenses/);
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|DEPENSES_PUBLIC_API_KEY/);
});

test("la route refuse les filtres inconnus et ne met rien en cache", () => {
  assert.match(source, /allowedQueryKeys/);
  assert.match(source, /INVALID_FILTERS/);
  assert.match(source, /private, no-store, max-age=0/);
});

test("une catégorie invalide conserve une erreur métier claire", () => {
  assert.match(source, /AdminExpenseReadError/);
  assert.match(source, /INVALID_CATEGORY/);
  assert.match(source, /Catégorie invalide ou non reconnue\./);
});

test("diagnostic explicite réservé à l'Admin et conservé dans la réponse", () => {
  assert.ok(source.indexOf("authorizeAdminRequest(request)") < source.indexOf('url.searchParams.get("diagnostic")'));
  assert.match(source, /diagnosticValue !== null && diagnosticValue !== "1"/);
  assert.match(source, /\["FIH", "LSHI", "KLZ"\]/);
  assert.match(source, /readAdminExpenses\(identity, filters, fetch, true\)/);
  assert.match(source, /\.\.\.result\.diagnostic/);
  assert.match(source, /relayElapsedMs: Math\.round\(performance\.now\(\) - diagnosticStartedAt\)/);
  assert.match(source, /DIAGNOSTIC_TIMEOUT/);
  assert.match(source, /complete: false/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
});

function routeWithStubs(authResult, readResult) {
  const module = { exports: {} };
  let reads = 0;
  class AdminExpenseReadError extends Error {
    constructor(code) { super(code); this.code = code; }
  }
  class AdminExpenseDiagnosticTimeout extends Error {}
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const imports = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    zod: { ZodError: class ZodError extends Error {} },
    "@/server/admin-authorization": { authorizeAdminRequest: async () => authResult },
    "@/server/agent-expenses-apps-script": {
      AdminExpenseDiagnosticTimeout,
      AdminExpenseReadError,
      readAdminExpenses: async (...args) => {
        reads++;
        return typeof readResult === "function" ? readResult(...args) : readResult;
      }
    }
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(imports, name), `import inattendu : ${name}`);
      return imports[name];
    },
    URL, Response, Request, fetch, performance, Set, Array, Math
  });
  return { GET: module.exports.GET, reads: () => reads, AdminExpenseDiagnosticTimeout };
}

const admin = { authorized: true, userId: "admin-id", email: "admin@example.test", agency: "COO" };
const diagnosticUrl = "https://example.test/api/admin/expenses?agency=LSHI&diagnostic=1&pageSize=1";

test("la route refuse réellement le diagnostic sans session et pour un non-Admin", async () => {
  for (const [authResult, expectedStatus] of [
    [{ authorized: false, status: 401 }, 401],
    [{ authorized: false, status: 403 }, 403]
  ]) {
    const route = routeWithStubs(authResult, {});
    const response = await route.GET(new Request(diagnosticUrl));
    assert.equal(response.status, expectedStatus);
    assert.equal(route.reads(), 0);
  }
});

test("la route renvoie uniquement les mesures complètes pour un Admin", async () => {
  const route = routeWithStubs(admin, {
    depenses: [{ agent: "ne-pas-exposer" }],
    diagnostic: { complete: true, agency: "LSHI", steps: { total: 12 } }
  });
  const response = await route.GET(new Request(diagnosticUrl));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.diagnostic.complete, true);
  assert.equal(body.diagnostic.steps.total, 12);
  assert.equal(typeof body.diagnostic.relayElapsedMs, "number");
  assert.equal(body.depenses, undefined);
  assert.equal(JSON.stringify(body).includes("ne-pas-exposer"), false);
});

test("hors diagnostic la réponse habituelle reste intacte", async () => {
  const expected = { success: true, depenses: [{ id: "fixture" }], pagination: { total: 1 } };
  const route = routeWithStubs(admin, expected);
  const response = await route.GET(new Request("https://example.test/api/admin/expenses?agency=LSHI"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expected);
});

test("une interruption n'invente aucune durée Apps Script", async () => {
  const timeoutRoute = routeWithStubs(admin, () => {
    throw new timeoutRoute.AdminExpenseDiagnosticTimeout();
  });
  const timeout = await timeoutRoute.GET(new Request(diagnosticUrl));
  const timeoutBody = await timeout.json();
  assert.equal(timeout.status, 504);
  assert.equal(timeoutBody.diagnostic.complete, false);
  assert.equal(timeoutBody.diagnostic.reason, "UPSTREAM_TIMEOUT");
  assert.equal(timeoutBody.diagnostic.steps, undefined);

  const missingRoute = routeWithStubs(admin, () => { throw new Error("mesures absentes"); });
  const missing = await missingRoute.GET(new Request(diagnosticUrl));
  const missingBody = await missing.json();
  assert.equal(missing.status, 503);
  assert.equal(missingBody.diagnostic.complete, false);
  assert.equal(missingBody.diagnostic.reason, "UPSTREAM_INCOMPLETE");
  assert.equal(missingBody.diagnostic.steps, undefined);
});
