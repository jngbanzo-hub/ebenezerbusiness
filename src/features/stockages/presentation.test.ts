import assert from "node:assert/strict";
import test from "node:test";

import { formatStockageAnomalies, formatStockageWeight } from "./presentation";

test("les poids utilisent un format français lisible sans zéros finaux", () => {
  assert.equal(formatStockageWeight(4), "4 kg");
  assert.equal(formatStockageWeight(5.5), "5,5 kg");
  assert.equal(formatStockageWeight(4.25), "4,25 kg");
  assert.equal(formatStockageWeight(0.75), "0,75 kg");
  assert.equal(formatStockageWeight(1.125), "1,125 kg");
  assert.equal(formatStockageWeight(0), "0 kg");
  assert.doesNotMatch(formatStockageWeight(4), /\.000|kgs/);
});

test("les anomalies Agent sont des libellés métier et non des codes techniques", () => {
  assert.deepEqual(formatStockageAnomalies(["EXPECTED_AMOUNT_MISSING", "SOURCE_STATUS_INELIGIBLE", "PAYMENT_OVERPAID"]), [
    "Montant attendu indisponible",
    "Statut du colis non admissible pour l’encaissement",
    "Montant payé supérieur au montant attendu"
  ]);
  assert.deepEqual(formatStockageAnomalies(["UNKNOWN_TECHNICAL_CODE"]), ["Vérification métier nécessaire"]);
});
