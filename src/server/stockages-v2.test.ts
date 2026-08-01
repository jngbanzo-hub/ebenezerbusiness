import assert from "node:assert/strict";
import test from "node:test";

import { businessDatePortoNovo, requireStorageAgency, StockagesV2Error } from "./stockages-v2";

test("la date métier est calculée dans Africa/Porto-Novo", () => {
  assert.equal(businessDatePortoNovo(new Date("2026-08-01T23:30:00.000Z")), "2026-08-02");
});

test("FIH LSHI et KLZ sont les seules agences Stockages", () => {
  assert.equal(requireStorageAgency(" fih "), "FIH");
  assert.equal(requireStorageAgency("LSHI"), "LSHI");
  assert.equal(requireStorageAgency("klz"), "KLZ");
  assert.throws(() => requireStorageAgency("COO"), (error) => error instanceof StockagesV2Error && error.code === "STORAGE_AGENCY_NOT_SUPPORTED");
});
