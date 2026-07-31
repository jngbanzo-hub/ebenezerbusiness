import assert from "node:assert/strict";
import test from "node:test";

import { createCashRequestId } from "./cash-request-id";

test("génère des UUID v4 cryptographiquement sûrs et uniques", () => {
  const identifiers = Array.from({ length: 1_000 }, createCashRequestId);
  assert.equal(new Set(identifiers).size, identifiers.length);
  for (const identifier of identifiers) {
    assert.match(identifier, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }
});
