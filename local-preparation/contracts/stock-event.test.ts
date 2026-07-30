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
