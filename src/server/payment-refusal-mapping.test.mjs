import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/agent/encaissements/payment/route.ts", import.meta.url), "utf8");
const parcel = readFileSync(new URL("./destination-payment-parcel.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../features/agent/functions.ts", import.meta.url), "utf8");

test("mappe les refus Auth et Stockage sans retry financier", () => {
  for (const source of [route, parcel, client]) {
    assert.match(source, /PARCEL_NOT_IN_STOCK/);
    assert.match(source, /SESSION_EXPIRED/);
    assert.match(source, /SESSION_EXPIRED_REFRESHED/);
    assert.doesNotMatch(source, /retryPayment|retryFinancial|retryWrite/i);
  }
  assert.match(parcel, /\? 409/);
  assert.match(parcel, /\? 401/);
  assert.match(route, /Ce colis n’est pas présent dans le Stockage de votre agence\./);
});
