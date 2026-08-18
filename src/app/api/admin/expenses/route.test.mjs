import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("route Admin authentifiée et strictement en lecture", () => {
  assert.match(source, /authorizeAdminRequest\(request\)/);
  assert.match(source, /readAdminExpenses/);
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|DEPENSES_PUBLIC_API_KEY/);
});

test("la route refuse les filtres inconnus et ne met rien en cache", () => {
  assert.match(source, /allowedQueryKeys/);
  assert.match(source, /INVALID_FILTERS/);
  assert.match(source, /private, no-store, max-age=0/);
});

test("une catégorie invalide conserve une erreur métier claire", () => {
  assert.match(source, /AdminExpenseReadError/);
  assert.match(source, /INVALID_CATEGORY/);
  assert.match(source, /Catégorie invalide ou non reconnue\./);
});
