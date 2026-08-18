import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./admin-expenses-module.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("./admin-workspace.tsx", import.meta.url), "utf8");

test("la page Dépenses utilise uniquement la nouvelle API en lecture", () => {
  assert.match(source, /loadAdminExpenses/);
  assert.match(source, /Lecture sécurisée de DEPENSES PUBLIC/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(source, /DEPENSES_PUBLIC_API_KEY|GOOGLE_|service_role/i);
});

test("affiche tous les filtres, états, pagination et totaux séparés", () => {
  for (const label of ["Date de début", "Date de fin", "Agence", "Catégorie", "Devise", "Agent", "Statut", "Référence", "Total général", "Total hors TF Bénin", "Précédente", "Suivante", "Réessayer"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Aucune dépense/);
  assert.match(source, /Lecture impossible/);
});

test("Catégorie et Agent sont des listes issues des sources autorisées", () => {
  assert.match(source, /EXPENSE_CATEGORIES\.map/);
  assert.match(source, /loadActiveExpenseAgents/);
  assert.match(source, /Tous les Agents/);
  assert.match(source, /agent\.agency === draft\.agency/);
  assert.match(source, /agentStillAvailable[\s\S]*agent: agentStillAvailable \? draft\.agent : undefined/);
  assert.doesNotMatch(source, /placeholder="Toutes les catégories"|placeholder="Nom de l’agent"/);
});

test("conserve les filtres dans l’URL et reste responsive", () => {
  assert.match(source, /history\.replaceState/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /md:grid-cols-2 xl:grid-cols-4/);
});

test("les six cartes Admin utilisent les accents vert citron", () => {
  assert.match(workspace, /border-accent\/25 bg-accent\/15 text-accent/);
  assert.match(workspace, /variant="growth"[^>]*className="mt-6 w-full sm:w-auto"/);
  assert.doesNotMatch(workspace, /#AFC7FF/);
});
