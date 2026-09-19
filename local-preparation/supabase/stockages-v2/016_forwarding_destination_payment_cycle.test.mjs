import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./016_forwarding_destination_payment_cycle.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("./016_forwarding_destination_payment_cycle.rollback.sql", import.meta.url), "utf8");
const preflight = readFileSync(new URL("./016_forwarding_destination_payment_cycle.preflight.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../../../src/server/stockages-forwarding-departure.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../../../src/app/api/agent/stockages/forwardings/departure/route.ts", import.meta.url), "utf8");
const retiredRoute = readFileSync(new URL("../../../src/app/api/agent/stockages/forwardings/route.ts", import.meta.url), "utf8");

function forward({ code = "AT19326B", destination = "LSHI", weight = 2 } = {}) {
  const rate = destination === "LSHI" ? 13 : destination === "FIH" ? 16 : null;
  if (!rate) throw new Error("FORWARDING_ROUTE_NOT_ALLOWED");
  return { code, destination, weight, rate, amount: weight * rate, status: "IN_TRANSIT", amountPaid: 0, cashEventId: null, paymentCreated: false, departed: true, arrived: false, paid: false };
}
function arrive(row, agency) { if (row.destination !== agency) throw new Error("WRONG_AGENCY"); if (row.arrived) throw new Error("FORWARDING_ALREADY_ARRIVED"); return { ...row, arrived: true, status: "ARRIVAL_CONFIRMED" }; }
function pay(row, amount) { if (!row.arrived || row.status !== "ARRIVAL_CONFIRMED") throw new Error("FORWARDING_NOT_READY_FOR_PAYMENT"); if (row.paid) throw new Error("PAYMENT_ALREADY_RECORDED"); if (amount !== row.amount) throw new Error("INVALID_PAID_EXIT_COMMAND"); return { ...row, paid: true, paymentCreated: true, amountPaid: amount, cashEventId: "cash-destination", status: "READY_FOR_DELIVERY" }; }

test("016 sépare strictement logistique et finance", () => {
  assert.match(migration, /MIGRATION_015_REQUIRED/);
  assert.match(migration, /information_schema\.columns[\s\S]*parcel_id/);
  assert.match(migration, /begin_forwarding_destination_payment/);
  assert.match(migration, /alter column cash_event_id drop not null/i);
  assert.match(migration, /status in \('IN_TRANSIT','ARRIVAL_CONFIRMED'\) and amount_paid=0 and cash_event_id is null/i);
  assert.match(migration, /'DESTINATION_AFTER_ARRIVAL'/);
  assert.match(migration, /'state','COMPLETED','forwardingState','READY_FOR_DELIVERY'/);
  assert.match(migration, /payment_created,payment_response,forwarding_id,state[\s\S]*false,null,v_id,'IN_TRANSIT'/);
  assert.doesNotMatch(migration, /cash-payment-/);
  assert.doesNotMatch(server, /paiements-agents-enregistrer-paiement|invokeCanonicalPaymentEngine/);
});

test("KLZ vers LSHI suit IN_TRANSIT -> ARRIVAL_CONFIRMED -> READY_FOR_DELIVERY", () => {
  const departed = forward();
  assert.deepEqual([departed.rate, departed.amount, departed.amountPaid, departed.cashEventId, departed.paymentCreated], [13, 26, 0, null, false]);
  const arrived = arrive(departed, "LSHI");
  assert.equal(arrived.status, "ARRIVAL_CONFIRMED");
  assert.equal(arrived.cashEventId, null);
  const paid = pay(arrived, 26);
  assert.deepEqual([paid.status, paid.amountPaid, paid.cashEventId, paid.paymentCreated], ["READY_FOR_DELIVERY", 26, "cash-destination", true]);
});

test("KLZ vers FIH applique 16 USD/kg", () => {
  const departed = forward({ destination: "FIH", weight: 2 });
  assert.deepEqual([departed.rate, departed.amount, departed.cashEventId], [16, 32, null]);
  assert.equal(pay(arrive(departed, "FIH"), 32).status, "READY_FOR_DELIVERY");
});

