import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./daily-report-page.tsx", import.meta.url), "utf8");

test("le rapport réutilise le vert citron officiel et le fond sombre", () => {
  assert.match(source, /text-accent/);
  assert.match(source, /border-accent/);
  assert.match(source, /bg-accent/);
  assert.match(source, /glow="growth"/);
  assert.match(source, /variant="growth"/);
  assert.match(source, /bg-slate-950/);
});

test("les filtres, cartes, liens et focus utilisent les accents officiels", () => {
  assert.match(source, /focus:border-accent/);
  assert.match(source, /focus:ring-accent/);
  assert.match(source, /hover:text-\[#D9FF83\]/);
  assert.match(source, /Appliquer les filtres/);
  assert.match(source, /Voir \/ corriger l’opération source/);
});
