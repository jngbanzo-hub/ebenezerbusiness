import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const serverSource = await readFile(
  new URL("../src/server/transferts-apps-script.ts", import.meta.url),
  "utf8"
);
const testableSource = serverSource
  .replace('import "server-only";', "")
  .replace(
    /import \\{[\\s\\S]*?\\} from "node:crypto";/,
    'import { createHash, createHmac, randomUUID } from "node:crypto";'
  );
const compiled = ts.transpileModule(testableSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const module = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const routePaths = [
  "../src/app/api/agent/transferts/route.ts",
  "../src/app/api/agent/transferts/[transferId]/route.ts",
  "../src/app/api/admin/transferts/route.ts",
  "../src/app/api/admin/transferts/[transferId]/route.ts",
  "../src/app/api/admin/transferts/audit/route.ts"
];
const routes = await Promise.all(
  routePaths.map((path) => readFile(new URL(path, import.meta.url), "utf8"))
);
const flags = await readFile(
  new URL("../src/server/transferts-feature-flags.ts", import.meta.url),
  "utf8"
);
const agentPage = await readFile(
  new URL("../src/features/transferts/agent-transferts-page.tsx", import.meta.url),
  "utf8"
);
const adminPage = await readFile(
  new URL("../src/features/transferts/admin-transferts-page.tsx", import.meta.url),
  "utf8"
);
const dashboard = await readFile(
  new URL("../src/features/agent/agent-dashboard.tsx", import.meta.url),
  "utf8"
);

test("les routes de lecture Transferts conservent GET sans PUT, PATCH ou DELETE", () => {
  for (const route of routes) {
    assert.ok(route.includes("export async function GET"));
    assert.equal(/export async function (PUT|PATCH|DELETE)/.test(route), false);
    if (route !== routes[0]) {
      assert.ok(route.includes('"Cache-Control": "private, no-store, max-age=0"'));
    }
  }
  assert.ok(routes[0].includes("export async function POST"));
  for (const route of routes.slice(1)) {
    assert.equal(route.includes("export async function POST"), false);
  }
});

test("l’autorisation serveur précède chaque appel Apps Script", () => {
  for (const route of routes) {
    const authorization = route.indexOf("await authorize");
    const remoteCall = route.indexOf("await callTransfertsReadApi");
    assert.ok(authorization >= 0);
    if (remoteCall >= 0) assert.ok(authorization < remoteCall);
  }
  assert.ok(routes[0].includes("identity.site"));
  assert.equal(routes[0].includes("searchParams"), false);
  assert.equal(routes[1].includes("actorAgency"), false);
});

test("la canonisation et la base de signature correspondent au contrat V2", () => {
  const left = { z: 1, a: { y: 2, x: ["b", "a"] } };
  const right = { a: { x: ["b", "a"], y: 2 }, z: 1 };
  assert.equal(
    module.canonicalizeTransfertsPayload(left),
    module.canonicalizeTransfertsPayload(right)
  );
  const signatureBase = module.buildTransfertsSignatureBase({
      timestamp: "100",
      nonce: "n",
      requestId: "r",
      action: "GET_TRANSFER",
      actorUserId: "u",
      actorAgency: "fih",
      payload: { transferId: "t" }
    });
  assert.equal(
    signatureBase.split("|").slice(0, 6).join("|"),
    "100|n|r|GET_TRANSFER|u|FIH"
  );
  assert.equal(
    module.signTransfertsRequest("secret", signatureBase),
    createHmac("sha256", "secret").update(signatureBase).digest("hex")
  );
});

test("une lecture interrompue est retentée une seule fois, jamais une écriture", async () => {
  const originalEnv = {
    url: process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL,
    apiKey: process.env.TRANSFERTS_API_KEY,
    secret: process.env.TRANSFERTS_HMAC_SECRET
  };
  process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL = "https://script.google.com/macros/s/test/exec";
  process.env.TRANSFERTS_API_KEY = "test-key";
  process.env.TRANSFERTS_HMAC_SECRET = "test-secret";
  try {
    let readCalls = 0;
    const read = await module.callTransfertsReadApi(
      "LIST_AGENCY_TRANSFERS",
      { userId: "agent", email: "agent@example.test", role: "AGENT", agency: "FIH" },
      { agency: "FIH" },
      { fetcher: async (_url, init) => {
        readCalls += 1;
        if (readCalls === 1) throw new DOMException("timeout", "AbortError");
        const body = JSON.parse(init.body);
        return Response.json({ ok: true, requestId: body.requestId, action: body.action, data: [], error: null });
      } }
    );
    assert.deepEqual(read, []);
    assert.equal(readCalls, 2);

    let writeCalls = 0;
    await assert.rejects(() => module.callTransfertsWriteApi(
      "CREATE_TRANSFER",
      { userId: "agent", email: "agent@example.test", role: "AGENT", agency: "FIH" },
      {},
      { fetcher: async () => { writeCalls += 1; throw new DOMException("timeout", "AbortError"); } }
    ), (error) => error?.name === "AbortError");
    assert.equal(writeCalls, 1);
  } finally {
    if (originalEnv.url === undefined) delete process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL; else process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL = originalEnv.url;
    if (originalEnv.apiKey === undefined) delete process.env.TRANSFERTS_API_KEY; else process.env.TRANSFERTS_API_KEY = originalEnv.apiKey;
    if (originalEnv.secret === undefined) delete process.env.TRANSFERTS_HMAC_SECRET; else process.env.TRANSFERTS_HMAC_SECRET = originalEnv.secret;
  }
});

test("une lecture 503 est retentée, un refus métier ne l'est pas", async () => {
  const originalEnv = {
    url: process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL,
    apiKey: process.env.TRANSFERTS_API_KEY,
    secret: process.env.TRANSFERTS_HMAC_SECRET
  };
  process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL = "https://script.google.com/macros/s/test/exec";
  process.env.TRANSFERTS_API_KEY = "test-key";
  process.env.TRANSFERTS_HMAC_SECRET = "test-secret";
  try {
    let transientCalls = 0;
    const transient = await module.callTransfertsReadApi(
      "LIST_ADMIN_TRANSFERS",
      { userId: "admin", email: "admin@example.test", role: "ADMIN", agency: "COO" },
      {},
      { fetcher: async (_url, init) => {
        transientCalls += 1;
        if (transientCalls === 1) return new Response("unavailable", { status: 503 });
        const body = JSON.parse(init.body);
        return Response.json({ ok: true, requestId: body.requestId, action: body.action, data: [], error: null });
      } }
    );
    assert.deepEqual(transient, []);
    assert.equal(transientCalls, 2);

    let businessCalls = 0;
    await assert.rejects(() => module.callTransfertsReadApi(
      "GET_TRANSFER",
      { userId: "admin", email: "admin@example.test", role: "ADMIN", agency: "COO" },
      { transferId: "missing" },
      { fetcher: async (_url, init) => {
        businessCalls += 1;
        const body = JSON.parse(init.body);
        return Response.json({
          ok: false,
          requestId: body.requestId,
          action: body.action,
          data: null,
          error: { code: "TRANSFER_NOT_FOUND", message: "Introuvable" }
        });
      } }
    ), (error) => error?.code === "TRANSFER_NOT_FOUND");
    assert.equal(businessCalls, 1);
  } finally {
    if (originalEnv.url === undefined) delete process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL; else process.env.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL = originalEnv.url;
    if (originalEnv.apiKey === undefined) delete process.env.TRANSFERTS_API_KEY; else process.env.TRANSFERTS_API_KEY = originalEnv.apiKey;
    if (originalEnv.secret === undefined) delete process.env.TRANSFERTS_HMAC_SECRET; else process.env.TRANSFERTS_HMAC_SECRET = originalEnv.secret;
  }
});

test("les lectures disposent d'une fenêtre dédiée sans allonger les écritures", () => {
  assert.match(serverSource, /isReadAction \? 30_000 : 15_000/);
});

test("le client serveur supprime récursivement tout code complet", () => {
  const safe = module.stripFullTransferCodes({
    transferCode: "SECRET",
    newTransferCode: "NOUVEAU_SECRET",
    oldTransferCode: "ANCIEN_SECRET",
    apiKey: "API_SECRET",
    signature: "SIGNED",
    nonce: "NONCE",
    maskedCode: "****CRET",
    nested: [{ transferCode: "AUTRE", hmacSecret: "HMAC", status: "ENVOYE" }]
  });
  assert.deepEqual(safe, {
    maskedCode: "****CRET",
    nested: [{ status: "ENVOYE" }]
  });
  assert.equal(JSON.stringify(safe).includes("SECRET"), false);
});

test("seul le détail Agent explicitement autorisé peut conserver transferCode", () => {
  const source = {
    transferCode: "CODE-AUTORISE",
    maskedCode: "********RISE",
    apiKey: "INTERDIT",
    nested: { nonce: "INTERDIT" }
  };
  assert.deepEqual(
    module.sanitizeTransfertsResponse(source, { allowTransferCode: true }),
    { transferCode: "CODE-AUTORISE", maskedCode: "********RISE", nested: {} }
  );
  assert.equal(
    JSON.stringify(module.sanitizeTransfertsResponse(source, { allowTransferCode: false }))
      .includes("CODE-AUTORISE"),
    false
  );
});

test("les flags restent strictement serveur et désactivés par défaut", () => {
  assert.ok(flags.includes('process.env.TRANSFERTS_API_WRITES_ENABLED === "true"'));
  assert.ok(flags.includes('process.env.TRANSFERTS_ADMIN_API_ENABLED === "true"'));
  assert.equal(flags.includes("NEXT_PUBLIC_"), false);
  assert.ok(routes[2].includes("if (!flags.adminEnabled)"));
});

test("aucun secret ni URL Apps Script n’est présent dans le client", () => {
  for (const source of [agentPage, adminPage, dashboard]) {
    assert.equal(source.includes("script.google.com"), false);
    assert.equal(source.includes("TRANSFERTS_HMAC_SECRET"), false);
    assert.equal(source.includes("TRANSFERTS_API_KEY"), false);
    assert.equal(source.includes("TRANSFERTS_PUBLIC_APPS_SCRIPT_URL"), false);
  }
});

test("les interfaces gardent un état de préparation contrôlé", () => {
  assert.ok(agentPage.includes("Le module Transferts est en cours de préparation."));
  assert.ok(agentPage.includes("Les opérations réelles seront disponibles après autorisation de mise en service."));
  assert.ok(adminPage.includes("DÉSACTIVÉ"));
  assert.equal(agentPage.includes('method: "POST"'), false);
  assert.equal(adminPage.includes('method: "POST"'), false);
});

test("le flag d’écriture ne désactive aucune route GET", () => {
  assert.ok(flags.includes("assertTransfertsReadOnlyMode"));
  assert.equal(flags.includes("TRANSFERTS_WRITES_NOT_AUTHORIZED"), false);
  assert.equal(routes[0].includes("assertTransfertsReadOnlyMode"), false);
  assert.equal(routes[1].includes("assertTransfertsReadOnlyMode"), false);
});

test("le tableau Agent conserve tous les modules autorisés, dont Transferts", () => {
  for (const title of ["Encaissement", "Dépenses", "Stockages", "Transferts", "Caisse"]) {
    assert.ok(dashboard.includes(`title: "${title}"`));
  }
  assert.equal((dashboard.match(/available: true/g) ?? []).length, 7);
});
