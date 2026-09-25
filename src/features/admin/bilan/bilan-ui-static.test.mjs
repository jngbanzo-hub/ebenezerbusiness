import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("src/features/admin/bilan/admin-bilan-page.tsx", "utf8");
const contracts = readFileSync("src/features/admin/bilan/bilan-ui.ts", "utf8");
const client = readFileSync("src/features/admin/bilan/bilan-client.ts", "utf8");
const page = readFileSync("src/app/admin/bilan/page.tsx", "utf8");
const nav = readFileSync("src/features/admin/admin-workspace.tsx", "utf8");

test("la synthèse certifiée reste additive et distincte des compteurs officiels", () => {
  const service = readFileSync("src/features/admin/bilan/bilan-service.ts", "utf8");
  assert.ok(service.includes("aggregateCohortPayments(paymentsRead.rows, query.cohort.id)"));
  assert.ok(ui.includes("data.payments.receivedAmount"));
  assert.ok(ui.includes("data.payments.paymentCount"));
  assert.ok(ui.includes("data.payments.completePayments"));
  assert.ok(ui.includes("data.payments.partialPayments"));
  assert.ok(ui.includes("<CertifiedAgencySummary audit={audit}/>"));
  assert.ok(ui.includes("<ModernPaymentsCardsExisting audit={audit}/>"));
});

test("la synthèse lit directement les champs certifiés par agence sans recalcul métier", () => {
  const summary = ui.split("function CertifiedAgencySummary")[1].split("function ModernPaymentsCardsExisting")[0];
  for (const field of ["total", "settled", "partial", "unpaidCertified", "toVerify", "currentDebts", "futureDebts", "isolatedPhysical", "certifiedPaidUsd", "certifiedRemainingUsd"]) {
    assert.ok(summary.includes(`item.${field}`), field);
  }
  assert.ok(summary.includes("agencies.map((agency) =>"));
  assert.ok(summary.includes("audit.activeCohortId"));
  for (const forbidden of [".reduce(", "expectedUsd", "manifestF", "manifestL", "manifestM", "receivedAmount", "paymentCount", "completePayments", "partialPayments", "physicalMatches"]) {
    assert.ok(!summary.includes(forbidden), forbidden);
  }
});

test("prix commercial absent et NULL restent visibles sans zéro inventé", () => {
  const summary = ui.split("function CertifiedAgencySummary")[1].split("function ModernPaymentsCardsExisting")[0];
  assert.ok(summary.includes("<dt>TOTAL PRIX COMMERCIAL</dt><dd>MANQUANT</dd>"));
  assert.ok(summary.includes('item.certifiedRemainingUsd === null ? "NON CERTIFIABLE" : usd(item.certifiedRemainingUsd)'));
  assert.ok(!summary.includes("?? 0"));
  assert.ok(!summary.includes("|| 0"));
});

test("une certification moderne indisponible reste isolée du Bilan officiel", () => {
  assert.ok(ui.includes('data.meta.cohortId >= "2026-08"'));
  assert.ok(ui.includes('audit.activeCohortId < "2026-08"'));
  assert.ok(ui.includes("hasUsableModernAudit(payload.modernManifestAudit, data.meta.cohortId)"));
  assert.ok(ui.includes('setAudit(null); setError("DONNÉES CERTIFIÉES INDISPONIBLES")'));
  assert.ok(ui.includes("{data ? <BilanView data={data}/> : null}"));
  assert.ok(ui.includes('error?<p role="alert"'));
});

