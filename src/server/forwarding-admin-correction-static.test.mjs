import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/admin/stockages/v2/forwarding-correction/route.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./forwarding-admin-correction.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../../local-preparation/supabase/stockages-v2/022_admin_mistaken_forwarding_correction.sql", import.meta.url), "utf8");

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
