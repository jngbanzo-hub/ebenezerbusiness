import assert from "node:assert/strict";
import test from "node:test";

import { buildStockagesRpcDiagnostic } from "./stockages-rpc-diagnostics";

test("journalise uniquement les champs RPC autorisés avec une corrélation", () => {
  const diagnostic = buildStockagesRpcDiagnostic(
    "diag-001",
    { code: "23505", message: "duplicate key", details: "Key already exists", hint: "Check constraint", secret: "never" } as never,
    { rpc: "record_detailed_arrival", agency: "FIH", commandType: "MANUAL_ARRIVAL" }
  );
  assert.deepEqual(diagnostic, {
    diagnosticId: "diag-001",
    rpc: "record_detailed_arrival",
    agency: "FIH",
    commandType: "MANUAL_ARRIVAL",
    code: "23505",
    message: "duplicate key",
    details: "Key already exists",
    hint: "Check constraint"
  });
  assert.equal("secret" in diagnostic, false);
  assert.equal("jwt" in diagnostic, false);
});
