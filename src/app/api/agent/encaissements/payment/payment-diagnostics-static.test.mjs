import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const payment = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const delivery = readFileSync(new URL("../../stockages/delivery/route.ts", import.meta.url), "utf8");

test("les refus paiement et remise retournent une corrélation sans changer leurs messages", () => {
  assert.match(payment, /operation: "PAYMENT"/);
  assert.match(delivery, /operation: "DELIVERY"/);
  assert.match(payment, /diagnosticId: diagnostic\.diagnosticId/);
  assert.match(delivery, /diagnosticId: diagnostic\.diagnosticId/);
  assert.match(payment, /"Paiement refusé\."/);
  assert.match(delivery, /"Confirmation de livraison refusée\."/);
  assert.doesNotMatch(payment + delivery, /accessToken|serviceRole|apiKey|JWT/);
});
