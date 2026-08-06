import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const sql = read("local-preparation/supabase/stockages-v2/009_paid_exit_forwarding_orchestration.sql");
const edge = read("local-preparation/edge-functions/web-hardened/paiements-agents-enregistrer-paiement/index.ts");
const server = read("src/server/stockages-forwarding.ts");
const ui = read("src/features/agent/agent-workspace.tsx") + read("src/features/stockages/stockages-v2-page.tsx");
const routes = ["route.ts", "arrival/route.ts", "delivery/route.ts"].map((path) => read(`src/app/api/agent/stockages/forwardings/${path}`)).join("\n");

test("le paiement total utilise un registre durable avant Apps Script et reprend son checkpoint", () => {
  assert.match(sql, /stockage_payment_orchestrations/);
  assert.match(sql, /PENDING.*COMPLETED.*FAILED.*COMPENSATION_REQUIRED/s);
  assert.ok(edge.indexOf('rpc("begin_paid_destination_orchestration"') < edge.indexOf("fetch(appsScriptUrl"));
  assert.ok(edge.indexOf('rpc("checkpoint_paid_destination_payment"') > edge.indexOf("fetch(appsScriptUrl"));
  assert.match(edge, /paymentCreated === true/);
  assert.match(edge, /IDEMPOTENCY_CONFLICT/);
});

test("la finalisation verrouille colis puis compte et empêche le stock négatif", () => {
  assert.match(sql, /stockage_parcels where tracking_code=v_row\.tracking_code for update/);
  assert.match(sql, /stockage_accounts where agency=v_row\.agency for update/);
  assert.match(sql, /current_parcel_count>=1 and current_weight_kg>=v_parcel\.canonical_weight_kg/);
  assert.match(sql, /SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION/);
  assert.match(sql, /PARCEL_NOT_IN_STOCK/);
  assert.match(sql, /STOCK_INSUFFICIENT/);
});

test("les six tarifs et la référence non ambiguë restent serveur", () => {
  for (const fragment of ["'FIH-LSHI' then 12", "'LSHI-FIH' then 13", "'FIH-KLZ' then 14", "'KLZ-FIH' then 16", "'LSHI-KLZ' then 11", "'KLZ-LSHI' then 13"]) assert.ok(sql.includes(fragment));
  assert.match(sql, /original_tracking_code\|\|'-'\|\|v_row\.origin_agency\|\|'-'\|\|v_row\.destination_agency/);
  assert.doesNotMatch(ui, /INTER_AGENCY_RATES|FIH-LSHI|LSHI-FIH/);
  assert.match(server, /resolveInterAgencyQuote/);
  assert.doesNotMatch(routes, /body\.weightKg/);
  assert.doesNotMatch(ui, /weightKg:\s*routingQuote\.weightKg/);
});

test("l’acheminement est idempotent, manuel à l’arrivée et immutable", () => {
  assert.match(sql, /begin_inter_agency_forwarding/);
  assert.match(sql, /checkpoint_inter_agency_payment/);
  assert.match(sql, /finalize_inter_agency_forwarding/);
  assert.match(sql, /record_forwarding_arrival/);
  assert.match(sql, /confirm_forwarding_delivery/);
  assert.match(sql, /creation_request_id uuid not null unique/);
  assert.match(sql, /unique\(original_tracking_code,origin_agency,destination_agency\)/);
  assert.match(sql, /stockage_forwarding_events_reject_mutation/);
  assert.match(server, /recordForwardingArrival/);
  assert.match(server, /confirmForwardingDelivery/);
});

test("les écritures sont service_role uniquement et Transferts reste isolé", () => {
  assert.match(sql, /revoke all.*public,anon,authenticated/s);
  assert.match(sql, /grant execute.*service_role/s);
  assert.doesNotMatch(sql + edge + server + ui, /features\/transferts|api\/agent\/transferts|TRANSFER_/i);
  assert.doesNotMatch(ui, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("les trois commandes authentifient l’Agent et refusent les identités navigateur", () => {
  assert.equal((routes.match(/authorizeAgentRequest\(request\)/g) ?? []).length, 3);
  assert.doesNotMatch(routes, /body\.(actorId|actorAgency|agency_scope|eventId|version)/);
  assert.match(routes, /physicalDeliveryConfirmed/);
});

test("les verrous supportent plusieurs Agents sans double opération", () => {
  assert.match(sql, /stockage_payment_orchestrations where request_id=p_request_id for update/);
  assert.match(sql, /stockage_forwardings where forwarding_reference=upper\(btrim\(p_forwarding_reference\)\) for update/g);
  assert.match(sql, /stockage_accounts where agency=v_forwarding\.destination_agency for update/g);
  assert.match(sql, /request_id uuid not null unique/);
});
