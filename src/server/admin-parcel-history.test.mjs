import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { determineParcelConsistency } from "./admin-parcel-consistency.ts";

const service=readFileSync(new URL("./admin-parcel-history.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/admin/parcel-history/[code]/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../features/admin/admin-parcel-history.tsx",import.meta.url),"utf8");
const searchUi=readFileSync(new URL("../features/admin/admin-global-parcel-search.tsx",import.meta.url),"utf8");

test("réutilise exclusivement l'orchestrateur global",()=>{assert.match(service,/searchAdminParcelGlobally/);assert.doesNotMatch(service,/createClient|readAdminManifestRows|readAdminPayments/);});
test("API Admin strictement en lecture seule",()=>{assert.match(route,/authorizeAdminRequest/);assert.match(route,/export async function GET/);assert.doesNotMatch(route,/POST|PUT|PATCH|DELETE/);});
test("la fiche sépare état, chronologie et dates non fiables",()=>{for(const label of ["ÉTAT ACTUEL","HISTORIQUE CHRONOLOGIQUE","Informations sans horodatage fiable","INCOHÉRENCE À VÉRIFIER","AUCUN HISTORIQUE TROUVÉ"])assert.match(ui,new RegExp(label));});
test("aucune action métier et lien naturel depuis la recherche",()=>{assert.match(searchUi,/Voir l’historique complet/);for(const forbidden of ["Payer","Corriger QR","Révoquer","Modifier Stockage"])assert.doesNotMatch(ui,new RegExp(forbidden));});
test("les suffixes sont conservés et les événements multiples projetés",()=>{assert.match(service,/result\.payments\.matches\.forEach/);assert.match(service,/item\.events\.forEach/);assert.doesNotMatch(service,/replace\(.+\[BCD\]/);});
test("plusieurs lignes MANIFESTE ne deviennent pas une incohérence",()=>{const value=determineParcelConsistency({manifest:[{agency:"FIH",rowNumber:958},{agency:"LSHI",rowNumber:4291},{agency:"KLZ",rowNumber:652}],qr:[],storage:[]});assert.equal(value.state,"MULTIPLE_MANIFEST_MATCHES");assert.deepEqual(value.inconsistencies,[]);});
test("un colis identique sur toutes les sources est cohérent",()=>{const value=determineParcelConsistency({manifest:[{agency:"FIH",rowNumber:1}],qr:[{agency:"FIH"}],storage:[{agency:"FIH",status:"AVAILABLE"}]});assert.equal(value.state,"COHERENT");});
test("une vraie contradiction entre sources actuelles reste signalée",()=>{const value=determineParcelConsistency({manifest:[{agency:"FIH",rowNumber:1}],qr:[{agency:"FIH"}],storage:[{agency:"LSHI",status:"AVAILABLE"}]});assert.equal(value.state,"INCONSISTENT");assert.match(value.inconsistencies[0],/MANIFESTE canonique = FIH.*QR actif = FIH.*Stockage actif = LSHI/);});
test("un stockage historique livré ne crée pas de contradiction actuelle",()=>{const value=determineParcelConsistency({manifest:[{agency:"KLZ",rowNumber:1}],qr:[{agency:"KLZ"}],storage:[{agency:"LSHI",status:"DELIVERED"}]});assert.equal(value.state,"COHERENT");});
