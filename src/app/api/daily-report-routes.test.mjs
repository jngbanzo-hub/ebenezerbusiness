import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("les rapports sont GET uniquement et protégés selon le rôle", () => {
  const admin = readFileSync(new URL("./admin/daily-report/route.ts", import.meta.url), "utf8");
  const agent = readFileSync(new URL("./agent/daily-report/route.ts", import.meta.url), "utf8");
  assert.match(admin, /authorizeAdminRequest/); assert.match(agent, /authorizeAgentRequest/);
  assert.match(admin, /allReportAgencies/); assert.match(agent, /agencies: \[auth\.identity\.site\]/);
  assert.match(admin, /parseAdminReportPeriod/); assert.doesNotMatch(agent, /parseAdminReportPeriod|searchParams/);
  for (const source of [admin, agent]) { assert.match(source, /export async function GET/); assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/); assert.match(source, /private, no-store/); }
});

test("la note Admin est auditée côté serveur et aucune route Agent ne peut écrire", () => {
  const noteRoute = readFileSync(new URL("./admin/daily-report/note/route.ts", import.meta.url), "utf8");
  const noteService = readFileSync(new URL("../../server/daily-report-note.ts", import.meta.url), "utf8");
  assert.match(noteRoute, /authorizeAdminRequest/);
  assert.match(noteService, /cash_admin_audit/);
  assert.match(noteService, /DAILY_REPORT_NOTE/);
  assert.doesNotMatch(noteService, /cash_events|stockage_events/);
});
