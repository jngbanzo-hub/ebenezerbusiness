import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const page = readFileSync(join(process.cwd(), "src/features/admin/encaissements-certification-readonly-page.tsx"), "utf8");

test("façade affiche l'agrégation F/M et les témoins sans mutation", () => {
  for (const label of ["Diagnostic F/M", "F_POSITIF", "F_ZERO", "F_VIDE", "F_NULL", "F_NON_NUMERIQUE", "F_ZERO + M renseigné", "M/P1 concordants", "AT30126", "AT14526", "AT18826", "AT02326"]) assert.match(page, new RegExp(label.replace(/[+]/g, "\\+")));
  for (const label of ["modernManifestAudit", "Audit inversé Manifeste COO", "CODES RESTANT", "À VÉRIFIER", "Recherche par code", "NON CERTIFIABLE"]) assert.match(page, new RegExp(label));
  assert.doesNotMatch(page, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});
