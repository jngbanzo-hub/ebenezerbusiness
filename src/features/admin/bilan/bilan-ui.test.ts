import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BILAN_COHORT_OPTIONS, buildBilanQuery, monthPeriod } from "./bilan-ui";

const ui = readFileSync("src/features/admin/bilan/admin-bilan-page.tsx", "utf8");
const client = readFileSync("src/features/admin/bilan/bilan-client.ts", "utf8");
const page = readFileSync("src/app/admin/bilan/page.tsx", "utf8");
const nav = readFileSync("src/features/admin/admin-workspace.tsx", "utf8");

test("page Admin et navigation Bilan sont additives",()=>{assert.match(page,/AdminBilanPage/);assert.match(nav,/href: "\/admin\/bilan"/);assert.match(ui,/getAdminProfile/);});
test("cohortes V1 et période août sont explicites",()=>{assert.deepEqual(BILAN_COHORT_OPTIONS.map(item=>item.prefix),["JL","AT","SE"]);assert.deepEqual(monthPeriod(2026,8),{from:"2026-08-01",to:"2026-08-31"});assert.equal(buildBilanQuery("AT",monthPeriod(2026,8)),"cohort=AT&startDate=2026-08-01&endDate=2026-08-31");});
test("interface consomme uniquement GET api admin bilan",()=>{assert.match(client,/\/api\/admin\/bilan\?/);assert.match(client,/authenticatedRead/);assert.doesNotMatch(client+ui,/method:\s*["'](?:POST|PUT|PATCH|DELETE)/);assert.doesNotMatch(client+ui,/\.(?:insert|update|upsert|delete)\s*\(/);});
test("rend les références août, transit, charges et qualité sans calcul métier dupliqué",()=>{for(const text of ["Poids période","Écart cohorte / période","MONTANT ATTENDU NON CERTIFIÉ","CHARGES DIRECTES NON IMPUTÉES","DHL + destination LSHI","Poids officiel — colonne E","1,7 USD/kg","TF Bénin transféré à la trésorière","MARGE PROVISOIRE — PÉRIMÈTRE CERTIFIÉ","Qualité des données"])assert.match(ui,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));});
test("n'expose aucune commande métier",()=>{for(const text of ["Enregistrer le paiement","Créer une dépense","Confirmer l’arrivée","Confirmer le départ"])assert.doesNotMatch(ui,new RegExp(text));});
test("affiche la ventilation certifiée par agence sans présenter le solde partiel comme définitif",()=>{for(const text of ["Expédié certifié","Solde arithmétique","Données partielles"])assert.match(ui+readFileSync("src/features/admin/bilan/bilan-ui.ts","utf8"),new RegExp(text,"i"));assert.doesNotMatch(ui,/Reste définitif/i);assert.doesNotMatch(ui,/passage FIH à confirmer/i);assert.doesNotMatch(ui,/BÉNÉFICE DÉFINITIF/);assert.doesNotMatch(ui,/reste à transférer/i);});
