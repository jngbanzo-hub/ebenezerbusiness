import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("les rapports sont GET uniquement et protégés selon le rôle", () => {
  const admin = readFileSync(new URL("./admin/daily-report/route.ts", import.meta.url), "utf8");
  const agent = readFileSync(new URL("./agent/daily-report/route.ts", import.meta.url), "utf8");
  assert.match(admin, /authorizeAdminRequest/); assert.match(agent, /authorizeAgentRequest/);
  assert.match(admin, /allReportAgencies/); assert.match(agent, /agencies: \[auth\.identity\.site\]/);
  for (const source of [admin, agent]) { assert.match(source, /export async function GET/); assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/); assert.match(source, /private, no-store/); }
});
