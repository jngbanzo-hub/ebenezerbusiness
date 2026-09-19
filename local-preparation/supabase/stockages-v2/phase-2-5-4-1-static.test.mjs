import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sql = read("local-preparation/supabase/stockages-v2/009_paid_exit_forwarding_orchestration.sql");
const preflight = read("local-preparation/supabase/stockages-v2/009_paid_exit_forwarding_orchestration.preflight.sql");
const server = read("src/server/stockages-forwarding.ts");
const route = read("src/app/api/agent/stockages/forwardings/route.ts");
const ui = read("src/features/agent/agent-workspace.tsx");
const routing = read("src/server/inter-agency-routing.ts");

test("le contrat navigateur de création ne contient aucun champ dérivé", () => {
  for (const key of ["amountPaid", "amountExpected", "weight", "rate", "destinationAgency", "forwardingReference", "derivedCode", "status"]) {
    assert.doesNotMatch(route, new RegExp(`body\\.${key}`));
  }
  assert.match(route, /new Set\(\["trackingCode", "sourceAgency", "paymentMode", "optionalReference", "optionalObservation", "paymentRequestId"\]\)/);
  const forwardingHandler = ui.slice(ui.indexOf("async function handleForwarding"), ui.indexOf("const parsedAmount"));
  assert.doesNotMatch(forwardingHandler, /amountPaid:\s*routingQuote|requestId:\s*crypto\.randomUUID/);
  assert.match(server, /amount:\s*quote\.amountExpectedUsd/);
});

test("le paiement passe par la frontière Encaissements canonique sans écriture Caisse parallèle", () => {
  assert.match(server, /functions\/v1\/paiements-agents-enregistrer-paiement/);
  assert.ok(server.indexOf("invokeCanonicalPaymentEngine") < server.indexOf('rpc("checkpoint_inter_agency_payment"'));
  const forwardingSql = sql.slice(sql.indexOf("begin_inter_agency_forwarding"));
  assert.doesNotMatch(forwardingSql, /record_cash_payment_credit|insert into public\.cash_events/);
});

test("les préconditions sont toutes contrôlées avant le paiement", () => {
  for (const fragment of ["ACTIVE_AGENT_REQUIRED", "CASH_ACCOUNT_SUSPENDED", "INITIAL_BALANCE_REQUIRED", "STORAGE_ACCOUNT_SUSPENDED", "INITIAL_STOCK_REQUIRED", "FORWARDING_ROUTE_NOT_ALLOWED"]) assert.ok(sql.includes(fragment));
  assert.ok(server.indexOf('rpc("begin_inter_agency_forwarding"') < server.indexOf("invokeCanonicalPaymentEngine"));
});

test("la machine d’états complète interdit les raccourcis", () => {
  for (const state of ["QUOTE_READY", "PAYMENT_IN_PROGRESS", "PAID_AWAITING_ARRIVAL", "ARRIVAL_CONFIRMED", "READY_FOR_DELIVERY", "DELIVERED", "CANCELLED_BY_COMPENSATION", "ANOMALY_REQUIRES_ADMIN"]) assert.ok(sql.includes(state));
  assert.match(sql, /status<>'PAID_AWAITING_ARRIVAL'/);
  assert.match(sql, /status<>'READY_FOR_DELIVERY'/);
  assert.match(sql, /FORWARDING_ALREADY_ARRIVED|FORWARDING_ALREADY_DELIVERED/);
});

test("les six tarifs sont isolés de COO", () => {
  for (const fragment of ["'FIH-LSHI' then 12", "'LSHI-FIH' then 13", "'FIH-KLZ' then 14", "'KLZ-FIH' then 16", "'LSHI-KLZ' then 11", "'KLZ-LSHI' then 13"]) assert.ok(sql.includes(fragment));
  assert.doesNotMatch(sql + routing, /COO-(FIH|LSHI|KLZ)/);
});

test("la migration est contrôlable par une transaction externe", () => {
  assert.doesNotMatch(sql, /^\s*(begin|commit)\s*;/gim);
  assert.match(preflight, /^begin;/m);
  assert.match(preflight, /^rollback;/m);
  assert.match(preflight, /rollback_integral/);
});

test("RLS, droits et immutabilité restent fermés au navigateur", () => {
  assert.match(sql, /force row level security/g);
  assert.match(sql, /revoke all.*public,anon,authenticated/s);
  assert.match(sql, /grant execute.*service_role/s);
  assert.match(sql, /stockage_forwarding_events_reject_mutation/);
  assert.doesNotMatch(sql, /grant (insert|update|delete).*authenticated/i);
});

test("les erreurs réseau conservent le paymentRequestId", () => {
  assert.match(ui, /result_unknown_retry_same_id/);
  assert.match(ui, /getOrCreateForwardingAttempt/);
  assert.match(ui, /paymentRequestId:\s*attempt\.paymentRequestId/);
});
