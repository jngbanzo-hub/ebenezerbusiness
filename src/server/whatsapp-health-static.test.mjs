import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reader = readFileSync(new URL("./whatsapp-health.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/whatsapp-health/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../features/admin/admin-whatsapp-health.tsx", import.meta.url), "utf8");
const system = readFileSync(new URL("../features/admin/admin-system-status.tsx", import.meta.url), "utf8");

test("la santé distante est validée strictement et échoue fermée", () => {
  assert.match(reader, /\.strict\(\)/);
  assert.match(reader, /cloudRun: z\.enum\(\["ACTIVE", "OPERATIONAL", "PROBLEM", "UNKNOWN"\]\)/);
  assert.match(reader, /lastRun: z\.enum\(\["SUCCESS", "FAILURE", "EN COURS", "UNKNOWN"\]\)/);
  assert.match(reader, /unavailableDependencies: z\.array/);
  assert.match(reader, /controller\.abort\(\)/);
  assert.match(reader, /4_000/);
  assert.match(reader, /status: "UNAVAILABLE", health: null/);
  assert.doesNotMatch(reader, /D360_API_KEY|Firestore|firebase/i);
});

test("la route Santé exige un Admin et reste GET uniquement", () => {
  assert.match(route, /authorizeAdminRequest\(request\)/);
  assert.match(route, /readWhatsappHealth\(\)/);
  assert.match(route, /private, no-store, max-age=0/);
  assert.doesNotMatch(route, /export (?:async )?function (?:POST|PUT|PATCH|DELETE)/);
});

test("la carte est séparée, sans polling ni action", () => {
  assert.match(system, /AdminWhatsappHealth accessToken=\{accessToken\}/);
  assert.match(component, /\/api\/admin\/whatsapp-health/);
  assert.match(component, /INDISPONIBLE/);
  assert.doesNotMatch(component, /setInterval|onClick|<button|<Button/);
});

test("la carte traduit les états légitimes et simplifie uniquement les libellés", () => {
  assert.match(component, /cloudRun: DependencyStatus/);
  assert.match(component, /lastRun: "SUCCESS" \| "FAILURE" \| "EN COURS" \| "UNKNOWN"/);
  assert.match(component, /value === "OPERATIONAL" \? "OPÉRATIONNEL"/);
  assert.match(component, /Numéros invalides \(24h\)/);
  assert.match(component, /Livraisons non confirmées/);
  assert.doesNotMatch(component, /INVALID_RECIPIENT 24h|DELIVERY_UNCERTAIN récent/);
});
