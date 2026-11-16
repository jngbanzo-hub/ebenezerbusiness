import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const typesSource = await readFile(new URL("../src/features/transferts/types.ts", import.meta.url), "utf8");
const typesCode = ts.transpileModule(typesSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const typesUrl = `data:text/javascript;base64,${Buffer.from(typesCode).toString("base64")}`;
const source = (await readFile(new URL("../src/features/transferts/agent-sent-transfers.ts", import.meta.url), "utf8"))
  .replace('from "@/features/transferts/types";', `from "${typesUrl}";`);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { sentDestinationsForAgency, visibleSentTransfers } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

const transfer = (id, from, to, status = "ENVOYE") => ({
  transferId: id,
  createdAt: "2026-11-01T00:00:00Z",
  agencyFrom: from,
  agencyTo: to,
  status
});

test("les destinations envoyées suivent les six circuits autorisés", () => {
  assert.deepEqual(sentDestinationsForAgency("COO"), ["FIH", "LSHI", "KLZ"]);
  for (const agency of ["FIH", "LSHI", "KLZ"]) {
    assert.deepEqual(sentDestinationsForAgency(agency), ["COO"]);
  }
});

test("COO voit séparément FIH, LSHI et KLZ", () => {
  const rows = [
    transfer("coo-fih-new", "COO", "FIH"),
    transfer("coo-lshi", "COO", "LSHI"),
    transfer("fih-coo", "FIH", "COO"),
    transfer("coo-fih-old", "COO", "FIH"),
    transfer("coo-klz", "COO", "KLZ")
  ];
  assert.deepEqual(visibleSentTransfers(rows, "COO", "FIH", "", "").map((row) => row.transferId), ["coo-fih-new", "coo-fih-old"]);
  assert.deepEqual(visibleSentTransfers(rows, "COO", "LSHI", "", "").map((row) => row.transferId), ["coo-lshi"]);
  assert.deepEqual(visibleSentTransfers(rows, "COO", "KLZ", "", "").map((row) => row.transferId), ["coo-klz"]);
  assert.equal(rows[0].transferId, "coo-fih-new");
});

test("FIH, LSHI et KLZ ne voient que leurs envois vers COO", () => {
  const rows = [
    transfer("fih", "FIH", "COO"),
    transfer("lshi", "LSHI", "COO"),
    transfer("klz", "KLZ", "COO"),
    transfer("coo", "COO", "FIH")
  ];
  for (const agency of ["FIH", "LSHI", "KLZ"]) {
    assert.deepEqual(visibleSentTransfers(rows, agency, "COO", "", "").map((row) => row.transferId), [agency.toLowerCase()]);
    assert.deepEqual(visibleSentTransfers(rows, agency, "LSHI", "", ""), []);
  }
});

test("destination absente ou non autorisée et agence expéditrice différente sont refusées", () => {
  const rows = [transfer("valid", "COO", "FIH"), transfer("foreign", "LSHI", "FIH")];
  assert.deepEqual(visibleSentTransfers(rows, "COO", "", "", ""), []);
  assert.deepEqual(visibleSentTransfers(rows, "FIH", "KLZ", "", ""), []);
  assert.deepEqual(visibleSentTransfers(rows, "COO", "FIH", "", "").map((row) => row.transferId), ["valid"]);
  assert.deepEqual(visibleSentTransfers([], "COO", "FIH", "", ""), []);
});

test("statut et Transfer ID sont appliqués à la seule destination choisie", () => {
  const rows = [
    transfer("TR-001", "COO", "FIH", "ENVOYE"),
    transfer("TR-002", "COO", "FIH", "CONFIRME"),
    transfer("TR-003", "COO", "LSHI", "CONFIRME")
  ];
  assert.deepEqual(visibleSentTransfers(rows, "COO", "FIH", "CONFIRME", " tr-00 ").map((row) => row.transferId), ["TR-002"]);
  assert.deepEqual(visibleSentTransfers(rows, "COO", "FIH", "ANNULE", ""), []);
});

test("les six circuits trient après filtrage, y compris lors d’une actualisation", () => {
  for (const origin of ["COO", "FIH", "LSHI", "KLZ"]) {
    for (const destination of sentDestinationsForAgency(origin)) {
      const row = (id, createdAt, status = "ENVOYE") => ({
        ...transfer(id, origin, destination, status), createdAt
      });
      const oldest = row("TR-Z", "2026-11-15T23:58:00Z");
      const tiedB = row("TR-B", "2026-11-16T01:00:00+01:00");
      const tiedA = row("TR-A", "2026-11-16T00:00:00Z");
      const latest = row("TR-M", "2026-11-16T00:00:01Z");
      const undated = row("TR-0", "");
      const rows = [oldest, tiedB, undated, row("OTHER", latest.createdAt),
        tiedA, row("TR-C", latest.createdAt, "CONFIRME")];
      const select = (input) => visibleSentTransfers(input, origin, destination, "ENVOYE", " tr-");
      assert.deepEqual(select(rows), [tiedA, tiedB, oldest, undated]);
      const refreshed = [...rows].reverse().concat(latest);
      assert.deepEqual(select(refreshed), [latest, tiedA, tiedB, oldest, undated]);
      assert.equal(refreshed.at(-1), latest);
      assert.equal(select(refreshed)[0], latest);
    }
  }
});
