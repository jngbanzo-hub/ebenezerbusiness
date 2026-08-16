import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../../supabase/migrations/20260816220000_qr_stock_summary_server.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("./qr-stock-summary.ts", import.meta.url), "utf8");
const agentRoute = readFileSync(new URL("../app/api/agent/qr/stock-summary/route.ts", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../app/api/admin/qr/stock-summary/route.ts", import.meta.url), "utf8");
const cards = readFileSync(new URL("../features/qr-label/qr-stock-summary.tsx", import.meta.url), "utf8");

test("agrège exclusivement qr_labels en lecture seule", () => {
  assert.match(sql, /from public\.qr_labels/i);
  assert.match(sql, /filter \(where status = 'UNASSIGNED'\)/i);
  assert.match(sql, /filter \(where status = 'ASSIGNED'\)/i);
  assert.match(sql, /filter \(where status = 'REVOKED'\)/i);
  assert.doesNotMatch(sql, /insert|update|delete/i);
  assert.doesNotMatch(service, /\.from\("qr_labels"\)/);
});

test("RPC service-only et routes protégées", () => {
  assert.match(sql, /revoke all[\s\S]*public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.match(agentRoute, /authorizeAgentRequest/);
  assert.match(agentRoute, /site !== "COO"/);
  assert.match(adminRoute, /authorizeAdminRequest/);
});

test("affiche les quatre compteurs", () => {
  for (const label of ["QR libres", "QR associés", "QR révoqués", "Total QR"]) assert.match(cards, new RegExp(label));
});
