import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("./agent-dashboard.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("./agent-profile-page.tsx", import.meta.url), "utf8");

test("le dashboard Agent affiche la photo mappée avec un fallback initiales", () => {
  assert.match(dashboard, /getAgentProfilePhoto\(profile\.id\)/);
  assert.match(dashboard, /Photo de profil de \$\{profile\.nom\}/);
  assert.match(dashboard, /aria-label=\{`Avatar \$\{initials\}`\}/);
  assert.match(dashboard, /Agence : \{AGENCY_LABELS\[profile\.agence\]\}/);
  assert.match(dashboard, /Rôle : Agent/);
});

test("le profil conserve la photo et sépare les informations", () => {
  assert.match(profile, /getAgentProfilePhoto\(profile\.id\)/);
  assert.match(profile, /Informations professionnelles/);
  assert.match(profile, /Informations personnelles/);
  assert.match(profile, /Numéro WhatsApp/);
  assert.match(profile, /Date de naissance/);
  assert.match(profile, /Situation matrimoniale/);
  assert.match(profile, /Non renseigné/);
  assert.match(profile, /visible uniquement par l’Agent authentifié/);
});
