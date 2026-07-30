import assert from "node:assert/strict";
import test from "node:test";

import {
  validateBusinessDate,
  validateMetadata,
  validateOccurredAt,
  validateVersion,
} from "./common";
import { ContractValidationError } from "./errors";

test("valide les dates, horodatages et versions contractuels", () => {
  assert.equal(validateBusinessDate("2026-07-30"), "2026-07-30");
  assert.equal(
    validateOccurredAt("2026-07-30T10:15:30.000Z"),
    "2026-07-30T10:15:30.000Z",
  );
  assert.equal(validateVersion(1), 1);

  for (const action of [
    () => validateBusinessDate("2026-02-30"),
    () => validateOccurredAt("30/07/2026"),
    () => validateVersion(0),
  ]) {
    assert.throws(action, ContractValidationError);
  }
});

test("refuse fonctions, undefined, Date, cycles et clés sensibles", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  for (const metadata of [
    { action: () => true },
    { value: undefined },
    { date: new Date() },
    cyclic,
    { apiKey: "not-allowed" },
    { private_key: "not-allowed" },
    { password: "not-allowed" },
  ]) {
    assert.throws(
      () => validateMetadata(metadata),
      (error) =>
        error instanceof ContractValidationError &&
        error.code === "INVALID_METADATA",
    );
  }
});
