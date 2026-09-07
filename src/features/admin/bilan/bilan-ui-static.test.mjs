import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("src/features/admin/bilan/admin-bilan-page.tsx", "utf8");
const contracts = readFileSync("src/features/admin/bilan/bilan-ui.ts", "utf8");
const client = readFileSync("src/features/admin/bilan/bilan-client.ts", "utf8");
const page = readFileSync("src/app/admin/bilan/page.tsx", "utf8");
const nav = readFileSync("src/features/admin/admin-workspace.tsx", "utf8");

test("page Admin et navigation Bilan sont additives",()=>{assert.match(page,/AdminBilanPage/);assert.match(nav,/href: "\/admin\/bilan"/);assert.match(ui,/getAdminProfile/);});
test("cohortes V1 et période août sont explicites",()=>{for(const value of ["JL","AT","SE"])assert.match(contracts,new RegExp(value));for(const value of ["2026-08","2026-08-01","2026-08-31"])assert.match(ui,new RegExp(value));assert.match(contracts,/startDate/);assert.match(contracts,/endDate/);});
test("zone de pilotage distingue mois d’origine et période d’analyse",()=>{for(const text of ["Zone de pilotage du bilan","Mois d’origine","Période","Afficher le bilan","Le préfixe du code détermine le mois d’origine du colis. La période d’analyse ne change jamais son mois d’origine."])assert.match(ui,new RegExp(text));assert.match(ui,/grid gap-5 md:grid-cols-2/);assert.doesNotMatch(ui,/Cohorte comptable/);});
test("tableau de direction contient les cartes additives Charges fixes et Bénéfice par agence",()=>{for(const text of ["Activité du mois d’origine","Expéditions du mois d’origine","Encaissements","Charges directes","Charges fixes","Dépenses opérationnelles","Trésorerie","Bénéfice par agence","Résultat financier","Qualité des données"])assert.ok(ui.includes(`title:\"${text}\"`),text);assert.match(ui,/sm:grid-cols-2 xl:grid-cols-4/);assert.match(ui,/cards\.map\(/);});
test("un seul panneau de détail est piloté au clavier et fermé par défaut",()=>{assert.match(ui,/useState<BilanSectionId \| null>\(null\)/);assert.match(ui,/aria-expanded=\{selected\}/);assert.match(ui,/aria-controls=\"bilan-detail-panel\"/);assert.match(ui,/selectedSection&&selectedCard/);assert.match(ui,/current===card\.id\?null:card\.id/);});
test("résultat financier distingue CA, encaissements, charges fixes et bénéfice sans double comptage",()=>{assert.match(ui,/Chiffre d’affaires réel/);assert.match(ui,/CA réel/);assert.match(ui,/Encaissements \/ trésorerie reçue/);assert.match(ui,/Déclarant et charges fixes Agent exclus/);assert.match(ui,/Charges fixes mensuelles/);assert.match(ui,/Calculé sur le CA réel, jamais sur les encaissements/);});
test("historique Expédition KLZ reste visible avec son statut anti-double-comptage",()=>{assert.match(ui,/Historique uniquement — couvert par la charge automatique Expédition KLZ/);});
test("bénéfice par agence sépare la connexion opérationnelle de la charge fixe",()=>{assert.match(ui,/Connexion opérationnelle/);assert.match(ui,/Autres dépenses hors connexion/);});
test("interface consomme uniquement GET api admin bilan",()=>{assert.match(client,/\/api\/admin\/bilan\?/);assert.match(client,/authenticatedRead/);assert.doesNotMatch(client+ui,/method:\s*["'](?:POST|PUT|PATCH|DELETE)/);assert.doesNotMatch(client+ui,/\.(?:insert|update|upsert|delete)\s*\(/);});
test("rend activité, transit, charges et qualité sans logique métier dupliquée",()=>{for(const text of ["Poids période","Écart mois d’origine / période","MONTANT ATTENDU NON CERTIFIÉ","CHARGES DIRECTES NON IMPUTÉES","DHL + destination LSHI","Poids officiel — colonne E","TF Bénin transféré à la trésorière","BÉNÉFICE RÉEL","Qualité des données"])assert.ok(ui.includes(text),text);});
test("sépare Déclarant LSHI standard, Déclarant LSHI DHL et Transit",()=>{for(const text of ["Déclarant LSHI standard","58 USD/groupage · hors DHL","Déclarant LSHI DHL","2,8 USD/kg · poids officiel colonne E","Transit FIH → LSHI"])assert.ok(ui.includes(text),text);});
test("n'expose aucune commande métier",()=>{for(const text of ["Enregistrer le paiement","Créer une dépense","Confirmer l’arrivée","Confirmer le départ"])assert.doesNotMatch(ui,new RegExp(text));});
test("ventilation pondérale par agence reste explicite et non définitive si partielle",()=>{for(const text of ["Expédié certifié","Solde arithmétique"])assert.match(ui,new RegExp(text));assert.match(contracts,/DONNÉES PARTIELLES/);assert.doesNotMatch(ui,/Reste définitif/i);assert.doesNotMatch(ui,/passage FIH à confirmer/i);assert.doesNotMatch(ui,/BÉNÉFICE DÉFINITIF/);assert.doesNotMatch(ui,/reste à transférer/i);});
