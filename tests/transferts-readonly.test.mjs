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

test("les cinq routes Transferts exposent exclusivement GET", () => {
  for (const route of routes) {
    assert.ok(route.includes("export async function GET"));
    assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(route), false);
    assert.ok(route.includes('"Cache-Control": "private, no-store, max-age=0"'));
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

test("le client serveur supprime récursivement tout code complet", () => {
  const safe = module.stripFullTransferCodes({
    transferCode: "SECRET",
    maskedCode: "****CRET",
    nested: [{ transferCode: "AUTRE", status: "ENVOYE" }]
  });
  assert.deepEqual(safe, {
    maskedCode: "****CRET",
    nested: [{ status: "ENVOYE" }]
  });
  assert.equal(JSON.stringify(safe).includes("SECRET"), false);
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
    assert.equal(source.includes("transferCode"), false);
  }
});

test("les interfaces restent en préparation et sans écriture", () => {
  assert.ok(agentPage.includes("Le module Transferts est en cours de préparation."));
  assert.ok(agentPage.includes("Les opérations réelles seront disponibles après autorisation de mise en service."));
  assert.ok(adminPage.includes("DÉSACTIVÉ"));
  assert.ok(agentPage.includes("<Button disabled"));
  assert.ok(adminPage.includes("<Button disabled"));
  assert.equal(agentPage.includes('method: "POST"'), false);
  assert.equal(adminPage.includes('method: "POST"'), false);
});

test("le tableau Agent contient exactement les quatre modules", () => {
  for (const title of ["Encaissement", "Dépenses", "Stockages", "Transferts"]) {
    assert.ok(dashboard.includes(`title: "${title}"`));
  }
  assert.equal((dashboard.match(/available: true/g) ?? []).length, 4);
});
