import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("./agent-dashboard.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("./agent-profile-page.tsx", import.meta.url), "utf8");
const photoMap = readFileSync(new URL("./profile-photo-map.ts", import.meta.url), "utf8");

test("le dashboard Agent affiche la photo mappée avec un fallback initiales", () => {
  assert.match(dashboard, /getAgentProfilePhoto\(profile\.id\)/);
  assert.match(dashboard, /Photo de profil de \$\{profile\.nom\}/);
  assert.match(dashboard, /aria-label=\{`Avatar \$\{initials\}`\}/);
  assert.match(dashboard, /Agence : \{AGENCY_LABELS\[profile\.agence\]\}/);
  assert.match(dashboard, /Rôle : Agent/);
});

test("les photos de Sera NGBANZO et Kiss Esda BOMEME restent isolées par agent_id", () => {
  assert.match(photoMap, /5c0bb1b1-56f2-40df-bb93-1a2ba43b4eb3.*fih-profile\.jpg/);
  assert.match(photoMap, /ac8d449e-4461-4fd3-a15f-910ad66299db.*kiss-esda-bomeme\.jpg/);
  assert.match(photoMap, /PROFILE_PHOTOS_BY_AGENT_ID\[agentId\.trim\(\)\.toLowerCase\(\)\]/);
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
