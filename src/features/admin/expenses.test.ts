import assert from "node:assert/strict";
import test from "node:test";

import { AdminExpensesApiError, loadActiveExpenseAgents, loadAdminExpenses, projectExpenseTotals } from "./expenses";

const response = {
  success: true as const,
  code: "DEPENSES_ADMIN_LISTEES" as const,
  lectureSeule: true as const,
  depenses: [],
  pagination: { page: 2, pageSize: 50, total: 51, totalPages: 2 },
  totaux: { nombreDepenses: 51, parDevise: { USD: 10, FCFA: 20, CDF: 30 }, parAgence: {}, parCategorie: {} }
};

test("utilise uniquement GET /api/admin/expenses avec le Bearer Admin", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const result = await loadAdminExpenses("admin-token", {
    from: "2026-08-01", agency: "FIH", currency: "USD", status: "ACTIVE", page: 2, pageSize: 50
  }, undefined, async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return Response.json(response);
  });
  assert.match(capturedUrl, /^\/api\/admin\/expenses\?/);
  assert.match(capturedUrl, /agency=FIH/);
  assert.equal(capturedInit?.method, "GET");
  assert.deepEqual(capturedInit?.headers, { Authorization: "Bearer admin-token" });
  assert.equal(result.totaux.parDevise.CDF, 30);
});

test("propage une erreur compréhensible sans exposer de secret", async () => {
  await assert.rejects(
    () => loadAdminExpenses("token", { page: 1, pageSize: 50 }, undefined, async () =>
      Response.json({ error: { message: "Accès Admin refusé." } }, { status: 403 })
    ),
    (error: unknown) => error instanceof AdminExpensesApiError && error.status === 403 && error.message === "Accès Admin refusé."
  );
});

test("refuse une réponse distante non conforme", async () => {
  await assert.rejects(
    () => loadAdminExpenses("token", { page: 1, pageSize: 50 }, undefined, async () => Response.json({ success: true, secret: "non" })),
    /Réponse Dépenses invalide/
  );
});

test("charge uniquement les Agents actifs depuis la route Admin en lecture", async () => {
  let capturedUrl = "";
  const agents = await loadActiveExpenseAgents("admin-token", undefined, async (url, init) => {
    capturedUrl = String(url);
    assert.equal(init?.method, "GET");
    assert.deepEqual(init?.headers, { Authorization: "Bearer admin-token" });
    return Response.json({
      success: true,
      code: "ACTIVE_EXPENSE_AGENTS_LISTED",
      readOnly: true,
      agents: [{ id: "agent-klz", name: "Maman Deborah", agency: "KLZ" }]
    });
  });
  assert.equal(capturedUrl, "/api/admin/expenses/agents");
  assert.deepEqual(agents, [{ id: "agent-klz", name: "Maman Deborah", agency: "KLZ" }]);
});

test("sépare le total général du total hors TF Bénin par devise", () => {
  const totals = projectExpenseTotals({
    ...response,
    totaux: {
      nombreDepenses: 3,
      parDevise: { USD: 1800, FCFA: 400, CDF: 0 },
      parAgence: {},
      parCategorie: {
        "TF Bénin": { USD: 550, FCFA: 100 },
        Déclarant: { USD: 240, FCFA: 50 }
      }
    }
  });
  assert.deepEqual(totals.USD, { general: 1800, withoutTfBenin: 1250, tfBenin: 550, declarant: 240 });
  assert.deepEqual(totals.FCFA, { general: 400, withoutTfBenin: 300, tfBenin: 100, declarant: 50 });
  assert.deepEqual(totals.CDF, { general: 0, withoutTfBenin: 0, tfBenin: 0, declarant: 0 });
});

test("catégorie TF Bénin seule donne zéro hors TF Bénin", () => {
  const totals = projectExpenseTotals({
    ...response,
    totaux: {
      nombreDepenses: 2,
      parDevise: { USD: 1800 },
      parAgence: {},
      parCategorie: { "TF Bénin": { USD: 1800 } }
    }
  });
  assert.equal(totals.USD.general, 1800);
  assert.equal(totals.USD.withoutTfBenin, 0);
  assert.equal(totals.USD.tfBenin, 1800);
  assert.equal(totals.USD.declarant, 0);
});

test("les indicateurs de catégories suivent le résultat filtré et sa devise", () => {
  const totals = projectExpenseTotals({
    ...response,
    totaux: {
      nombreDepenses: 1,
      parDevise: { FCFA: 25000 },
      parAgence: {},
      parCategorie: { Déclarant: { FCFA: 25000 } }
    }
  });
  assert.equal(totals.FCFA.tfBenin, 0);
  assert.equal(totals.FCFA.declarant, 25000);
  assert.equal(totals.USD.declarant, 0);
});
