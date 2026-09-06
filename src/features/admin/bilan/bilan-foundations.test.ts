import assert from "node:assert/strict";
import test from "node:test";

import { allocateUsdByWeight } from "./allocations";
import { BILAN_ANOMALY_CODES } from "./data-quality";
import {
  allocateGroupFlatCost,
  allocateTransitTotalByCohort,
  createUnallocatedDirectCost,
  declarantGroupCostUsd,
  transitFihLshiTotalUsd
} from "./direct-costs";
import { resolveCohort } from "./cohort-registry";
import { createParcelIdentity, parcelIdentityKey } from "./parcel-identity";
import { deduplicateShipmentParcels, parseShipmentGroups } from "./shipment-groups";
import type { ShipmentContext } from "./bilan-contracts";

const context = (overrides: Partial<ShipmentContext> = {}): ShipmentContext => ({
  company: "ETHIOPIAN",
  destination: "LSHI",
  shipmentDate: "2026-08-31",
  sourceSheet: "EXPÉDITION",
  sourceRow: 42,
  ...overrides
});

test("résout explicitement JL, AT et SE sans utiliser une date", () => {
  assert.equal(resolvedId("JL00126"), "2026-07");
  assert.equal(resolvedId("AT00126"), "2026-08");
  assert.equal(resolvedId("SE00126"), "2026-09");
});

test("un préfixe inconnu reste COHORTE_NON_RESOLUE", () => {
  const cohort = resolveCohort("OC00126");
  assert.equal(cohort.state, "UNRESOLVED");
  if (cohort.state === "UNRESOLVED") assert.equal(cohort.code, "COHORTE_NON_RESOLUE");
});

test("préserve les suffixes B C D et KLZ comme identités distinctes", () => {
  const codes = ["AT12326", "AT12326B", "AT12326C", "AT12326D", "AT12326KLZ"];
  const identities = codes.map((rawCode) => createParcelIdentity({ rawCode, structuredAgency: "LSHI", sourceSheet: "LSHI", sourceRow: 10 }));
  assert.deepEqual(identities.map(({ rawCode }) => rawCode), codes);
  assert.equal(new Set(identities.map(parcelIdentityKey)).size, 5);
  assert.equal(identities.at(-1)?.agency, "KLZ");
});

test("un même code dans deux agences produit deux identités", () => {
  const first = createParcelIdentity({ rawCode: "AT12326", structuredAgency: "FIH", sourceSheet: "FIH", sourceRow: 1 });
  const second = createParcelIdentity({ rawCode: "AT12326", structuredAgency: "LSHI", sourceSheet: "LSHI", sourceRow: 1 });
  assert.notEqual(parcelIdentityKey(first), parcelIdentityKey(second));
});

test("segmente plusieurs blocs GROUPAGE sans mélanger leurs colis", () => {
  const parsed = parseShipmentGroups([
    "GROUPAGE 10",
    "JL10026 : 20kgs",
    "AT10026 : 80kgs",
    "GROUPAGE 11 AT10026B : 5kgs SE10026 : 3kgs"
  ].join("\n"), context());
  assert.equal(parsed.groups.length, 2);
  assert.deepEqual(parsed.groups[0].parcels.map(({ identity }) => identity.rawCode), ["JL10026", "AT10026"]);
  assert.deepEqual(parsed.groups[1].parcels.map(({ identity }) => identity.rawCode), ["AT10026B", "SE10026"]);
});

test("un groupage multi-cohorte conserve cohortes et poids individuels", () => {
  const group = parseShipmentGroups("GROUPAGE 9\nJL10026 : 20kgs\nAT10026 : 80kgs", context()).groups[0];
  assert.deepEqual(group.parcels.map(({ identity, weightKg }) => [identity.cohort.state === "RESOLVED" ? identity.cohort.definition.id : null, weightKg]), [
    ["2026-07", 20], ["2026-08", 80]
  ]);
});

test("le même code dans deux groupages n’est pas dédupliqué globalement", () => {
  const groups = parseShipmentGroups("GROUPAGE 1\nAT10026 : 5kgs\nGROUPAGE 2\nAT10026 : 5kgs", context()).groups;
  assert.equal(groups.length, 2);
  assert.notEqual(groups[0].identityKey, groups[1].identityKey);
  assert.equal(deduplicateShipmentParcels(groups[0]).parcels.length + deduplicateShipmentParcels(groups[1]).parcels.length, 2);
});

test("une occurrence répétée identique est comptée une fois et signalée", () => {
  const group = parseShipmentGroups("GROUPAGE 1\nAT10026 : 5kgs\nAT10026 : 5kgs", context()).groups[0];
  const result = deduplicateShipmentParcels(group);
  assert.equal(result.parcels.length, 1);
  assert.equal(result.anomalies[0].code, "IDENTITE_CONFLICTUELLE");
});

