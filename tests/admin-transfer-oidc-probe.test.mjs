import assert from "node:assert/strict";
import { test } from "node:test";
import { handleAdminTransferOidcProbeRequest, runAdminTransferOidcProbe, ProbeUnavailable, SHEETS_READ_SCOPE } from "../src/server/admin-transfer-oidc-probe.ts";

const now = Date.now();
const config = {
  providerAudience: "//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/example/providers/vercel",
  serviceAccountEmail: "transfers-admin-code-reader@eben-ezer-business.iam.gserviceaccount.com",
  spreadsheetId: "fictitious_spreadsheet_id_123456789"
};
const claims = {
  iss: "https://oidc.vercel.com/ebenezerbusiness",
  aud: "https://vercel.com/ebenezerbusiness",
  sub: "owner:ebenezerbusiness:project:ebenezerbusiness:environment:production",
  iat: Math.floor(now / 1000) - 60,
  nbf: Math.floor(now / 1000) - 60,
  exp: Math.floor(now / 1000) + 600
};
const token = (payload = claims) => `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2ln`;

function fakeFetch(overrides = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    const address = String(url);
    calls.push({ address, options });
    if (address.startsWith("https://sts.googleapis.com/")) {
      return Response.json(overrides.sts ?? { access_token: "fictitious-sts-token", token_type: "Bearer", expires_in: 300 });
    }
    if (address.startsWith("https://iamcredentials.googleapis.com/")) {
      return Response.json(overrides.iam ?? { accessToken: "fictitious-google-token", expireTime: new Date(now + 300_000).toISOString() });
    }
    return Response.json(overrides.sheet ?? {
      spreadsheetId: config.spreadsheetId,
      sheets: [{ properties: { title: "TRANSFERTS" } }, { properties: { title: "AUDIT" } }]
    });
  };
  return { fetcher, calls };
}

test("échange OIDC fictif puis lecture des seules métadonnées", async () => {
  const { fetcher, calls } = fakeFetch();
  const result = await runAdminTransferOidcProbe(token(), config, fetcher, now);
  assert.equal(result.state, "READ_METADATA_OK");
  assert.equal(result.writePermission, "NOT_TESTED");
  assert.equal(result.requestedSheetsScope, SHEETS_READ_SCOPE);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(JSON.parse(calls[0].options.body).scope, "https://www.googleapis.com/auth/iam");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[2].options.method, "GET");
  assert.deepEqual(JSON.parse(calls[1].options.body).scope, [SHEETS_READ_SCOPE]);
  const metadataUrl = new URL(calls[2].address);
  assert.equal(metadataUrl.searchParams.get("fields"), "spreadsheetId,sheets(properties(title))");
  assert.equal(metadataUrl.pathname.includes("values"), false);
  assert.equal(JSON.stringify(result).includes("fictitious"), false);
});

test("un jeton Preview est refusé avant tout appel externe", async () => {
  const { fetcher, calls } = fakeFetch();
  const preview = { ...claims, sub: claims.sub.replace("production", "preview") };
  await assert.rejects(runAdminTransferOidcProbe(token(preview), config, fetcher, now), ProbeUnavailable);
  assert.equal(calls.length, 0);
});

test("jeton expiré, configuration erronée et compte différent refusés", async () => {
  const { fetcher, calls } = fakeFetch();
  await assert.rejects(runAdminTransferOidcProbe(token({ ...claims, exp: 1 }), config, fetcher, now), ProbeUnavailable);
  await assert.rejects(runAdminTransferOidcProbe(token(), { ...config, providerAudience: "incorrect" }, fetcher, now), ProbeUnavailable);
  await assert.rejects(runAdminTransferOidcProbe(token(), { ...config, serviceAccountEmail: "other@example.com" }, fetcher, now), ProbeUnavailable);
  assert.equal(calls.length, 0);
});

test("onglet absent ou classeur différent refuse le diagnostic", async () => {
  for (const sheet of [
    { spreadsheetId: config.spreadsheetId, sheets: [{ properties: { title: "TRANSFERTS" } }] },
    { spreadsheetId: "different", sheets: [{ properties: { title: "TRANSFERTS" } }, { properties: { title: "AUDIT" } }] }
  ]) {
    const { fetcher } = fakeFetch({ sheet });
    await assert.rejects(runAdminTransferOidcProbe(token(), config, fetcher, now), ProbeUnavailable);
  }
});

