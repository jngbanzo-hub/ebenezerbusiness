import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper=await readFile(new URL("./forwarding-manifest-projection.ts",import.meta.url),"utf8");
const route=await readFile(new URL("../app/api/internal/forwarding-manifest/traces/route.ts",import.meta.url),"utf8");

test("source strictement read-only et limitée au registre",()=>{assert.match(helper,/\.from\("stockage_forwarding_manifest_registry"\)/);assert.doesNotMatch(helper,/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);});
test("seuls les paiements certifiés et complets sont projetables",()=>{for(const token of ["CERTIFIED","payment_request_id","cash_event_id","payment_datetime","amount_paid","amount_expected"])assert.match(helper,new RegExp(token));});
test("ordre canonique date puis forwarding",()=>{assert.ok(helper.indexOf('.order("payment_datetime"')<helper.indexOf('.order("forwarding_id"'));});
test("route protégée sans cache ni secret en réponse",()=>{assert.match(route,/FORWARDING_MANIFEST_SYNC_TOKEN/);assert.match(route,/timingSafeEqual/);assert.match(route,/private, no-store/);assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE_KEY|sourceParcelId/);});
