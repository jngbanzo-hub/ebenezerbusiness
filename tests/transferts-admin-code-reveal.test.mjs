import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../src/app/api/admin/transferts/[transferId]/code/route.ts", import.meta.url),
  "utf8"
);
const details = await readFile(
  new URL("../src/features/transferts/admin-transfer-details.tsx", import.meta.url),
  "utf8"
);
const api = await readFile(
  new URL("../src/features/transferts/api.ts", import.meta.url),
  "utf8"
);
const server = await readFile(
  new URL("../src/server/transferts-apps-script.ts", import.meta.url),
  "utf8"
);
const agentRoute = await readFile(
  new URL("../src/app/api/agent/transferts/[transferId]/route.ts", import.meta.url),
  "utf8"
);

test("le code Admin est récupéré uniquement par une route GET authentifiée", () => {
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.ok(route.indexOf("await authorizeAdminRequest") < route.indexOf("await callTransfertsReadApi"));
  assert.ok(route.includes("getTransfertsFeatureFlags().adminEnabled"));
  assert.ok(route.includes("allowAdminDetailCode: true"));
  assert.ok(route.includes('"Cache-Control": "private, no-store, max-age=0"'));
});

test("le détail reste masqué par défaut et révèle ponctuellement avec un bouton œil", () => {
  assert.ok(details.includes("revealedCode || transfer.maskedCode"));
  assert.ok(details.includes("revealAdminTransferCode"));
  assert.ok(details.includes("Afficher le code de transfert"));
  assert.ok(details.includes("Masquer le code de transfert"));
  assert.ok(details.includes('setRevealedCode("")'));
  assert.ok(api.includes("/code`"));
});

test("le serveur n’autorise le code complet que pour le rôle et l’option correspondants", () => {
  assert.ok(server.includes('actor.role === "AGENT" && options.allowAgentDetailCode === true'));
  assert.ok(server.includes('actor.role === "ADMIN" && options.allowAdminDetailCode === true'));
  assert.ok(agentRoute.includes("allowAgentDetailCode: true"));
  assert.equal(agentRoute.includes("allowAdminDetailCode"), false);
});