test("échec Google ou réponse sensible ne révèle aucun détail", async () => {
  const { fetcher } = fakeFetch({ sts: { error: "a-sensitive-upstream-detail" } });
  await assert.rejects(runAdminTransferOidcProbe(token(), config, fetcher, now), (error) => {
    assert.equal(error.message, "PROBE_UNAVAILABLE");
    assert.equal(JSON.stringify(error).includes("sensitive"), false);
    return true;
  });
});

test("durée de jeton Google excessive ou invalide refusée", async () => {
  for (const expireTime of ["invalid", new Date(now + 3_600_000).toISOString()]) {
    const { fetcher } = fakeFetch({ iam: { accessToken: "fictitious-google-token", expireTime } });
    await assert.rejects(runAdminTransferOidcProbe(token(), config, fetcher, now), ProbeUnavailable);
  }
});

test("route désactivée : aucun contrôle d'identité ni appel Google", async () => {
  let calls = 0;
  const response = await handleAdminTransferOidcProbeRequest(new Request("https://example.test/check"), {
    enabled: false, expiresAt: undefined, vercelEnvironment: "production", config,
    authorize: async () => { calls++; return { authorized: true }; },
    run: async () => { calls++; throw new Error("unexpected"); }
  });
  assert.equal(response.status, 404);
  assert.equal(calls, 0);
});

test("Agent refusé avant OIDC, ADMIN autorisé sans donnée sensible", async () => {
  let oidcCalls = 0;
  const request = new Request("https://example.test/check", { headers: { "x-vercel-oidc-token": token() } });
  const base = { enabled: true, expiresAt: new Date(Date.now() + 300_000).toISOString(), vercelEnvironment: "production", config,
    run: async () => { oidcCalls++; return {
      state: "READ_METADATA_OK", oidcExchange: true, temporaryGoogleToken: true,
      transfersTab: true, auditTab: true, requestedSheetsScope: SHEETS_READ_SCOPE,
      writePermission: "NOT_TESTED"
    }; }
  };
  const denied = await handleAdminTransferOidcProbeRequest(request, {
    ...base, authorize: async () => ({ authorized: false, status: 403 })
  });
  assert.equal(denied.status, 403);
  assert.equal(oidcCalls, 0);
  const allowed = await handleAdminTransferOidcProbeRequest(request, {
    ...base, authorize: async () => ({ authorized: true })
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(oidcCalls, 1);
  assert.equal((await allowed.text()).includes(token()), false);
});

test("hors Production et panne Google : échec isolé", async () => {
  const request = new Request("https://example.test/check");
  let calls = 0;
  const base = { enabled: true, expiresAt: new Date(Date.now() + 300_000).toISOString(), config, authorize: async () => ({ authorized: true }),
    run: async () => { calls++; throw new Error("sensitive-upstream-detail"); }
  };
  const preview = await handleAdminTransferOidcProbeRequest(request, { ...base, vercelEnvironment: "preview" });
  assert.equal(preview.status, 503);
  assert.equal(calls, 0);
  const failure = await handleAdminTransferOidcProbeRequest(request, { ...base, vercelEnvironment: "production" });
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes("sensitive"), false);
});

test("échéance absente, passée ou trop éloignée désactive la route", async () => {
  let calls = 0;
  for (const expiresAt of [undefined, new Date(Date.now() - 1_000).toISOString(), new Date(Date.now() + 3_600_000).toISOString()]) {
    const response = await handleAdminTransferOidcProbeRequest(new Request("https://example.test/check"), {
      enabled: true, expiresAt, vercelEnvironment: "production", config,
      authorize: async () => { calls++; return { authorized: true }; }
    });
    assert.equal(response.status, 404);
  }
  assert.equal(calls, 0);
});

test("jeton démesuré refusé avant tout appel externe", async () => {
  const { fetcher, calls } = fakeFetch();
  await assert.rejects(runAdminTransferOidcProbe("x".repeat(16_385), config, fetcher, now), ProbeUnavailable);
  assert.equal(calls.length, 0);
});
