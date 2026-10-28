import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/admin/stockages/v2/forwarding-correction/route.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./forwarding-admin-correction.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../../local-preparation/supabase/stockages-v2/022_admin_mistaken_forwarding_correction.sql", import.meta.url), "utf8");
const cycleSql = readFileSync(new URL("../../local-preparation/supabase/stockages-v2/023_forwarding_new_cycle_after_correction.sql", import.meta.url), "utf8");
const forwardingServer = readFileSync(new URL("./stockages-forwarding.ts", import.meta.url), "utf8");
const legacyQuote = readFileSync(new URL("./klz-lshi-departure.ts", import.meta.url), "utf8");

test("lecture et confirmation exigent une session Admin; l'écriture est désactivée par défaut", () => {
  assert.equal((route.match(/authorizeAdminRequest\(request\)/g) ?? []).length, 2);
  assert.match(route, /if \(!auth\.authorized\) return NextResponse\.json/);
  assert.match(route, /process\.env\.FORWARDING_ADMIN_CORRECTION_ENABLED !== "true"/);
  assert.match(server, /if \(!preview\.enabled\) throw new Error\("CORRECTION_NOT_ENABLED"\)/);
});

test("transaction SQL revalide identité, paiement, Caisse, disponibilité et unicité sous verrou", () => {
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
  assert.match(sql, /from public\.stockage_forwardings\s+where forwarding_id=p_forwarding_id for update/);
  assert.match(sql, /from public\.stockage_parcels where parcel_id=p_parcel_id for update/);
  assert.match(sql, /v_parcel\.delivery_status<>'AVAILABLE'/);
  assert.match(sql, /v_forwarding\.amount_paid<>0/);
  assert.match(sql, /from public\.stockage_payment_orchestrations where forwarding_id=p_forwarding_id/);
  assert.match(sql, /from public\.cash_events where source_id=p_forwarding_id::text/);
  assert.match(sql, /from public\.stockage_events where occurred_at>v_arrival\.occurred_at/);
  assert.match(sql, /ORIGIN_PARCEL_COLLISION/);
  assert.match(sql, /revoke all on function public\.correct_mistaken_forwarding/);
  assert.match(sql, /to service_role;/);
});

test("correction conserve la trace de l'acheminement et ne touche pas aux paiements ni au manifeste", () => {
  assert.match(sql, /status='CANCELLED_BY_COMPENSATION'/);
  assert.match(sql, /'FORWARDING_CANCELLED_BY_COMPENSATION'/);
  assert.match(sql, /'MISTAKEN_FORWARDING_CORRECTED'/);
  assert.doesNotMatch(sql, /(?:insert into|update|delete from)\s+public\.(?:cash_events|encaissements|payments|p1)/i);
});

test("registre historique explicitement annulé et unicité des trajets actifs maintenue", () => {
  assert.match(sql, /update public\.stockage_forwarding_manifest_registry\s+set sync_state='CANCELLED_BY_COMPENSATION'/);
  assert.match(sql, /payment_request_id is null and cash_event_id is null/);
  assert.match(sql, /create unique index stockage_forwardings_active_route_unique/);
  assert.match(sql, /where status <> 'CANCELLED_BY_COMPENSATION'/);
  assert.doesNotMatch(sql, /delete from public\.stockage_forwardings/i);
  assert.doesNotMatch(sql, /delete from public\.stockage_forwarding_manifest_registry/i);
});

test("nouveau cycle uniquement après annulation, avec référence liée à la nouvelle requête", () => {
  assert.match(cycleSql, /create or replace function public\.confirm_storage_forwarding_departure/);
  assert.match(cycleSql, /status<>'CANCELLED_BY_COMPENSATION'/);
  assert.match(cycleSql, /v_reference:=v_reference\|\|'-R'\|\|upper\(left\(replace\(p_request_id::text,'-',''\),21\)\)/);
  assert.match(cycleSql, /creation_request_id=p_request_id for update/);
  assert.match(forwardingServer, /\[A-Z0-9\._\/-\]\{5,95\}/);
  assert.match(legacyQuote, /neq\("status", "CANCELLED_BY_COMPENSATION"\)/);
});

test("paiement à l'origine et finaliseur partagent la référence du nouveau cycle", () => {
  assert.match(cycleSql, /create or replace function public\.finalize_inter_agency_forwarding/);
  assert.match(cycleSql, /v_reference:=v_reference\|\|'-R'\|\|upper\(left\(replace\(p_request_id::text,'-',''\),21\)\)/);
  assert.match(cycleSql, /if v_row\.forwarding_id is not null then/);
  assert.match(cycleSql, /if v_row\.payment_created is not true or v_row\.payment_response is null then/);
  assert.match(forwardingServer, /eq\("status", "CANCELLED_BY_COMPENSATION"\)/);
  assert.match(forwardingServer, /forwardingCycleFingerprint\(baseFingerprint, cancelledForwardingId\)/);
  assert.match(forwardingServer, /if \(currentCancelledId !== input\.cancelledForwardingId\)/);
  assert.match(forwardingServer, /forwardingCycleReference\(input\.baseReference, input\.paymentRequestId/);
  assert.match(forwardingServer, /operationContext: \{[\s\S]*?forwardingReference\s*\}/);
  assert.match(forwardingServer, /if \(!begun\.paymentCreated \|\| !paymentResponse\)/);
});
