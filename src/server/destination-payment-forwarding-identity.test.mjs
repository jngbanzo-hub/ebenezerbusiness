import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const server=fs.readFileSync(new URL("./destination-payment-parcel.ts",import.meta.url),"utf8");
const edge=fs.readFileSync(new URL("../../local-preparation/edge-functions/web-hardened/paiements-agents-enregistrer-paiement/index.ts",import.meta.url),"utf8");

test("native amount keeps standard rate and excludes only certified forwarding request ids",()=>{
  assert.ok(server.includes(": money(weightKg * STANDARD_RATES_USD_PER_KG[agency])"));
  assert.match(server,/\.not\("forwarding_id", "is", null\)/);
  assert.match(server,/forwardingRequests\.has\(payment\.paymentRequestId/);
});

test("forwarding amount is bound to forwarding row and both certified ids",()=>{
  assert.ok(server.includes("? money(Number(forwarding.amount_paid))"));
  assert.ok(server.includes("{ parcelId: parcel.parcelId, forwardingId: parcel.forwardingId }"));
  assert.match(edge,/begin_forwarding_destination_payment/);
  assert.match(edge,/finalize_forwarding_destination_payment/);
});

test("native orchestration remains the default branch",()=>{
  assert.match(edge,/isForwardingDestinationPayment \? "begin_forwarding_destination_payment" : "begin_paid_destination_orchestration"/);
  assert.match(edge,/forwarding \? "finalize_forwarding_destination_payment" : "finalize_paid_destination_orchestration"/);
});
