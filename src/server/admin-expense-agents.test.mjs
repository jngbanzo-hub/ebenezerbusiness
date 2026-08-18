import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./admin-expense-agents.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/expenses/agents/route.ts", import.meta.url), "utf8");

test("la source Agents est public.agents, active, Agent et strictement en lecture", () => {
  assert.match(source, /\.from\("agents"\)/);
  assert.match(source, /\.select\("id,nom,agence,role,actif"\)/);
  assert.match(source, /\.eq\("actif", true\)/);
  assert.match(source, /role === "AGENT"/);
  assert.doesNotMatch(source, /\.insert|\.update|\.delete|\.upsert|\.rpc/);
});

test("la route Agents exige un Admin et n’expose qu’un GET non mis en cache", () => {
  assert.match(route, /authorizeAdminRequest\(request\)/);
  assert.match(route, /export async function GET/);
  assert.match(route, /private, no-store, max-age=0/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
});
