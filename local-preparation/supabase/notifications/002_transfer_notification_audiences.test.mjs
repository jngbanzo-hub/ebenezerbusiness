import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./002_transfer_notification_audiences.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("../../../src/server/internal-notifications.ts", import.meta.url), "utf8");

test("la migration ajoute TRANSFER et sépare les audiences sans écriture navigateur", () => {
  assert.match(sql, /'TRANSFER'/);
  assert.match(sql, /audience_role in \('ALL','AGENT','ADMIN'\)/);
  assert.match(sql, /internal_notifications\.audience_role in \('ALL','AGENT'\)/);
  assert.match(service, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(service, /ignoreDuplicates: true/);
});
