import assert from "node:assert/strict";
import test from "node:test";

import { readExhaustivePages } from "./exhaustive-pagination";

for (const size of [0, 1, 999, 1000, 1001, 1082, 2505]) {
  test(`lecture exhaustive stable de ${size} lignes`, async () => {
    const source = Array.from({ length: size }, (_, index) => ({ id: String(index + 1) }));
    const result = await readExhaustivePages(
      async (from, to) => source.slice(from, to + 1),
      { identity: (row) => row.id }
    );
    assert.deepEqual(result.rows, source);
    assert.equal(result.metrics.rowCount, size);
    assert.equal(result.metrics.exceededSinglePage, size > 1000);
  });
}

test("un chevauchement de pages fait échouer la lecture", async () => {
  await assert.rejects(
    readExhaustivePages(async (from) => from === 0
      ? Array.from({ length: 1000 }, (_, index) => ({ id: String(index) }))
      : [{ id: "999" }], { identity: (row) => row.id }),
    /PAGINATION_DUPLICATE_IDENTITY/
  );
});

test("la pagination forwarding conserve toutes les lignes sur plusieurs pages", async () => {
  const source = Array.from({ length: 2505 }, (_, index) => ({ forwarding_id: `forwarding-${index + 1}` }));
  const result = await readExhaustivePages(
    async (from, to) => source.slice(from, to + 1),
    { identity: (row) => String(row.forwarding_id ?? "") }
  );
  assert.equal(result.rows.length, 2505);
  assert.equal(new Set(result.rows.map((row) => row.forwarding_id)).size, 2505);
  assert.equal(result.metrics.pageCount, 3);
});

test("la pagination forwarding refuse une identité absente", async () => {
  await assert.rejects(
    readExhaustivePages(async () => [{ forwarding_id: null }], { identity: (row) => String(row.forwarding_id ?? "") }),
    /PAGINATION_DUPLICATE_IDENTITY/
  );
});

test("la pagination forwarding détecte un doublon réel entre pages", async () => {
  await assert.rejects(
    readExhaustivePages(async (from) => from === 0
      ? Array.from({ length: 1000 }, (_, index) => ({ forwarding_id: `forwarding-${index}` }))
      : [{ forwarding_id: "forwarding-999" }], { identity: (row) => String(row.forwarding_id ?? "") }),
    /PAGINATION_DUPLICATE_IDENTITY/
  );
});
