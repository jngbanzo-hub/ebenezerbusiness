import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bell = readFileSync("src/features/notifications/notification-center.tsx", "utf8");
const workspace = readFileSync("src/features/admin/admin-workspace.tsx", "utf8");

test("le dashboard Admin additionne les activités et alertes non lues", () => {
  assert.match(workspace, /ADMIN_NOTIFICATION_ENDPOINTS = \["\/api\/admin\/recent-activity", "\/api\/admin\/alerts"\]/);
  assert.match(workspace, /endpoints=\{ADMIN_NOTIFICATION_ENDPOINTS\}/);
  assert.match(bell, /value\.unreadCount \?\? value\.count \?\? 0/);
  assert.match(bell, /values\.reduce/);
});

test("le badge reste masqué à zéro et visible au-dessus", () => {
  assert.match(bell, /count > 0 \?/);
  assert.match(bell, /bg-accent/);
});

test("le compteur se rafraîchit au retour, à la visibilité et périodiquement", () => {
  assert.match(bell, /window\.addEventListener\("focus", refresh\)/);
  assert.match(bell, /document\.addEventListener\("visibilitychange", refresh\)/);
  assert.match(bell, /window\.setInterval\(refresh, 30_000\)/);
});
