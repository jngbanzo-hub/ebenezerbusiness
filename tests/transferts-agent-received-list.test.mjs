import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const typesSource = await readFile(new URL("../src/features/transferts/types.ts", import.meta.url), "utf8");
const typesCode = ts.transpileModule(typesSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const typesUrl = `data:text/javascript;base64,${Buffer.from(typesCode).toString("base64")}`;
const source = (await readFile(new URL("../src/features/transferts/agent-received-transfers.ts", import.meta.url), "utf8"))
  .replace('from "@/features/transferts/types";', `from "${typesUrl}";`);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { receivedOriginsForAgency, visibleAgentTransfers } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

const transfer = (id, from, to, date, status = "ENVOYE") => ({
  transferId: id,
  agencyFrom: from,
  agencyTo: to,
  sentAt: date,
  status
});

test("les origines proposées suivent exactement les circuits autorisés pour les quatre agences", () => {
  assert.deepEqual(receivedOriginsForAgency("COO"), ["FIH", "LSHI", "KLZ"]);
  for (const agency of ["FIH", "LSHI", "KLZ"]) {
    assert.deepEqual(receivedOriginsForAgency(agency), ["COO"]);
  }
});

test("les reçus sont isolés par destination, filtrés par origine et statut, puis triés sur la date d’envoi", () => {
  const rows = [
    transfer("old", "FIH", "COO", "2026-09-01T10:00:00Z", "CODE_RECU"),
    transfer("other-destination", "FIH", "LSHI", "2026-09-30T10:00:00Z", "CODE_RECU"),
    transfer("new", "FIH", "COO", "2026-09-20T10:00:00Z", "CODE_RECU"),
    transfer("other-origin", "KLZ", "COO", "2026-09-25T10:00:00Z", "CODE_RECU"),
    transfer("other-status", "FIH", "COO", "2026-09-28T10:00:00Z"),
    transfer("invalid-date", "FIH", "COO", "invalid", "CODE_RECU")
  ];
  const ids = visibleAgentTransfers(rows, "COO", "RECEIVED", "FIH", "CODE_RECU", "").map((row) => row.transferId);
  assert.deepEqual(ids, ["new", "old", "invalid-date"]);
  assert.equal(rows[0].transferId, "old");
});

test("la recherche Transfer ID et l’ordre de l’onglet Envoyés restent inchangés", () => {
  const rows = [
    transfer("TR-002", "COO", "FIH", "2026-09-20T10:00:00Z"),
    transfer("TR-001", "COO", "LSHI", "2026-09-01T10:00:00Z")
  ];
  assert.deepEqual(
    visibleAgentTransfers(rows, "COO", "SENT", "FIH", "", " tr-00 ").map((row) => row.transferId),
    ["TR-002", "TR-001"]
  );
});

test("chaque agence ne voit que ses propres reçus et les recherches inexistantes restent vides", () => {
  const rows = [
    transfer("COO-1", "FIH", "COO", "2026-09-01T10:00:00Z"),
    transfer("FIH-1", "COO", "FIH", "2026-09-02T10:00:00Z"),
    transfer("LSHI-1", "COO", "LSHI", "2026-09-03T10:00:00Z"),
    transfer("KLZ-1", "COO", "KLZ", "2026-09-04T10:00:00Z")
  ];
  for (const agency of ["COO", "FIH", "LSHI", "KLZ"]) {
    assert.deepEqual(
      visibleAgentTransfers(rows, agency, "RECEIVED", "", "", "").map((row) => row.transferId),
      [`${agency}-1`]
    );
    assert.deepEqual(visibleAgentTransfers(rows, agency, "RECEIVED", "", "", "absent"), []);
  }
});
