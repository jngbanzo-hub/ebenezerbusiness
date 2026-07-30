import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanonicalAgency,
  isCanonicalAgency,
  normalizeCanonicalAgency,
} from "./agencies";
import { ContractValidationError } from "./errors";

test("normalise les quatre agences canoniques", () => {
  assert.equal(normalizeCanonicalAgency("COO"), "COO");
  assert.equal(normalizeCanonicalAgency("coo"), "COO");
  assert.equal(normalizeCanonicalAgency(" COTONOU "), "COO");
  assert.equal(normalizeCanonicalAgency("FIH"), "FIH");
  assert.equal(normalizeCanonicalAgency("lshi"), "LSHI");
  assert.equal(normalizeCanonicalAgency("klz"), "KLZ");
});

test("refuse une agence vide, inconnue ou non textuelle", () => {
  for (const value of ["", "COT", "AUTRE", null, 12, {}]) {
    assert.throws(
      () => normalizeCanonicalAgency(value),
      (error) =>
        error instanceof ContractValidationError &&
        error.code === "INVALID_AGENCY",
    );
  }
});

test("expose un garde et une assertion strictement canoniques", () => {
  assert.equal(isCanonicalAgency("COO"), true);
  assert.equal(isCanonicalAgency("coo"), false);
  assert.doesNotThrow(() => assertCanonicalAgency("FIH"));
  assert.throws(
    () => assertCanonicalAgency("COTONOU"),
    (error) =>
      error instanceof ContractValidationError &&
      error.code === "INVALID_AGENCY",
  );
});
