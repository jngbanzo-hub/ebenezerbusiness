import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/server/transferts-notifications.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace(/^import .*;\n/gm, ""), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const notifications = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const transfer = { transferId: "TR-001", agencyFrom: "FIH", agencyTo: "KLZ", amount: 120, currency: "USD", fees: 5, service: "Express", beneficiaryName: "Bénéficiaire" };
const actor = { userId: "00000000-0000-4000-8000-000000000001", name: "Agent FIH" };

test("création cible uniquement l'agence bénéficiaire et l'Admin avec des clés déterministes", () => {
  const rows = notifications.buildTransferCreatedNotifications(transfer, actor);
  assert.deepEqual(rows.map((row) => [row.eventKey, row.agency, row.audience]), [
    ["transfer_created:TR-001:beneficiary_agency", "KLZ", "AGENT"],
    ["transfer_created:TR-001:admin", "KLZ", "ADMIN"]
  ]);
  assert.equal(new Set(rows.map((row) => row.eventKey)).size, 2);
});

test("retrait cible uniquement l'agence expéditrice et l'Admin avec des clés déterministes", () => {
  const rows = notifications.buildTransferWithdrawnNotifications(transfer, { ...actor, name: "Agent KLZ" });
  assert.deepEqual(rows.map((row) => [row.eventKey, row.agency, row.audience]), [
    ["transfer_withdrawn:TR-001:source_agency", "FIH", "AGENT"],
    ["transfer_withdrawn:TR-001:admin", "FIH", "ADMIN"]
  ]);
  assert.equal(new Set(rows.map((row) => row.eventKey)).size, 2);
});
