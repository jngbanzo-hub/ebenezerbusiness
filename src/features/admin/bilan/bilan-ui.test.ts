import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "./bilan-test-context";

import { buildBilanQuery, monthPeriod } from "./bilan-ui";
import { getBilanCohorts } from "./cohort-registry";

const ui = readFileSync("src/features/admin/bilan/admin-bilan-page.tsx", "utf8");
const client = readFileSync("src/features/admin/bilan/bilan-client.ts", "utf8");
const page = readFileSync("src/app/admin/bilan/page.tsx", "utf8");
const nav = readFileSync("src/features/admin/admin-workspace.tsx", "utf8");

test("page Admin et navigation Bilan sont additives",()=>{assert.match(page,/AdminBilanPage/);assert.match(nav,/href: "\/admin\/bilan"/);assert.match(ui,/getAdminProfile/);});
test("mois historiques et futurs proviennent du registre officiel de la requête", () => {
  const cohorts = getBilanCohorts();
  assert.deepEqual(cohorts.map(item => [item.prefix, item.id]), [
    ["JL", "2026-07"], ["AT", "2026-08"], ["SE", "2026-09"],
    ["OT", "2026-10"], ["NV", "2026-11"], ["DC", "2026-12"], ["JN", "2027-01"]
  ]);
  const august = cohorts.find(item => item.prefix === "AT");
  assert.ok(august);
  const period = monthPeriod(august.year, august.month);
  assert.deepEqual(period, { from: "2026-08-01", to: "2026-08-31" });
  assert.equal(buildBilanQuery(august.prefix, period), "cohort=AT&startDate=2026-08-01&endDate=2026-08-31");
});
test("zone de pilotage distingue mois d’origine et période d’analyse",()=>{for(const text of ["Zone de pilotage du bilan","Mois d’origine","Période","Afficher le bilan","Le préfixe du code détermine le mois d’origine du colis. La période d’analyse ne change jamais son mois d’origine."])assert.match(ui,new RegExp(text));assert.match(ui,/grid gap-5 md:grid-cols-2/);assert.doesNotMatch(ui,/Cohorte comptable/);});
test("tableau de direction contient les cartes additives Charges fixes, Prime et Bénéfice",()=>{for(const text of ["Activité du mois d’origine","Expéditions du mois d’origine","Encaissements","Charges directes","Charges fixes","Dépenses opérationnelles","Prime du mois","Trésorerie","Bénéfice par agence","Résultat financier","Qualité des données"])assert.ok(ui.includes(`title:\"${text}\"`),text);assert.match(ui,/sm:grid-cols-2 xl:grid-cols-4/);assert.match(ui,/cards\.map\(/);});
test("un seul panneau de détail est piloté au clavier et fermé par défaut",()=>{assert.match(ui,/useState<BilanSectionId \| null>\(null\)/);assert.match(ui,/aria-expanded=\{selected\}/);assert.match(ui,/aria-controls=\"bilan-detail-panel\"/);assert.match(ui,/selectedSection&&selectedCard/);assert.match(ui,/current===card\.id\?null:card\.id/);});
test("résultat financier distingue CA, encaissements, charges fixes, prime et bénéfice",()=>{assert.match(ui,/Chiffre d’affaires réel/);assert.match(ui,/CA réel/);assert.match(ui,/Encaissements \/ trésorerie reçue/);assert.match(ui,/Charges fixes mensuelles/);assert.match(ui,/Prime totale du mois/);assert.match(ui,/Bénéfice avant prime/);assert.match(ui,/BÉNÉFICE APRÈS PRIME/);});
test("historique Expédition KLZ reste visible avec son statut anti-double-comptage",()=>{assert.match(ui,/Historique uniquement — couvert par la charge automatique Expédition KLZ/);});
test("bénéfice par agence sépare la connexion opérationnelle de la charge fixe",()=>{assert.match(ui,/Connexion opérationnelle/);assert.match(ui,/Autres dépenses hors connexion/);});
test("interface consomme uniquement GET api admin bilan",()=>{assert.match(client,/\/api\/admin\/bilan\?/);assert.match(client,/authenticatedRead/);assert.doesNotMatch(client+ui,/method:\s*["'](?:POST|PUT|PATCH|DELETE)/);assert.doesNotMatch(client+ui,/\.(?:insert|update|upsert|delete)\s*\(/);});
test("rend les références août, transit, charges, prime et qualité sans calcul métier dupliqué",()=>{for(const text of ["Poids période","Écart mois d’origine / période","MONTANT ATTENDU NON CERTIFIÉ","CHARGES DIRECTES NON IMPUTÉES","DHL + destination LSHI","Poids officiel — colonne E","1,7 USD/kg","TF Bénin transféré à la trésorière","BÉNÉFICE APRÈS PRIME","Qualité des données"])assert.match(ui,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));});
test("n'expose aucune commande métier",()=>{for(const text of ["Enregistrer le paiement","Créer une dépense","Confirmer l’arrivée","Confirmer le départ"])assert.doesNotMatch(ui,new RegExp(text));});
test("affiche la ventilation certifiée par agence sans présenter le solde partiel comme définitif",()=>{for(const text of ["Expédié certifié","Solde arithmétique","Données partielles"])assert.match(ui+readFileSync("src/features/admin/bilan/bilan-ui.ts","utf8"),new RegExp(text,"i"));assert.doesNotMatch(ui,/Reste définitif/i);assert.doesNotMatch(ui,/passage FIH à confirmer/i);assert.doesNotMatch(ui,/BÉNÉFICE DÉFINITIF/);assert.doesNotMatch(ui,/reste à transférer/i);});
