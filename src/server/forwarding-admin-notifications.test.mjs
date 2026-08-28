import assert from "node:assert/strict";import {readFileSync} from "node:fs";import test from "node:test";
const helper=readFileSync(new URL("./forwarding-admin-notifications.ts",import.meta.url),"utf8");
const departure=readFileSync(new URL("../app/api/agent/stockages/forwardings/departure/route.ts",import.meta.url),"utf8");
const arrival=readFileSync(new URL("../app/api/agent/stockages/forwardings/arrival/route.ts",import.meta.url),"utf8");
const payment=readFileSync(new URL("../app/api/agent/encaissements/payment/route.ts",import.meta.url),"utf8");
test("trois événements Admin idempotents",()=>{for(const token of ["FORWARDING_DEPARTED:","FORWARDING_ARRIVED:","FORWARDING_PAID:","audience:\"ADMIN\""])assert.match(helper,new RegExp(token));});
test("départ seulement après succès et erreur absorbée",()=>{assert.match(departure,/departForwarding[\s\S]+notifyForwardingDeparture/);assert.match(departure,/notifyForwardingDeparture[^;]+\.catch\(\(\)=>undefined\)/);});
test("arrivée spécialisée préserve COO sans doublon Admin générique",()=>{assert.match(arrival,/notifyForwardingArrival/);assert.match(arrival,/stock_arrival:\$\{eventId\}:coo/);assert.doesNotMatch(arrival,/stock_arrival:\$\{eventId\}:admin/);});
test("paiement spécialisé suit réconciliation et préserve notification native",()=>{assert.match(payment,/reconcileForwardingManifestRegistry[\s\S]+notifyForwardingPayment/);assert.match(payment,/eventKey: `PAYMENT:/);});
