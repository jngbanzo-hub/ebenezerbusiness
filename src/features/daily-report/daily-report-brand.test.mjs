import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./daily-report-page.tsx", import.meta.url), "utf8");

test("le rapport conserve le fond sombre avec des accents vert citron ciblés", () => {
  assert.match(source, /text-accent/);
  assert.match(source, /border-accent/);
  assert.match(source, /bg-accent/);
  assert.match(source, /variant="growth"/);
  assert.match(source, /bg-slate-950/);
  assert.match(source, /text-3xl font-semibold uppercase tracking-tight text-white/);
  assert.match(source, /border-white\/10/);
});

test("le vert citron reste réservé aux actions, icônes, liens et focus", () => {
  assert.match(source, /focus:border-accent/);
  assert.match(source, /focus:ring-accent/);
  assert.match(source, /hover:text-\[#D9FF83\]/);
  assert.match(source, /Appliquer les filtres/);
  assert.match(source, /Voir \/ corriger l’opération source/);
  assert.doesNotMatch(source, /tracking-tight text-accent/);
  assert.doesNotMatch(source, /text-xl font-semibold text-\[#D9FF83\]/);
});
