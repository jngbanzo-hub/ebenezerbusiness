import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service=readFileSync("src/server/admin-parcel-history.ts","utf8");
const ui=readFileSync("src/features/admin/admin-parcel-history.tsx","utf8");
const search=readFileSync("src/features/admin/admin-global-parcel-search.tsx","utf8");

test("ajoute uniquement les expéditions réellement lues",()=>{assert.match(service,/result\.shipments\.matches\.forEach/);assert.match(service,/type: "EXPÉDITION"/);assert.doesNotMatch(service,/En Transit à Addis.*events\.push/);});
test("offre tous les filtres demandés en consultation locale",()=>{for(const label of ["Date de début","Date de fin","Agence","Statut","Type d’événement","Groupage","Source","Aujourd’hui","Hier","Cette semaine","Ce mois"])assert.match(ui,new RegExp(label));assert.match(ui,/matchesFilters/);});
test("affiche l'expédition et un état vide contrôlé",()=>{for(const label of ["EXPÉDITION","Groupage principal","Date d’expédition","Compagnie","Statut groupage","Aucune information d’expédition trouvée"])assert.match(search,new RegExp(label));});
