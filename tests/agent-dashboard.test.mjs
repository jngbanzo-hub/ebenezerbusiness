import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";

const projectRoot = new URL("../", import.meta.url);
const projectRootPath = fileURLToPath(projectRoot);
const authorizationSource = await readFile(
  new URL("../src/server/agent-authorization.ts", import.meta.url),
  "utf8"
);
const testableAuthorizationSource = authorizationSource
  .replace('import "server-only";', "")
  .replace(
    'import { createClient } from "@supabase/supabase-js";',
    "const createClient = () => { throw new Error('non utilisé dans ce test'); };"
  )
  .replace(
    'import { isAgency } from "@/features/agent/agencies";',
    'const isAgency = (value) => ["COTONOU", "FIH", "LSHI", "KLZ"].includes(value);'
  );
const compiledAuthorization = ts.transpileModule(testableAuthorizationSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const authorizationModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiledAuthorization).toString(
    "base64"
  )}`
);

function requestWithToken(token = "valide") {
  return new Request("https://example.test/api/agent/profile", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

function resolvedIdentity(overrides = {}) {
  return {
    userId: "user-1",
    profile: {
      id: "user-1",
      nom: "Agent Test",
      agence: "FIH",
      role: "AGENT",
      actif: true,
      ...overrides
    }
  };
}

test("refuse JWT absent et JWT invalide", async () => {
  let resolverCalls = 0;
  const withoutToken = await authorizationModule.authorizeAgentRequest(
    new Request("https://example.test/api/agent/profile"),
    async () => {
      resolverCalls += 1;
      return null;
    }
  );
  assert.deepEqual(withoutToken, { authorized: false, status: 401 });
  assert.equal(resolverCalls, 0);

  const invalidToken = await authorizationModule.authorizeAgentRequest(
    requestWithToken("invalide"),
    async () => null
  );
  assert.deepEqual(invalidToken, { authorized: false, status: 401 });
});

test("autorise un AGENT actif et normalise son agence côté serveur", async () => {
  const result = await authorizationModule.authorizeAgentRequest(
    requestWithToken(),
    async () =>
      resolvedIdentity({
        nom: " Agent Test ",
        agence: " cotonou ",
        role: " agent "
      })
  );

  assert.deepEqual(result, {
    authorized: true,
    identity: {
      userId: "user-1",
      nom: "Agent Test",
      role: "AGENT",
      agence: "COTONOU",
      site: "COO"
    }
  });
});

test("refuse profil absent, inactif, ADMIN, agence inconnue ou ID différent", async () => {
  for (const identity of [
    { userId: "user-1", profile: null },
    resolvedIdentity({ actif: false }),
    resolvedIdentity({ role: "ADMIN" }),
    resolvedIdentity({ agence: "AUTRE" }),
    resolvedIdentity({ id: "user-2" })
  ]) {
    const result = await authorizationModule.authorizeAgentRequest(
      requestWithToken(),
      async () => identity
    );
    assert.deepEqual(result, { authorized: false, status: 403 });
  }
});

test("la route profil ignore toute agence envoyée par le navigateur", async () => {
  const route = await readFile(
    new URL("../src/app/api/agent/profile/route.ts", import.meta.url),
    "utf8"
  );

  assert.ok(route.includes("await authorizeAgentRequest(request)"));
  assert.equal(route.includes("searchParams"), false);
  assert.equal(route.includes("request.json"), false);
  assert.ok(route.includes('"Cache-Control": "private, no-store, max-age=0"'));
  assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(route), false);
});

test("/agent affiche quatre cartes et seule Encaissement est active", async () => {
  const dashboard = await readFile(
    new URL("../src/features/agent/agent-dashboard.tsx", import.meta.url),
    "utf8"
  );
  const page = await readFile(
    new URL("../src/app/agent/page.tsx", import.meta.url),
    "utf8"
  );

  for (const title of ["Arrivage", "Encaissement", "Dépenses", "Stockage"]) {
    assert.ok(dashboard.includes(`title: "${title}"`));
  }
  assert.equal(
    (dashboard.match(/available: true/g) ?? []).length,
    1
  );
  assert.equal(
    dashboard.split('href: "/agent/encaissement"').length - 1,
    1
  );
  assert.ok(dashboard.includes("Bientôt disponible"));
  assert.ok(page.includes("<AgentDashboard />"));
});

test("la navigation connexion, encaissement, retour et déconnexion est conservée", async () => {
  const signIn = await readFile(
    new URL("../src/features/agent/sign-in-form.tsx", import.meta.url),
    "utf8"
  );
  const dashboard = await readFile(
    new URL("../src/features/agent/agent-dashboard.tsx", import.meta.url),
    "utf8"
  );
  const paymentPage = await readFile(
    new URL("../src/app/agent/encaissement/page.tsx", import.meta.url),
    "utf8"
  );

  assert.ok(
    signIn.includes('profile.role === "ADMIN" ? "/admin" : "/agent"')
  );
  assert.ok(dashboard.includes('router.replace("/auth/sign-in")'));
  assert.ok(paymentPage.includes('href="/agent"'));
  assert.ok(paymentPage.includes("<AgentWorkspace />"));
});

test("AgentWorkspace et toutes ses dépendances internes restent identiques à HEAD", async () => {
  const protectedFiles = [
    "src/features/agent/agent-workspace.tsx",
    "src/features/agent/functions.ts",
    "src/features/agent/parcel.ts",
    "src/features/agent/payment-request-id.ts",
    "src/features/agent/agencies.ts",
    "src/features/agent/auth.ts",
    "src/features/agent/supabase.ts",
    "src/features/agent/types.ts"
  ];

  for (const file of protectedFiles) {
    const current = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const committed = execFileSync("git", ["show", `HEAD:${file}`], {
      cwd: projectRootPath,
      encoding: "utf8"
    });
    assert.equal(current, committed, `${file} a été modifié`);
  }
});
