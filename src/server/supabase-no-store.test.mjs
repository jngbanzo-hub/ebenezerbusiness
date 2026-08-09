import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cash = readFileSync(new URL("./cash-dashboard-source.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("./stockages-v2.ts", import.meta.url), "utf8");

test("les lectures Caisse et Stockage désactivent le cache Next.js", () => {
  for (const source of [cash, storage]) {
    assert.match(source, /global:\s*\{\s*fetch:\s*noStoreFetch\s*\}/);
    assert.match(source, /cache:\s*"no-store"/);
  }
});
