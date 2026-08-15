import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./[qrId]/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../api/qr/[qrId]/route.ts", import.meta.url), "utf8");
const tracking = readFileSync(new URL("../../features/tracking/parcel-tracking.tsx", import.meta.url), "utf8");
const resolver = readFileSync(new URL("../../server/public-qr-resolver.ts", import.meta.url), "utf8");
const sql = readFileSync(
  new URL("../../../local-preparation/supabase/qr/002_qr_public_resolution.sql", import.meta.url),
  "utf8"
);

test("la page QR est dynamique, sans cache, et réutilise exactement TrackingResultCard", () => {
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /revalidate = 0/);
  assert.match(route, /public, no-store, max-age=0/);
  assert.match(page, /<TrackingResultCard result=\{resolution\.result\}/);
  assert.match(tracking, /export function TrackingResultCard/);
});

test("le périmètre QR public n'importe aucun moteur interdit", () => {
  assert.doesNotMatch(`${page}\n${route}`, /Encaissements|Stockage|agent-workspace|payment|MANIFESTE|EXPÉDITION/);
});

test("le format, les cinq QR de contrôle et les états publics sont couverts", () => {
  assert.match(resolver, /\^EEBQR\[0-9\]\{6,\}\$/);
  for (const suffix of ["000001", "000025", "000050", "000075", "000100"]) {
    assert.match(page, /association au colis en attente/);
    assert.match(`EEBQR${suffix}`, /^EEBQR[0-9]{6,}$/);
  }
  assert.match(page, /Ce QR Eben Ezer Business n’est pas utilisable/);
  assert.match(page, /QR non reconnu/);
});

test("ASSIGNED passe le code et l'agence canoniques au moteur puis au DTO existant", () => {
  assert.match(resolver, /findTracking\(registry\.trackingCode, registry\.agency\)/);
  assert.match(resolver, /createTrackingResultFromPublicRecord\(record\)/);
  assert.doesNotMatch(resolver, /replace\(|substring\(|slice\(/);
});

test("la fonction SQL est une lecture serveur minimale sans droit public", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /grant execute on function public\.resolve_qr_public\(text\) to service_role/);
  assert.match(sql, /revoke all on function public\.resolve_qr_public\(text\)[\s\S]*public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate)\b/i);
  assert.doesNotMatch(sql, /version|audit|payment|stockage/i);
});