test("page Admin et navigation Bilan sont additives",()=>{assert.match(page,/AdminBilanPage/);assert.match(nav,/href: "\/admin\/bilan"/);assert.match(ui,/getAdminProfile/);});
test("les cohortes et le mois automatique viennent du registre persistant unique",()=>{const registry=readFileSync("src/features/admin/bilan/cohort-registry.ts","utf8");assert.doesNotMatch(registry,/cohort\("(?:JL|AT|SE)"/);assert.match(ui,/loadOriginMonths\(session.access_token\)/);assert.match(ui,/definitions.map/);assert.doesNotMatch(ui,/periodMonth|type="month"/);assert.match(ui,/AUTOMATIQUE/);assert.match(contracts,/startDate/);assert.match(contracts,/endDate/);});
test("zone de pilotage distingue mois d’origine et période d’analyse",()=>{for(const text of ["Zone de pilotage du bilan","Mois d’origine","Période","Afficher le bilan","Le préfixe du code détermine le mois d’origine du colis. La période d’analyse ne change jamais son mois d’origine."])assert.match(ui,new RegExp(text));assert.match(ui,/grid gap-5 md:grid-cols-2/);assert.doesNotMatch(ui,/Cohorte comptable/);});
test("tableau de direction contient les cartes additives Charges fixes, Prime et Bénéfice",()=>{for(const text of ["Activité du mois d’origine","Expéditions du mois d’origine","Encaissements","Charges directes","Charges fixes","Dépenses opérationnelles","Prime du mois","Trésorerie","Bénéfice par agence","Résultat financier","Qualité des données"])assert.ok(ui.includes(`title:\"${text}\"`),text);assert.match(ui,/sm:grid-cols-2 xl:grid-cols-4/);assert.match(ui,/cards\.map\(/);});
test("un seul panneau de détail est piloté au clavier et fermé par défaut",()=>{assert.match(ui,/useState<BilanSectionId \| null>\(null\)/);assert.match(ui,/aria-expanded=\{selected\}/);assert.match(ui,/aria-controls=\"bilan-detail-panel\"/);assert.match(ui,/selectedSection&&selectedCard/);assert.match(ui,/current===card\.id\?null:card\.id/);});
test("résultat financier distingue CA, encaissements, charges fixes, prime et bénéfice",()=>{for(const text of ["Chiffre d’affaires réel","CA réel","Encaissements / trésorerie reçue","Charges fixes mensuelles","Prime totale du mois","Bénéfice avant prime","BÉNÉFICE APRÈS PRIME"])assert.ok(ui.includes(text),text);});
test("historique Expédition KLZ reste visible avec son statut anti-double-comptage",()=>{assert.match(ui,/Historique uniquement — couvert par la charge automatique Expédition KLZ/);});
test("bénéfice par agence sépare la connexion opérationnelle de la charge fixe",()=>{assert.match(ui,/Connexion opérationnelle/);assert.match(ui,/Autres dépenses hors connexion/);});
test("interface consomme uniquement GET api admin bilan",()=>{assert.match(client,/\/api\/admin\/bilan\?/);assert.match(client,/authenticatedRead/);assert.doesNotMatch(client+ui,/method:\s*["'](?:POST|PUT|PATCH|DELETE)/);assert.doesNotMatch(client+ui,/\.(?:insert|update|upsert|delete)\s*\(/);});
test("Encaissements transmettent la cohorte active et exposent les deux identités",()=>{assert.match(ui,/encaissements-certification-readonly\?cohortId=/);assert.match(ui,/splitContact/);assert.match(ui,/buildReminderRecipients/);assert.match(ui,/sender:string|null/);assert.match(ui,/243\\d\{9\}/);assert.match(ui,/activeCohortId/);});
test("rappels WhatsApp restent strictement en dry-run avec déduplication",()=>{assert.match(ui,/RAPPELS WHATSAPP — DRY-RUN/);assert.match(ui,/Prévisualiser les notifications/);assert.match(ui,/isReminderEligible/);assert.match(ui,/normaliseReminderPhone/);assert.match(ui,/DESTINATAIRES UNIQUES/);assert.match(ui,/byPhone/);assert.doesNotMatch(ui,/360dialog\s*\(/);assert.doesNotMatch(ui,/messages\/send/);});
test("contrat destinataires couvre les cas de sécurité du dry-run",()=>{for(const text of ["recipientType", "SENDER", "BENEFICIARY", "roles", "PHONE_ABSENT_OR_INVALID", "DEBT_NOT_CERTIFIED", "NON PAYÉ", "PARTIEL", "À VÉRIFIER", "SOLDÉ", "forwardingId"])assert.match(ui+readFileSync("src/app/api/admin/encaissements-certification-readonly/route.ts","utf8"),new RegExp(text.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")));});
test("rend activité, transit, charges, prime et qualité sans logique métier dupliquée",()=>{for(const text of ["Poids période","Écart mois d’origine / période","MONTANT ATTENDU NON CERTIFIÉ","CHARGES DIRECTES NON IMPUTÉES","DHL + destination LSHI","Poids officiel — colonne E","TF Bénin transféré à la trésorière","BÉNÉFICE APRÈS PRIME","Qualité des données"])assert.ok(ui.includes(text),text);});
test("sépare Déclarant LSHI standard, Déclarant LSHI DHL et Transit",()=>{for(const text of ["Déclarant LSHI standard","58 USD/groupage · hors DHL","Déclarant LSHI DHL","2,8 USD/kg · poids officiel colonne E","Transit FIH → LSHI"])assert.ok(ui.includes(text),text);});
test("n'expose aucune commande métier",()=>{for(const text of ["Enregistrer le paiement","Créer une dépense","Confirmer l’arrivée","Confirmer le départ"])assert.doesNotMatch(ui,new RegExp(text));});
test("ventilation pondérale par agence reste explicite et non définitive si partielle",()=>{for(const text of ["Expédié certifié","Solde arithmétique"])assert.match(ui,new RegExp(text));assert.match(contracts,/DONNÉES PARTIELLES/);assert.doesNotMatch(ui,/Reste définitif/i);assert.doesNotMatch(ui,/passage FIH à confirmer/i);assert.doesNotMatch(ui,/BÉNÉFICE DÉFINITIF/);assert.doesNotMatch(ui,/reste à transférer/i);});
