import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("la Caisse utilise une page dédiée et la source Agent autorisée existante", async () => {
  const dashboard = await read("src/features/agent/agent-dashboard.tsx");
  const page = await read("src/app/agent/caisse/page.tsx");
  const view = await read("src/features/cash/cash-dashboard-view.tsx");
  const route = await read("src/app/api/agent/cash/route.ts");

  assert.match(dashboard, /href: "\/agent\/caisse"/);
  assert.doesNotMatch(dashboard, /<AgentCashDashboardView/);
  assert.match(page, /<AgentCashPage/);
  assert.match(view, /loadAgentCash\(session\.access_token\)/);
  assert.match(route, /authorizeAgentRequest\(request\)/);
  assert.match(route, /readAgent\(authorization\.identity\.site, businessDate\)/);
});

test("les cartes Agent et Stockages partagent le système visuel officiel", async () => {
  const dashboard = await read("src/features/agent/agent-dashboard.tsx");
  const stockages = await read("src/features/stockages/stockages-v2-page.tsx");
  for (const source of [dashboard, stockages]) {
    assert.match(source, /border-accent\/25/);
    assert.match(source, /bg-accent\/15 text-accent/);
    assert.match(source, /variant="growth"/);
  }
  assert.doesNotMatch(stockages, /border-lime-400\/25 bg-slate-900 p-6 transition/);
});

test("la grille reste responsive et le bouton Rechercher utilise le vert officiel", async () => {
  const dashboard = await read("src/features/agent/agent-dashboard.tsx");
  const workspace = await read("src/features/agent/agent-workspace.tsx");
  assert.match(dashboard, /sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5/);
  assert.match(workspace, /<Button type="submit" variant="growth" disabled=\{isSearching\}>/);
});
