import assert from "node:assert/strict";
import test from "node:test";

import { buildInterAgencyReference, INTER_AGENCY_RATES, quoteInterAgencyRouting, resolveInterAgencyQuote } from "./inter-agency-routing";

test("les six tarifs inter-agences sont configurés côté serveur", () => {
  assert.deepEqual(INTER_AGENCY_RATES, { "FIH-LSHI": 12, "LSHI-FIH": 13, "FIH-KLZ": 14, "KLZ-FIH": 16, "LSHI-KLZ": 11, "KLZ-LSHI": 13 });
  for (const [route, rate] of Object.entries(INTER_AGENCY_RATES)) {
    const [origin, destination] = route.split("-") as ["FIH" | "LSHI" | "KLZ", "FIH" | "LSHI" | "KLZ"];
    const quote = quoteInterAgencyRouting({ trackingCode: "JLTEST26", origin, destination, weightKg: 2 });
    assert.equal(quote.origin, origin);
    assert.equal(quote.destination, destination);
    assert.equal(quote.rateUsdPerKg, rate);
    assert.equal(quote.amountExpectedUsd, rate * 2);
    assert.equal(quote.trackingCode, "JLTEST26");
    assert.equal(quote.routingReference, `JLTEST26-${origin}-${destination}`);
  }
});

test("la référence conserve le code original", () => {
  assert.equal(buildInterAgencyReference("jl00126", "FIH", "LSHI"), "JL00126-FIH-LSHI");
});

test("le montant attendu est calculé sur le serveur", () => {
  const quote = quoteInterAgencyRouting({ trackingCode: "JL00126", origin: "KLZ", destination: "FIH", weightKg: 2.5 });
  assert.equal(quote.rateUsdPerKg, 16); assert.equal(quote.amountExpectedUsd, 40); assert.equal(quote.currency, "USD");
});

test("JL111126 conserve son code et produit le devis LSHI vers KLZ", () => {
  const quote = quoteInterAgencyRouting({ trackingCode: "JL111126", origin: "LSHI", destination: "KLZ", weightKg: 6 });
  assert.deepEqual(quote, {
    trackingCode: "JL111126",
    routingReference: "JL111126-LSHI-KLZ",
    origin: "LSHI",
    destination: "KLZ",
    weightKg: 6,
    rateUsdPerKg: 11,
    amountExpectedUsd: 66,
    currency: "USD"
  });
});

test("le poids de JL111126 est résolu dans la source LSHI et jamais fourni par le navigateur", async () => {
  const quote = await resolveInterAgencyQuote(
    { trackingCode: "JL111126", origin: "LSHI", destination: "KLZ" },
    async () => [
      { sourceSite: "LSHI", rowNumber: 1, dateRaw: "", codeColisRaw: "Code colis", expediteurRaw: "", poidsRaw: "Poids" },
      { sourceSite: "FIH", rowNumber: 2, dateRaw: "", codeColisRaw: "JL111126", expediteurRaw: "", poidsRaw: 99 },
      { sourceSite: "LSHI", rowNumber: 3, dateRaw: "", codeColisRaw: "jl111126", expediteurRaw: "", poidsRaw: "6 kg", statutRaw: "En Attente" }
    ]
  );
  assert.equal(quote.weightKg, 6);
  assert.equal(quote.amountExpectedUsd, 66);
  assert.equal(quote.routingReference, "JL111126-LSHI-KLZ");
});

test("les espaces et minuscules sont normalisés", () => {
  const quote = quoteInterAgencyRouting({ trackingCode: "  jl110126  ", origin: "LSHI", destination: "FIH", weightKg: 1 });
  assert.equal(quote.trackingCode, "JL110126");
  assert.equal(quote.routingReference, "JL110126-LSHI-FIH");
});

test("un format invalide, une absence et une mauvaise agence ont des codes distincts", async () => {
  assert.throws(() => quoteInterAgencyRouting({ trackingCode: "?", origin: "LSHI", destination: "KLZ", weightKg: 6 }), /INVALID_TRACKING_CODE/);
  const rows = async () => [{ sourceSite: "FIH" as const, rowNumber: 2, dateRaw: "", codeColisRaw: "MR04326", expediteurRaw: "", poidsRaw: 2 }];
  await assert.rejects(resolveInterAgencyQuote({ trackingCode: "MA00326", origin: "LSHI", destination: "KLZ" }, rows), /TRACKING_CODE_NOT_FOUND/);
  await assert.rejects(resolveInterAgencyQuote({ trackingCode: "MR04326", origin: "LSHI", destination: "KLZ" }, rows), /SOURCE_AGENCY_MISMATCH/);
});

test("une véritable panne de source reste une indisponibilité technique", async () => {
  await assert.rejects(resolveInterAgencyQuote({ trackingCode: "JL111126", origin: "LSHI", destination: "KLZ" }, async () => { throw new Error("network"); }), /AGENT_SERVICE_UNAVAILABLE/);
});

test("les statuts source admissibles sont explicites et LIVRÉ est refusé", async () => {
  const row = (statutRaw: string) => async () => [{ sourceSite: "LSHI" as const, rowNumber: 2, dateRaw: "", codeColisRaw: "JL111126", expediteurRaw: "", poidsRaw: 6, statutRaw }];
  for (const status of ["En Attente", "ENREGISTRÉ", "En Vol", "En Transit", "Arrivé"]) {
    const quote = await resolveInterAgencyQuote({ trackingCode: "JL111126", origin: "LSHI", destination: "KLZ" }, row(status));
    assert.equal(quote.amountExpectedUsd, 66);
  }
  await assert.rejects(resolveInterAgencyQuote({ trackingCode: "JL111126", origin: "LSHI", destination: "KLZ" }, row("LIVRÉ")), /PARCEL_ALREADY_DELIVERED/);
  for (const status of ["ANNULÉ", "SORTI", "STATUT MYSTERE"]) {
    await assert.rejects(resolveInterAgencyQuote({ trackingCode: "JL111126", origin: "LSHI", destination: "KLZ" }, row(status)), /SOURCE_PARCEL_NOT_ELIGIBLE/);
  }
});

test("une même agence ou un poids invalide sont refusés", () => {
  assert.throws(() => quoteInterAgencyRouting({ trackingCode: "JL00126", origin: "FIH", destination: "FIH", weightKg: 2 }), /INVALID_INTER_AGENCY_ROUTE/);
  assert.throws(() => quoteInterAgencyRouting({ trackingCode: "JL00126", origin: "FIH", destination: "KLZ", weightKg: 0 }), /PARCEL_WEIGHT_UNAVAILABLE/);
});
