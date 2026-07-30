import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_METADATA_DEPTH,
  MAX_METADATA_ENTRIES,
  MAX_METADATA_KEY_LENGTH,
  MAX_METADATA_STRING_LENGTH,
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

function assertInvalidMetadata(metadata: unknown): void {
  assert.throws(
    () => validateMetadata(metadata),
    (error) =>
      error instanceof ContractValidationError &&
      error.code === "INVALID_METADATA",
  );
}

test("refuse les types non JSON-safe et les clés explicitement sensibles", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  for (const metadata of [
    { action: () => true },
    { value: undefined },
    { date: new Date() },
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    cyclic,
    { apiKey: "not-allowed" },
    { "ACCESS TOKEN": "not-allowed" },
    { private_key: "not-allowed" },
    { password: "not-allowed" },
    { hmac_secret: "not-allowed" },
    { "service-role_key": "not-allowed" },
    Object.create({ inherited: true }),
  ]) {
    assertInvalidMetadata(metadata);
  }
});

test("accepte la profondeur maximale et refuse son dépassement", () => {
  let accepted: Record<string, unknown> = {};
  for (let depth = 0; depth < MAX_METADATA_DEPTH; depth += 1) {
    accepted = { nested: accepted };
  }
  assert.deepEqual(validateMetadata(accepted), accepted);

  assertInvalidMetadata({ nested: accepted });
});

test("applique la limite globale de propriétés et éléments", () => {
  const accepted = {
    items: Array.from({ length: MAX_METADATA_ENTRIES - 1 }, () => null),
  };
  assert.deepEqual(validateMetadata(accepted), accepted);

  assertInvalidMetadata({
    items: Array.from({ length: MAX_METADATA_ENTRIES }, () => null),
  });
});

test("applique les limites de longueur des chaînes et des clés", () => {
  const acceptedKey = "k".repeat(MAX_METADATA_KEY_LENGTH);
  const acceptedValue = "v".repeat(MAX_METADATA_STRING_LENGTH);
  assert.deepEqual(validateMetadata({ [acceptedKey]: acceptedValue }), {
    [acceptedKey]: acceptedValue,
  });

  assertInvalidMetadata({
    value: "v".repeat(MAX_METADATA_STRING_LENGTH + 1),
  });
  assertInvalidMetadata({
    ["k".repeat(MAX_METADATA_KEY_LENGTH + 1)]: "value",
  });
});

test("valide la structure et les clés sans analyser le sens du texte libre", () => {
  const metadata = {
    secretariat: "Service administratif",
    note: "Le mot token apparaît dans ce texte métier ordinaire.",
    nested: {
      items: ["valeur", { active: true, count: 2 }],
    },
  };

  assert.deepEqual(validateMetadata(metadata), metadata);
  assertInvalidMetadata({ token: "valeur interdite sous une clé sensible" });
});
