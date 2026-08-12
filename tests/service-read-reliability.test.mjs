import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("les lectures Admin sensibles utilisent le helper Auth/retry commun", async () => {
  const paths = [
    "src/features/admin/payments.ts",
    "src/features/admin/shippers.ts",
    "src/features/admin/expenses.ts",
    "src/features/admin/admin-system-status.tsx",
    "src/features/stockages/api.ts"
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /authenticatedRead/, path);
    assert.match(source, /getSupabaseBrowserClient/, path);
  }
});

test("les lectures Admin Transferts indépendantes ne sont plus séquentielles", async () => {
  const source = await read("src/features/transferts/admin-transferts-page.tsx");
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /loadAdminTransfers\(/);
  assert.match(source, /loadAdminTransfersAudit\(/);
});

test("une nouvelle lecture Agent Transferts efface l’erreur précédente", async () => {
  const source = await read("src/features/transferts/agent-transferts-page.tsx");
  const loadStart = source.indexOf("async function load()");
  const clearError = source.indexOf('setError("")', loadStart);
  const remoteRead = source.indexOf("await loadAgentTransfers", loadStart);
  assert.ok(loadStart >= 0 && clearError > loadStart && clearError < remoteRead);
});
