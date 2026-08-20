import assert from "node:assert/strict";
import test from "node:test";

import type { ShipmentStatisticRow } from "../features/admin/shipment-statistics.ts";
// @ts-expect-error Node 22 exécute directement ce test TypeScript avec son extension explicite.
import { findShipmentParcelMatches, shipmentParcelIdentity } from "./admin-shipment-parcel-match.ts";

function shipment(overrides: Partial<ShipmentStatisticRow>): ShipmentStatisticRow {
  return { id:"row",date:"2026-08-10",company:"ASKY",destination:"FIH",groupages:1,weightKg:1,groupageCodes:"GROUPAGE 30\nAT19326B",pricePerKg:9,amountUsd:9,groupageWeights:"GROUPAGE 30 : 1 kg",manifestTotal:"1 COLIS",status:"En Vol",arrivalDate:"",arrivedGroupages:"",klzPackages:"",parcelCount:1,manifestWeightKg:1,parcelCodes:["AT19326B"],...overrides };
}

test("conserve les suffixes B/C/D et retire seulement le suffixe technique KLZ",()=>{
  const klz=shipment({company:"ETHIOPIAN",destination:"LSHI"});
  assert.deepEqual(shipmentParcelIdentity(klz,"AT19326Bklz"),{agency:"KLZ",code:"AT19326B"});
  assert.equal(shipmentParcelIdentity(shipment({}),"AT19326C").code,"AT19326C");
  assert.equal(shipmentParcelIdentity(shipment({}),"AT19326D").code,"AT19326D");
});

test("sépare le même code par agence et marque le plus récent de chacune",()=>{
  const matches=findShipmentParcelMatches([
    shipment({id:"fih-old",date:"2026-08-01"}),
    shipment({id:"fih-new",date:"2026-08-10"}),
    shipment({id:"lshi",date:"2026-08-09",company:"DHL",destination:"LSHI"})
  ],"AT19326B");
  assert.deepEqual(matches.map((item)=>[item.agency,item.date,item.isLatestForAgency]),[["FIH","2026-08-10",true],["LSHI","2026-08-09",true],["FIH","2026-08-01",false]]);
});

test("retourne le groupage réel quand il précède le code et contrôle l'absence",()=>{
  assert.equal(findShipmentParcelMatches([shipment({})],"AT19326B")[0].groupage,"GROUPAGE 30");
  assert.deepEqual(findShipmentParcelMatches([shipment({})],"AT99926"),[]);
});