test("un poids divergent exclut les deux versions silencieusement impossibles", () => {
  const group = parseShipmentGroups("GROUPAGE 1\nAT10026 : 5kgs\nAT10026 : 7kgs", context()).groups[0];
  const result = deduplicateShipmentParcels(group);
  assert.equal(result.parcels.length, 0);
  assert.equal(result.anomalies[0].code, "POIDS_DIVERGENT");
});

test("signale un texte sans groupage segmentable", () => {
  const parsed = parseShipmentGroups("AT10026 : 5kgs", context());
  assert.equal(parsed.groups.length, 0);
  assert.equal(parsed.anomalies[0].code, "GROUPAGE_NON_SEGMENTABLE");
});

test("ventile 58 USD proportionnellement et conserve exactement le total", () => {
  const allocations = allocateGroupFlatCost(58, [{ key: "JL", weightKg: 20 }, { key: "AT", weightKg: 80 }]);
  assert.deepEqual(allocations.map(({ amountCents }) => amountCents), [1160, 4640]);
  assert.equal(sumCents(allocations), 5800);
});

test("ventile 40 USD au centime avec résiduel déterministe", () => {
  const allocations = allocateGroupFlatCost(40, [{ key: "JL", weightKg: 1 }, { key: "AT", weightKg: 1 }, { key: "SE", weightKg: 1 }]);
  assert.deepEqual(allocations.map(({ amountCents }) => amountCents), [1333, 1333, 1334]);
  assert.equal(sumCents(allocations), 4000);
});

test("applique les régimes Déclarant FIH standard et DHL sans cumul", () => {
  assert.equal(declarantGroupCostUsd("FIH", "ASKY", 100), 40);
  assert.equal(declarantGroupCostUsd("FIH", "DHL", 100), 280);
  assert.equal(declarantGroupCostUsd("LSHI", "DHL", 100), 280);
  assert.equal(declarantGroupCostUsd("LSHI", "ASKY", 100), 58);
});

test("calcule le transit officiel 775 kg à 1,7 USD/kg", () => {
  assert.equal(transitFihLshiTotalUsd({ company: "DHL", destination: "LSHI", officialWeightKg: 775 }), 1317.5);
});

test("refuse le transit hors de la condition métier DHL plus LSHI", () => {
  assert.throws(() => transitFihLshiTotalUsd({ company: "ASKY", destination: "LSHI", officialWeightKg: 10 }), /NOT_APPLICABLE/);
  assert.throws(() => transitFihLshiTotalUsd({ company: "DHL", destination: "FIH", officialWeightKg: 10 }), /NOT_APPLICABLE/);
});

test("ventile le total officiel de transit sans le recalculer depuis les poids individuels", () => {
  const total = transitFihLshiTotalUsd({ company: "DHL", destination: "LSHI", officialWeightKg: 100 });
  const allocations = allocateTransitTotalByCohort(total, [{ key: "JL", weightKg: 20 }, { key: "AT", weightKg: 80 }]);
  assert.deepEqual(allocations.map(({ amountCents }) => amountCents), [3400, 13600]);
  assert.equal(sumCents(allocations), 17000);
});

test("le moteur d’allocation refuse poids invalides et clés dupliquées", () => {
  assert.throws(() => allocateUsdByWeight(58, [{ key: "AT", weightKg: 0 }]), /INVALID_ALLOCATION_WEIGHT/);
  assert.throws(() => allocateUsdByWeight(58, [{ key: "AT", weightKg: 1 }, { key: "AT", weightKg: 2 }]), /DUPLICATE_ALLOCATION_KEY/);
});

test("une charge directe non imputée reste visible avec son montant", () => {
  const cost = createUnallocatedDirectCost({ kind: "EXPEDITION_KLZ", amountUsd: 12.34, reason: "Cohorte absente", sourceIdentity: "DEPENSES:42" });
  assert.equal(cost.state, "DIRECT_COST_UNALLOCATED");
  assert.equal(cost.amountCents, 1234);
});

test("la liste d’anomalies exclut définitivement PASSAGE_FIH_NON_PROUVE", () => {
  assert.equal(BILAN_ANOMALY_CODES.includes("PASSAGE_FIH_NON_PROUVE" as never), false);
});

function resolvedId(code: string) {
  const cohort = resolveCohort(code);
  assert.equal(cohort.state, "RESOLVED");
  return cohort.state === "RESOLVED" ? cohort.definition.id : "";
}

function sumCents(allocations: readonly { amountCents: number }[]) {
  return allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
}
