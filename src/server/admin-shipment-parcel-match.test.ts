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
  assert.deepEqual(shipmentParcelIdentity(klz,"AT19326Bklz"),{rawCode:"AT19326BKLZ",canonicalCode:"AT19326B",agency:"KLZ",code:"AT19326B"});
  assert.equal(shipmentParcelIdentity(shipment({}),"AT19326C").code,"AT19326C");
  assert.equal(shipmentParcelIdentity(shipment({}),"AT19326D").code,"AT19326D");
});

test("projette les suffixes d'agence EXPÉDITION sans dépendre de la compagnie",()=>{
  const dhl=shipment({company:"DHL",destination:"LSHI"});
  assert.deepEqual(shipmentParcelIdentity(dhl,"AT14726KLZ"),{rawCode:"AT14726KLZ",canonicalCode:"AT14726",agency:"KLZ",code:"AT14726"});
  assert.equal(shipmentParcelIdentity(dhl,"AT14726FIH").agency,"FIH");
  assert.equal(shipmentParcelIdentity(dhl,"AT14726LSHI").agency,"LSHI");
});

test("la recherche canonique retourne toutes les agences et la recherche suffixée cible son agence",()=>{
  const rows=[
    shipment({id:"fih",company:"ASKY",destination:"FIH",parcelCodes:["AT14726"]}),
    shipment({id:"lshi",company:"DHL",destination:"LSHI",parcelCodes:["AT14726"]}),
    shipment({id:"klz",company:"DHL",destination:"LSHI",parcelCodes:["AT14726KLZ"]})
  ];
  assert.deepEqual(findShipmentParcelMatches(rows,"AT14726").map(({agency})=>agency).sort(),["FIH","KLZ","LSHI"]);
  const [klz]=findShipmentParcelMatches(rows,"AT14726KLZ");
  assert.deepEqual({code:klz.code,rawCode:klz.rawCode,canonicalCode:klz.canonicalCode,agency:klz.agency,destination:klz.destination},{code:"AT14726",rawCode:"AT14726KLZ",canonicalCode:"AT14726",agency:"KLZ",destination:"LSHI"});
});

test("ne projette ni suffixe métier ni terminaison agence sans code canonique valide",()=>{
  const row=shipment({destination:"FIH"});
  assert.equal(shipmentParcelIdentity(row,"AT14726B").code,"AT14726B");
  assert.deepEqual(shipmentParcelIdentity(row,"REFERENCEKLZ"),{rawCode:"REFERENCEKLZ",canonicalCode:"REFERENCEKLZ",agency:"FIH",code:"REFERENCEKLZ"});
});

test("ne crée aucun doublon artificiel et conserve les homonymes par ligne et agence",()=>{
  const rows=[
    shipment({id:"fih",destination:"FIH",parcelCodes:["AT14726","AT14726"]}),
    shipment({id:"klz",company:"DHL",destination:"LSHI",parcelCodes:["AT14726KLZ"]})
  ];
  const matches=findShipmentParcelMatches(rows,"AT14726");
  assert.equal(matches.length,2);
  assert.equal(new Set(matches.map(({id})=>id)).size,2);
  assert.deepEqual(new Set(matches.map(({agency})=>agency)),new Set(["FIH","KLZ"]));
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
