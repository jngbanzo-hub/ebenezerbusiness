import assert from "node:assert/strict";
import test from "node:test";

import { ContractValidationError } from "./errors";
import { validStockEventInput } from "./fixtures";
import { createStockEvent, type StockEventInput } from "./stock-event";

function valid(overrides: Partial<StockEventInput>) {
  return createStockEvent(validStockEventInput(overrides));
}
function rejected(overrides: Partial<StockEventInput>) {
  assert.throws(
    () => valid(overrides),
    ContractValidationError,
  );
}

test("11. ENTREE_COO valide", () => {
  assert.equal(valid({}).trackingCode, "MR-001");
});
test("12. SORTIE_COO valide", () => {
  assert.equal(
    valid({
      eventType: "SORTIE_COO",
      agency: "COO",
      fromAgency: "COO",
      toAgency: "FIH",
    }).eventType,
    "SORTIE_COO",
  );
});
test("13. ENTREE_DESTINATION valide", () => {
  assert.equal(
    valid({
      eventType: "ENTREE_DESTINATION",
      agency: "FIH",
      fromAgency: "COO",
      toAgency: "FIH",
    }).agency,
    "FIH",
  );
});
test("14. SORTIE_REACHEMINEMENT valide", () => {
  assert.equal(
    valid({
      eventType: "SORTIE_REACHEMINEMENT",
      agency: "FIH",
      fromAgency: "FIH",
      toAgency: "KLZ",
      sourceType: "REROUTING",
    }).toAgency,
    "KLZ",
  );
});
test("15. ENTREE_REACHEMINEMENT valide", () => {
  assert.equal(
    valid({
      eventType: "ENTREE_REACHEMINEMENT",
      agency: "KLZ",
      fromAgency: "FIH",
      toAgency: "KLZ",
      sourceType: "REROUTING",
    }).agency,
    "KLZ",
  );
});
test("16. SORTIE_LIVRAISON valide", () => {
  assert.equal(
    valid({
      eventType: "SORTIE_LIVRAISON",
      agency: "FIH",
      fromAgency: "FIH",
      toAgency: null,
      sourceType: "DELIVERY_CONFIRMATION",
    }).eventType,
    "SORTIE_LIVRAISON",
  );
});
test("17. AJUSTEMENT_ADMIN sans motif refusé", () => {
  rejected({
    eventType: "AJUSTEMENT_ADMIN",
    sourceType: "ADMIN",
    reason: null,
  });
});
test("18. STOCK_REVERSAL sans événement compensé refusé", () => {
  rejected({
    eventType: "STOCK_REVERSAL",
    sourceType: "ADMIN",
    reason: "Correction documentée",
    compensatesEventId: null,
  });
});
test("19. fromAgency égale toAgency refusé pour réacheminement", () => {
  rejected({
    eventType: "SORTIE_REACHEMINEMENT",
    agency: "FIH",
    fromAgency: "FIH",
    toAgency: "FIH",
    sourceType: "REROUTING",
  });
});
test("20. versions avant et après incohérentes refusées", () => {
  rejected({ versionBefore: 2, versionAfter: 4 });
});
test("20b. compensation Admin valide et immutable", () => {
  const event = valid({
    eventType: "STOCK_REVERSAL",
    sourceType: "ADMIN",
    reason: "Correction documentée",
    compensatesEventId: "event-000",
  });
  assert.equal(event.compensatesEventId, "event-000");
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.metadata), true);
});
test("20c. SORTIE_DESTINATION reste legacy avec confirmation physique", () => {
  assert.equal(
    valid({
      eventType: "SORTIE_DESTINATION",
      agency: "FIH",
      fromAgency: "FIH",
      toAgency: null,
      sourceType: "DELIVERY_CONFIRMATION",
    }).eventType,
    "SORTIE_DESTINATION",
  );
});

const validMismatch = {
  eventType: "ARRIVAL_MISMATCH_CONFIRMED" as const,
  agency: "LSHI",
  fromAgency: "COO",
  toAgency: "LSHI",
  sourceType: "AGENT" as const,
  reason: "Arrivée physique constatée à LSHI",
  recordedBy: "agent-lshi-001",
  arrivalMismatch: {
    expectedAgency: "FIH",
    actualAgency: "LSHI",
    confirmedByAgentId: "agent-lshi-001",
    confirmedByAgentAgency: "LSHI",
    physicalReceiptConfirmed: true,
    evidenceReference: "observation-lshi-001",
  },
};

test("ARRIVAL_MISMATCH_CONFIRMED conserve le constat physique auditable", () => {
  const mismatch = valid(validMismatch);
  assert.equal(mismatch.arrivalMismatch?.expectedAgency, "FIH");
  assert.equal(mismatch.arrivalMismatch?.actualAgency, "LSHI");
  assert.equal(mismatch.sourceType, "AGENT");
});

test("ARRIVAL_MISMATCH_CONFIRMED accepte une confirmation Admin explicite", () => {
  const mismatch = valid({
    ...validMismatch,
    sourceType: "ADMIN",
    recordedBy: "admin-001",
    arrivalMismatch: {
      ...validMismatch.arrivalMismatch,
      confirmedByAgentId: "admin-001",
    },
  });
  assert.equal(mismatch.sourceType, "ADMIN");
  assert.equal(mismatch.recordedBy, "admin-001");
});

test("ARRIVAL_MISMATCH_CONFIRMED refuse une source non autorisée", () => {
  rejected({ ...validMismatch, sourceType: "SYSTEM" });
});

test("ARRIVAL_MISMATCH_CONFIRMED refuse agence réelle égale à attendue", () => {
  rejected({
    ...validMismatch,
    agency: "FIH",
    toAgency: "FIH",
    arrivalMismatch: {
      ...validMismatch.arrivalMismatch,
      actualAgency: "FIH",
      confirmedByAgentAgency: "FIH",
    },
  });
});

test("ARRIVAL_MISMATCH_CONFIRMED refuse agence du confirmateur différente", () => {
  rejected({
    ...validMismatch,
    arrivalMismatch: {
      ...validMismatch.arrivalMismatch,
      confirmedByAgentAgency: "KLZ",
    },
  });
});

test("ARRIVAL_MISMATCH_CONFIRMED refuse preuve ou présence physique absente", () => {
  rejected({
    ...validMismatch,
    arrivalMismatch: {
      ...validMismatch.arrivalMismatch,
      evidenceReference: "",
    },
  });
  rejected({
    ...validMismatch,
    arrivalMismatch: {
      ...validMismatch.arrivalMismatch,
      physicalReceiptConfirmed: false,
    },
  });
});
