import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { logOperationRefusal } from "./operation-refusal-diagnostics.ts";

test("journalise un refus corrélé sans recopier de données sensibles", () => {
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...values: unknown[]) => { logs.push(values); };
  try {
    const diagnostic = logOperationRefusal({
      diagnosticId: "diag-001",
      requestId: "request-001",
      operation: "PAYMENT",
      agency: "LSHI",
      stage: "EDGE_FUNCTION",
      applicationCode: "PAYMENT_ORCHESTRATION_INCOMPLETE",
      httpStatus: 503,
      externalHttpStatus: 503,
      startedAt: performance.now()
    });
    assert.equal(diagnostic.diagnosticId, "diag-001");
    assert.equal(diagnostic.requestId, "request-001");
    assert.equal(diagnostic.operation, "PAYMENT");
    assert.equal(diagnostic.stage, "EDGE_FUNCTION");
    assert.equal(logs.length, 1);
    const serialized = JSON.stringify(logs);
    assert.doesNotMatch(serialized, /jwt|token|secret|authorization|telephone/i);
  } finally {
    console.error = original;
  }
});

test("génère une référence pour un refus sans identifiant RPC", () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    const diagnostic = logOperationRefusal({
      operation: "DELIVERY",
      agency: "FIH",
      stage: "resolvePaidPhysicalParcel",
      applicationCode: "PAYMENT_NOT_COMPLETE",
      httpStatus: 409,
      startedAt: performance.now()
    });
    assert.match(diagnostic.diagnosticId, /^[0-9a-f-]{36}$/i);
    assert.equal(diagnostic.requestId, null);
  } finally {
    console.error = original;
  }
});
