import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const identity=readFileSync(new URL("./storage-parcel-identity.ts",import.meta.url),"utf8");
const resolver=readFileSync(new URL("./destination-payment-parcel.ts",import.meta.url),"utf8");
const flag=readFileSync(new URL("./forwarding-feature.ts",import.meta.url),"utf8");
const list=readFileSync(new URL("./stockages-forwarding-in-transit.ts",import.meta.url),"utf8");
const listRoute=readFileSync(new URL("../app/api/agent/stockages/forwardings/in-transit/route.ts",import.meta.url),"utf8");
const departure=readFileSync(new URL("./stockages-forwarding-departure.ts",import.meta.url),"utf8");
const arrivals=readFileSync(new URL("../features/stockages/stockages-v2-page.tsx",import.meta.url),"utf8");
const legacy=readFileSync(new URL("../app/api/agent/stockages/forwardings/route.ts",import.meta.url),"utf8");

function parse(value){const match=value.trim().toUpperCase().match(/^([A-Z0-9][A-Z0-9._/]{1,63}?)(?: |-|)(KLZ)-(LSHI|FIH)$/);return match?{code:match[1],route:`${match[2]}-${match[3]}`}:null;}

test("strict aliases preserve B/C/D and reject non-exact routes",()=>{
  for(const suffix of ["B","C","D"]) for(const separator of [" ","","-"]){const parsed=parse(`AT19326${suffix}${separator}KLZ-LSHI`);assert.deepEqual(parsed,{code:`AT19326${suffix}`,route:"KLZ-LSHI"});}
  assert.equal(parse("AT19326B KLZ-FIH")?.code,"AT19326B");
  assert.equal(parse("AT19326B KLZ-KLZ"),null);
  assert.equal(parse("AT19326B FIH-LSHI"),null);
  assert.match(identity,/parseForwardingAlias/);assert.match(resolver,/alias\.destinationAgency !== agency/);assert.match(resolver,/candidate\.forwarding_id/);
});

test("native codes are not rewritten",()=>{for(const code of ["AT19326","AT19326B","AT19326C","AT19326D"])assert.equal(parse(code),null);assert.match(resolver,/alias\?\.trackingCode \?\? trackingCode/);});

test("GET derives destination from authenticated profile and refuses agency query",()=>{assert.match(listRoute,/requireStorageAgency\(auth\.identity\.site\)/);assert.match(listRoute,/searchParams\.has\("agency"\)/);assert.match(list,/\.eq\("destination_agency", agency\)/);assert.match(list,/\.eq\("status", "IN_TRANSIT"\)/);assert.match(list,/agency !== "LSHI" && agency !== "FIH"/);});

test("GET in-transit always bypasses stale server fetch caches",()=>{assert.match(list,/global: \{ fetch: noStoreFetch \}/);assert.match(list,/fetch\(input, \{ \.\.\.init, cache: "no-store" \}\)/);});

test("flag is off by default and guards every forwarding write",()=>{assert.match(flag,/STOCKAGES_FORWARDING_ENABLED === "true"/);assert.match(flag,/FORWARDING_DISABLED/);assert.match(departure,/assertForwardingEnabled\(\)/);assert.match(list,/assertForwardingEnabled\(\)/);assert.match(legacy,/FORWARDING_PAYMENT_BEFORE_ARRIVAL_FORBIDDEN/);});

test("UI preserves native arrivals and replaces only manual forwarding arrival",()=>{assert.match(arrivals,/title="Déclarer un arrivage"/);assert.match(arrivals,/Acheminements en attente de réception/);assert.match(arrivals,/CONFIRMER L’ARRIVÉE/);assert.doesNotMatch(arrivals,/mode="arrival"/);assert.match(arrivals,/forwardingEnabled/);});

test("departure quote uses the physical KLZ identity and never calls payments",()=>{assert.match(departure,/\.eq\("agency", "KLZ"\)/);assert.match(departure,/\.is\("forwarding_id", null\)/);assert.match(departure,/parcelId: data\.parcel_id/);assert.doesNotMatch(departure,/paiements-agents|record_cash_payment_credit/);});

test("JL27226 cannot enter the KLZ origin cycle",()=>{assert.match(departure,/origin: "KLZ"/);assert.match(list,/\.eq\("status", "IN_TRANSIT"\)/);});
