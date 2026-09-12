import assert from "node:assert/strict";
import test from "node:test";

import { readAllCashLedgerPages } from "./cash-ledger-pagination";

for (const size of [999, 1000, 1001, 1082, 2505]) {
  test(`pagination exhaustive et sans doublon pour ${size} événements`, async () => {
    const source = Array.from({ length: size }, (_, index) => ({ id: index + 1, amount: 1 }));
    const calls: Array<[number, number]> = [];
    const result = await readAllCashLedgerPages(async (from, to) => {
      calls.push([from, to]);
      return source.slice(from, to + 1);
    });

    assert.equal(result.length, size);
    assert.equal(new Set(result.map((row) => row.id)).size, size);
    assert.equal(result.reduce((sum, row) => sum + row.amount, 0), size);
    assert.deepEqual(calls[0], [0, 999]);
    if (size > 1000) assert.deepEqual(calls[1], [1000, 1999]);
  });
}
