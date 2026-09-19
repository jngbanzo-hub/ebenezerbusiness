import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../features/agent/agent-workspace.tsx", import.meta.url), "utf8");
const functions = readFileSync(new URL("../features/agent/functions.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/agent/manifest/route.ts", import.meta.url), "utf8");
const manifest = readFileSync(new URL("./agent-manifest.ts", import.meta.url), "utf8");

test("les six trajets utilisent la destination pour Stockage et l’origine pour le MANIFESTE", () => {
  for (const [origin, destination] of [["KLZ","LSHI"],["KLZ","FIH"],["LSHI","KLZ"],["LSHI","FIH"],["FIH","LSHI"],["FIH","KLZ"]]) {
    const alias = `${origin}-${destination}`;
    assert.match(workspace, new RegExp(`originAgency: requestedForwardingAlias\\.originAgency`), alias);
  }
  assert.match(workspace, /searchDestinationParcel\(normalizedCode, requestedParcelId\)/);
  assert.match(workspace, /originAgency: requestedForwardingAlias\.originAgency/);
  assert.match(functions, /params\.set\("agency", forwarding\.originAgency\)/);
});

test("l’accès inter-agences au MANIFESTE exige l’identité forwarding certifiée", () => {
  assert.match(route, /resolveForwardingManifestAgency/);
  assert.match(route, /parcelId/);
  assert.match(route, /forwardingId/);
  assert.match(manifest, /\.eq\("parcel_id", input\.parcelId\)/);
  assert.match(manifest, /\.eq\("forwarding_id", input\.forwardingId\)/);
  assert.match(manifest, /\.eq\("tracking_code", input\.trackingCode\)/);
  assert.match(manifest, /forwarding\.destination_agency !== input\.viewerAgency/);
  assert.match(manifest, /forwarding\.origin_agency !== input\.requestedAgency/);
  assert.match(manifest, /forwarding\.status !== "ARRIVAL_CONFIRMED"/);
});

test("les homonymes d’autres feuilles sont exclus et une ambiguïté locale n’est jamais choisie", () => {
  assert.match(manifest, /row\.sourceSite === input\.agency/);
  assert.match(functions, /Math\.abs\(row\.weightKg - forwarding\.weightKg\) < 0\.001/);
  assert.match(functions, /compatible\.length === 1 \? compatible\[0\] : null/);
  assert.match(functions, /ambiguous: compatible\.length > 1/);
  assert.match(workspace, /state: "AMBIGUOUS"/);
  assert.match(workspace, /"AMBIGU"/);
});

test("les colis natifs conservent la source MANIFESTE historique", () => {
  assert.match(workspace, /: searchAgentManifestControl\(canonicalRequestedCode\)/);
  assert.match(route, /: viewerAgency/);
});

test("le contrôle MANIFESTE reste strictement en lecture seule", () => {
  for (const source of [workspace, functions, route, manifest]) {
    const relevant = source.replace(/\.update\(/g, "");
    assert.doesNotMatch(relevant, /\.insert\(|\.upsert\(|\.delete\(/);
  }
});
