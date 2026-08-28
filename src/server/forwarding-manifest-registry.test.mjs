import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper=await readFile(new URL("./forwarding-manifest-registry.ts",import.meta.url),"utf8");
const route=await readFile(new URL("../app/api/agent/encaissements/payment/route.ts",import.meta.url),"utf8");
const payment=await readFile(new URL("./destination-payment-parcel.ts",import.meta.url),"utf8");
test("réconciliation intervient après paiement canonique",()=>{assert.ok(route.indexOf("recordDestinationPayment")<route.indexOf("reconcileForwardingManifestRegistry"));assert.match(payment,/payment: payload,[\s\S]*forwardingId: parcel\.forwardingId/);});
test("échec registre est absorbé et journalisé sans données sensibles",()=>{assert.match(route,/reconcileForwardingManifestRegistry\(forwardingId\)\.catch/);assert.match(route,/\[forwarding-manifest-registry\]/);assert.doesNotMatch(route,/accessToken|serviceRole|JWT/);});
test("helper appelle uniquement la RPC de réconciliation",()=>{assert.match(helper,/rpc\("reconcile_forwarding_manifest_registry"/);assert.doesNotMatch(helper,/\.from\("stockage_/);});
test("notifications forwarding restent inactives",()=>{assert.doesNotMatch(route,/notifyForwardingPayment|forwarding-admin-notifications/);assert.match(route,/eventKey: `PAYMENT:/);});
