import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const utility = readFileSync(new URL("../src/features/transferts/admin-oidc-probe-trigger.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../src/features/transferts/admin-oidc-probe-panel.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/admin/transferts/oidc-read-check/route.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../src/server/admin-transfer-oidc-probe.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/admin/transferts/page.tsx", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../src/features/transferts/admin-transferts-page.tsx", import.meta.url), "utf8");

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64")}`;
const authUrl = moduleUrl(readFileSync(new URL("../src/features/auth/authenticated-fetch.ts", import.meta.url), "utf8"));
const utilitySource = readFileSync(new URL("../src/features/transferts/admin-oidc-probe-trigger.ts", import.meta.url), "utf8").replace('"@/features/auth/authenticated-fetch"', `"${authUrl}"`);
const { requestAdminOidcProbe } = await import(moduleUrl(utilitySource));
const { handleAdminTransferOidcProbeRequest } = await import(new URL("../src/server/admin-transfer-oidc-probe.ts", import.meta.url));

const auth = (token) => ({
  getSession: async () => ({ data: { session: token ? { access_token: token } : null } }),
  refreshSession: async () => ({ data: { session: null }, error: { status: 400 } })
});
const options = (authorize, overrides = {}) => ({
  enabled: true,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  vercelEnvironment: "production",
  config: { providerAudience: "fictitious", serviceAccountEmail: "fictitious", spreadsheetId: "fictitious" },
  authorize,
  run: async () => ({ state: "READ_METADATA_OK", oidcExchange: true, temporaryGoogleToken: true,
    transfersTab: true, auditTab: true, requestedSheetsScope: "spreadsheets.readonly", writePermission: "NOT_TESTED" }),
  ...overrides
});

test("déclencheur non monté, désactivé par défaut et limité à une fenêtre", () => {
  assert.equal(existsSync(new URL("../src/app/admin/transferts/oidc-test/page.tsx", import.meta.url)), false);
  assert.match(component, /enabled = false/);
  assert.match(component, /remaining > 0 && remaining <= 900_000/);
  assert.match(component, /attempted\.current = true/);
  assert.match(component, /getAdminProfile\(session\.user\)/);
  assert.equal((component.match(/requestAdminOidcProbe\(getSupabaseBrowserClient\(\)\.auth\)/g) ?? []).length, 1);
  assert.ok(component.indexOf("async function runOnce()") < component.indexOf("requestAdminOidcProbe(getSupabaseBrowserClient().auth)"));
  assert.doesNotMatch(component, /console\.|localStorage|sessionStorage/);
  assert.match(page, /VERCEL_ENV === "production"/);
  assert.match(page, /TRANSFERTS_ADMIN_OIDC_PROBE_ENABLED === "true"/);
  assert.match(page, /AdminTransfertsPage/);
  assert.match(adminUi, /if \(!authorized\)/);
  assert.ok(adminUi.indexOf("if (!authorized)") < adminUi.indexOf("<AdminOidcProbeTrigger"));
  assert.match(adminUi, /oidcProbeEnabled \? \(/);
  assert.doesNotMatch(page + component, /console\./);
});

test("Bearer existant, un seul appel externe et réponse limitée aux états techniques", () => {
  assert.match(utility, /authenticatedRead\(auth, PROBE_URL, \{\}, once\)/);
  assert.match(utility, /if \(attempted\)/);
  assert.match(utility, /firstResponse\.clone\(\)/);
  assert.doesNotMatch(utility + component, /console\.|transferCode|Authorization:/);
});

test("route existante conserve ses protections et n'expose que GET", () => {
  assert.match(route, /authorize: authorizeAdminRequest/);
  assert.match(server, /vercelEnvironment !== "production"/);
  assert.match(server, /expiry - Date\.now\(\) > 900_000/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
});

test("ADMIN actif : Bearer envoyé sans être présent dans la réponse", async () => {
  let calls = 0;
  const result = await requestAdminOidcProbe(auth("fictitious-admin-token"), async (url, init) => {
    calls++;
    assert.equal(String(url), "/api/admin/transferts/oidc-read-check");
    assert.equal(init.headers.Authorization, "Bearer fictitious-admin-token");
    return handleAdminTransferOidcProbeRequest(new Request(`https://example.test${url}`, init),
      options(async () => ({ authorized: true })));
  });
  assert.equal(result, "READ_METADATA_OK");
  assert.equal(calls, 1);
});

test("Agent, ADMIN inactif et jeton invalide sont refusés avant OIDC", async () => {
  for (const status of [403, 403, 401]) {
    let oidcCalls = 0;
    let calls = 0;
    const result = await requestAdminOidcProbe(auth("fictitious-token"), async (url, init) => {
      calls++;
      return handleAdminTransferOidcProbeRequest(new Request(`https://example.test${url}`, init),
        options(async () => ({ authorized: false, status }), { run: async () => { oidcCalls++; throw new Error("must-not-run"); } }));
    });
    assert.notEqual(result, "READ_METADATA_OK");
    assert.equal(calls, 1);
    assert.equal(oidcCalls, 0);
  }
});

test("session absente : aucun appel ; route désactivée ou expirée : 404", async () => {
  let calls = 0;
  assert.equal(await requestAdminOidcProbe(auth(null), async () => { calls++; throw new Error("must-not-run"); }), "ACCESS_DENIED");
  assert.equal(calls, 0);
  for (const overrides of [{ enabled: false }, { expiresAt: new Date(Date.now() - 1000).toISOString() }]) {
    const response = await handleAdminTransferOidcProbeRequest(new Request("https://example.test/check"),
      options(async () => { throw new Error("must-not-authorize"); }, overrides));
    assert.equal(response.status, 404);
  }
});

test("panne Google : réponse sûre, un seul appel et aucune opération métier", async () => {
  let calls = 0;
  const result = await requestAdminOidcProbe(auth("fictitious-token"), async (url, init) => {
    calls++;
    return handleAdminTransferOidcProbeRequest(new Request(`https://example.test${url}`, init),
      options(async () => ({ authorized: true }), { run: async () => { throw new Error("sensitive-upstream-detail"); } }));
  });
  assert.equal(result, "SERVICE_UNAVAILABLE");
  assert.equal(calls, 1);
  assert.doesNotMatch(result, /sensitive|token|transfer/i);
  assert.doesNotMatch(component + utility + route, /\/api\/agent\/transferts|correct-code|confirm-withdrawal/);
});
