import assert from "node:assert/strict";
import test from "node:test";

import { assertShipmentStatusWriteConfirmed } from "./shipment-status-write-confirmation.ts";

const valid = { updatedRange: "EXPÉDITION!K115", updatedCells: 1, updatedData: { range: "EXPÉDITION!K115", values: [["En Vol"]] } };

test("confirme la valeur réellement retournée par Google", () => {
  assert.doesNotThrow(() => assertShipmentStatusWriteConfirmed(true, valid, 115, "En Vol"));
});

test("refuse une valeur Google différente", () => {
  assert.throws(() => assertShipmentStatusWriteConfirmed(true, { ...valid, updatedData: { ...valid.updatedData, values: [["Arrivé"]] } }, 115, "En Vol"), /ne confirme pas/);
});

test("refuse une écriture Google en échec", () => {
  assert.throws(() => assertShipmentStatusWriteConfirmed(false, { error: { message: "Écriture refusée" } }, 115, "En Vol"), /Écriture refusée/);
});
