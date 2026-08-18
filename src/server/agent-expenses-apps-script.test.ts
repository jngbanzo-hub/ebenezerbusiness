import assert from "node:assert/strict";
import test from "node:test";

import { AdminExpenseReadError, readAdminExpenses } from "./agent-expenses-apps-script";

const identity = {
  userId: "20000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  agency: "COO" as const
};

const validResponse = {
  success: true,
  code: "DEPENSES_ADMIN_LISTEES",
  lectureSeule: true,
  depenses: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
  totaux: { nombreDepenses: 0, parDevise: {}, parAgence: {}, parCategorie: {} }
};

function withConfiguration(run: () => Promise<void>) {
  const previousUrl = process.env.DEPENSES_PUBLIC_APPS_SCRIPT_URL;
  const previousKey = process.env.DEPENSES_PUBLIC_API_KEY;
  process.env.DEPENSES_PUBLIC_APPS_SCRIPT_URL = "https://script.google.com/macros/s/example/exec";
  process.env.DEPENSES_PUBLIC_API_KEY = "secret-not-returned";
  return run().finally(() => {
    if (previousUrl === undefined) delete process.env.DEPENSES_PUBLIC_APPS_SCRIPT_URL;
    else process.env.DEPENSES_PUBLIC_APPS_SCRIPT_URL = previousUrl;
    if (previousKey === undefined) delete process.env.DEPENSES_PUBLIC_API_KEY;
    else process.env.DEPENSES_PUBLIC_API_KEY = previousKey;
  });
}

test("appelle uniquement LISTER_DEPENSES_ADMIN avec l'identité serveur", () => withConfiguration(async () => {
  let requestBody: { action?: unknown; acteur?: unknown } = {};
  const result = await readAdminExpenses(identity, {}, async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json(validResponse);
  });
  assert.equal(result.lectureSeule, true);
  assert.equal(requestBody?.action, "LISTER_DEPENSES_ADMIN");
  assert.deepEqual(requestBody?.acteur, { id: identity.userId, nom: identity.email, role: "ADMIN", actif: true, agence: "COO" });
  assert.equal(JSON.stringify(result).includes("secret-not-returned"), false);
}));

test("refuse localement les filtres et pageSize invalides", () => withConfiguration(async () => {
  await assert.rejects(() => readAdminExpenses(identity, { agence: "PARIS" as never }, async () => Response.json(validResponse)));
  await assert.rejects(() => readAdminExpenses(identity, { dateDebut: "2026-02-30" }, async () => Response.json(validResponse)));
  await assert.rejects(() => readAdminExpenses(identity, { pageSize: 101 }, async () => Response.json(validResponse)));
}));

test("refuse une réponse distante non conforme", () => withConfiguration(async () => {
  await assert.rejects(
    () => readAdminExpenses(identity, {}, async () => Response.json({ success: true, depenses: [{ secret: "leak" }] })),
    /Réponse Admin Dépenses invalide/
  );
}));

test("préserve le code métier d’une catégorie invalide", () => withConfiguration(async () => {
  await assert.rejects(
    () => readAdminExpenses(identity, { categorie: "TF" }, async () =>
      Response.json({ success: false, code: "CATEGORIE_INVALIDE", message: "Valeur de filtre invalide." })
    ),
    (error: unknown) => error instanceof AdminExpenseReadError && error.code === "CATEGORIE_INVALIDE"
  );
}));
