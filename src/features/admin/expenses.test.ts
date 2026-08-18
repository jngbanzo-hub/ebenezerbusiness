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
      parCategorie: { "TF Bénin": { USD: 550, FCFA: 100 } }
    }
  });
  assert.deepEqual(totals.USD, { general: 1800, withoutTfBenin: 1250 });
  assert.deepEqual(totals.FCFA, { general: 400, withoutTfBenin: 300 });
  assert.deepEqual(totals.CDF, { general: 0, withoutTfBenin: 0 });
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
});
