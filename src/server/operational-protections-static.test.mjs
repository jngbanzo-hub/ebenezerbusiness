import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("./operational-anomalies.ts", import.meta.url), "utf8");
const reconciliation = readFileSync(new URL("./operational-reconciliation.ts", import.meta.url), "utf8");
const adminRoute = readFileSync(new URL("../app/api/admin/operational-anomalies/route.ts", import.meta.url), "utf8");
const cronRoute = readFileSync(new URL("../app/api/internal/cron/operational-anomalies/route.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../features/admin/admin-operational-anomalies.tsx", import.meta.url), "utf8");

test("le contrôle est exhaustif et sans primitive d’écriture", () => {
  assert.match(service, /readExhaustivePages/);
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.doesNotMatch(reconciliation, /fetch\(|createClient|\.insert\(|\.update\(/);
});
test("les routes sont GET-only et protégées", () => {
  assert.match(adminRoute, /authorizeAdminRequest/);
  assert.match(cronRoute, /CRON_SECRET/);
  assert.doesNotMatch(adminRoute + cronRoute, /export async function (POST|PUT|PATCH|DELETE)/);
});
test("le centre Admin annonce explicitement la lecture seule", () => {
  assert.match(ui, /strictement en lecture seule/);
  assert.doesNotMatch(ui, /authenticatedRead[^\n]+method:\s*["']POST/);
});
