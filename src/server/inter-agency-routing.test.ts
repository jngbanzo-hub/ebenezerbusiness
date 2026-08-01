import assert from "node:assert/strict";
import test from "node:test";

import { buildInterAgencyReference, INTER_AGENCY_RATES, quoteInterAgencyRouting } from "./inter-agency-routing";

test("les six tarifs inter-agences sont configurés côté serveur", () => {
  assert.deepEqual(INTER_AGENCY_RATES, { "FIH-LSHI": 12, "LSHI-FIH": 13, "FIH-KLZ": 14, "KLZ-FIH": 16, "LSHI-KLZ": 11, "KLZ-LSHI": 13 });
});

test("la référence conserve le code original", () => {
  assert.equal(buildInterAgencyReference("jl00126", "FIH", "LSHI"), "JL00126-FIH-LSHI");
});

test("le montant attendu est calculé sur le serveur", () => {
  const quote = quoteInterAgencyRouting({ trackingCode: "JL00126", origin: "KLZ", destination: "FIH", weightKg: 2.5 });
  assert.equal(quote.rateUsdPerKg, 16); assert.equal(quote.amountExpectedUsd, 40); assert.equal(quote.currency, "USD");
});

test("une même agence ou un poids invalide sont refusés", () => {
  assert.throws(() => quoteInterAgencyRouting({ trackingCode: "JL00126", origin: "FIH", destination: "FIH", weightKg: 2 }), /INVALID_INTER_AGENCY_ROUTE/);
  assert.throws(() => quoteInterAgencyRouting({ trackingCode: "JL00126", origin: "FIH", destination: "KLZ", weightKg: 0 }), /PARCEL_WEIGHT_UNAVAILABLE/);
});