test("les doubles opérations et agences falsifiées sont refusées", () => {
  const departed = forward();
  assert.throws(() => arrive(departed, "FIH"), /WRONG_AGENCY/);
  const arrived = arrive(departed, "LSHI");
  assert.throws(() => arrive(arrived, "LSHI"), /ALREADY_ARRIVED/);
  const paid = pay(arrived, arrived.amount);
  assert.throws(() => pay(paid, paid.amount), /NOT_READY_FOR_PAYMENT|ALREADY_RECORDED/);
  assert.match(migration, /creation_request_id=p_request_id for update/);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /where request_id=p_request_id/);
});

test("l'identité conserve code, suffixe, parcel_id et forwarding_id", () => {
  for (const suffix of ["", "B", "C", "D"]) assert.match(forward({ code: `AT19326${suffix}` }).code, new RegExp(`AT19326${suffix}$`));
  assert.match(migration, /tracking_code,agency,canonical_weight_kg,weight_source,weight_source_reference,forwarding_id/);
  assert.match(migration, /values\(v_parcel_id,v_forwarding.original_tracking_code/);
  assert.match(migration, /where parcel_id=v_parcel.parcel_id/);
  assert.match(migration, /'parcelId',v_parcel\.parcel_id/);
  assert.match(migration, /insert into public\.stockage_parcels\(parcel_id,tracking_code/);
  assert.doesNotMatch(migration, /tracking_code[^\n]*KLZ-LSHI/);
});

test("les mouvements physiques restent séparés et équilibrés", () => {
  const klzBefore={count:10,weight:75}; const destinationBefore={count:20,weight:120}; const weight=4;
  const klzAfter={count:klzBefore.count-1,weight:klzBefore.weight-weight};
  const duringTransit={...destinationBefore};
  const destinationAfter={count:destinationBefore.count+1,weight:destinationBefore.weight+weight};
  const afterDelivery={count:destinationAfter.count-1,weight:destinationAfter.weight-weight};
  assert.deepEqual(klzAfter,{count:9,weight:71});
  assert.deepEqual(duringTransit,{count:20,weight:120});
  assert.deepEqual(destinationAfter,{count:21,weight:124});
  assert.deepEqual(afterDelivery,destinationBefore);
  assert.match(migration, /'SORTIE_POUR_ACHEMINEMENT','KLZ',-1,-p_canonical_weight_kg/);
  assert.match(migration, /'ARRIVAGE_ACHEMINEMENT'.*1,v_forwarding\.canonical_weight_kg/);
});

test("paiements natifs, Caisse et Stockage natif restent isolés", () => {
  assert.doesNotMatch(migration, /create or replace function public\.(begin_paid_destination_orchestration|finalize_paid_destination_orchestration|record_cash_payment_credit)/i);
  assert.doesNotMatch(migration, /update public\.cash_accounts/i);
  assert.match(migration, /record_cash_payment_credit/);
  assert.match(migration, /'INTER_AGENCY_FORWARDING'/);
  assert.match(migration, /forwarding_id is null for update/);
});

test("preflight protège JL27226 et rollback refuse une perte métier", () => {
  assert.match(preflight, /a459a340-ebf5-432b-b76b-b67dd3243b30/);
  assert.match(preflight, /JL27226/);
  assert.match(preflight, /PAYMENT_IN_PROGRESS/);
  assert.match(preflight, /payment_created is false and forwarding_id is null/);
  assert.match(rollback, /ROLLBACK_BLOCKED: UNPAID_FORWARDING_CYCLE_ALREADY_USED/);
  assert.match(rollback, /alter column cash_event_id set not null/);
});

test("route serveur conserve KLZ et LSHI après ajout de FIH", () => {
  assert.match(route, /auth\.identity\.site !== "KLZ" && auth\.identity\.site !== "LSHI" && auth\.identity\.site !== "FIH"/);
  assert.match(route, /destinationAgency/);
  assert.match(server, /origin === "KLZ"/);
  assert.match(server, /destination === "LSHI" \|\| destination === "FIH"/);
  assert.match(server, /destination === "KLZ" \|\| destination === "FIH"/);
  assert.match(server, /origin: input\.origin/);
  assert.doesNotMatch(route, /paymentMode|amountPaid/);
  assert.match(retiredRoute, /FORWARDING_PAYMENT_BEFORE_ARRIVAL_FORBIDDEN/);
  assert.doesNotMatch(retiredRoute, /createInterAgencyForwarding|paymentMode/);
});
