import assert from "node:assert/strict";
import test from "node:test";

import { getPortoNovoBusinessDate, isBusinessDate } from "./cash-dashboard.ts";
import { loadAdminCash, loadAgentCash } from "./cash-dashboard-client.ts";

test("calcule explicitement la date métier Africa/Porto-Novo", () => {
  assert.equal(getPortoNovoBusinessDate(new Date("2026-07-31T23:30:00.000Z")), "2026-08-01");
  assert.equal(isBusinessDate("2026-08-01"), true);
  assert.equal(isBusinessDate("2026-02-30"), false);
});
test("la lecture Agent transmet uniquement le Bearer token", async () => {
  let captured;
  const result = await loadAgentCash("agent-token", async (url, init) => {
    captured = { url, init };
    return Response.json({ businessDate: "2026-08-01", cash: null, outsideCash: true });
  });
  assert.equal(captured.url, "/api/agent/cash");
  assert.equal(captured.init.headers.Authorization, "Bearer agent-token");
  assert.equal(result.outsideCash, true);
});

test("la lecture Admin conserve le format public", async () => {
  const payload = { businessDate: "2026-08-01", agencies: [], cooOutsideCash: { businessDate: "2026-08-01", paymentCount: 0, paymentsTotal: 0, expensesTotal: 0, byAgent: [] }, audit: [], actions: { openingBalance: "AVAILABLE", adjustment: "UNAVAILABLE", correction: "UNAVAILABLE", closeDay: "UNAVAILABLE", reopenDay: "UNAVAILABLE" } };
  assert.deepEqual(await loadAdminCash("admin-token", async () => Response.json(payload)), payload);
});

test("une erreur serveur reste assainie", async () => {
  await assert.rejects(() => loadAgentCash("token", async () => Response.json({ error: { code: "CASH_UNAVAILABLE", message: "La Caisse est temporairement indisponible." } }, { status: 503 })), /temporairement indisponible/);
});
