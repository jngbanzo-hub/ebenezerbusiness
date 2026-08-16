import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const service=readFileSync(new URL("./admin-parcel-history.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/admin/parcel-history/[code]/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../features/admin/admin-parcel-history.tsx",import.meta.url),"utf8");
const searchUi=readFileSync(new URL("../features/admin/admin-global-parcel-search.tsx",import.meta.url),"utf8");

test("réutilise exclusivement l'orchestrateur global",()=>{assert.match(service,/searchAdminParcelGlobally/);assert.doesNotMatch(service,/createClient|readAdminManifestRows|readAdminPayments/);});
test("API Admin strictement en lecture seule",()=>{assert.match(route,/authorizeAdminRequest/);assert.match(route,/export async function GET/);assert.doesNotMatch(route,/POST|PUT|PATCH|DELETE/);});
test("la fiche sépare état, chronologie et dates non fiables",()=>{for(const label of ["ÉTAT ACTUEL","HISTORIQUE CHRONOLOGIQUE","Informations sans horodatage fiable","INCOHÉRENCE À VÉRIFIER","AUCUN HISTORIQUE TROUVÉ"])assert.match(ui,new RegExp(label));});
test("aucune action métier et lien naturel depuis la recherche",()=>{assert.match(searchUi,/Voir l’historique complet/);for(const forbidden of ["Payer","Corriger QR","Révoquer","Modifier Stockage"])assert.doesNotMatch(ui,new RegExp(forbidden));});
test("les suffixes sont conservés et les événements multiples projetés",()=>{assert.match(service,/result\.payments\.matches\.forEach/);assert.match(service,/item\.events\.forEach/);assert.doesNotMatch(service,/replace\(.+\[BCD\]/);});
