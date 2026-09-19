"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, BarChart3, ChevronRight, CircleAlert, Landmark, LoaderCircle, PackageCheck, ReceiptText, RefreshCw, ShieldAlert, TrendingUp, WalletCards, X } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminProfile } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { formatWeight } from "@/lib/format-weight";
import { authenticatedRead } from "@/features/auth/authenticated-fetch";

import { loadAdminBilan } from "./bilan-client";
import { formatBilanStatus, monthPeriod, type BilanPayload, type BilanStatus } from "./bilan-ui";
import type { OriginMonth } from "./cohort-catalog";
import { loadOriginMonths } from "./origin-month-client";
import { buildBilanFilterQuery, createBilanFilters, createBilanRequestGuard, type BilanFilters } from "./bilan-filter-state";

const field = "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none focus:border-accent";
const agencies = ["FIH", "LSHI", "KLZ"] as const;

export function AdminBilanPage() {
  const router = useRouter(); const token = useRef("");
  const [ready, setReady] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [data, setData] = useState<BilanPayload | null>(null); const [unresolved, setUnresolved] = useState("");
  const [definitions, setDefinitions] = useState<readonly OriginMonth[]>([]);
  const [filters, setFilters] = useState<BilanFilters>({ cohort: "", mode: "MONTH", from: "", to: "" });
  const requests = useRef(createBilanRequestGuard());
  const definition = definitions.find(item => item.id === filters.cohort) ?? definitions.find(item => item.prefix === filters.cohort);
  const bounds = useMemo(() => definition ? monthPeriod(definition.year, definition.month) : { from: "", to: "" }, [definition]);

  useEffect(() => { let active = true; void (async () => { try {
    const supabase = getSupabaseBrowserClient(); const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || !session.access_token) return router.replace("/auth/sign-in");
    await getAdminProfile(session.user);
    const months = await loadOriginMonths(session.access_token);
    const initial = months.find(item => item.prefix === "AT" && item.year === 2026) ?? months.find(item => item.active) ?? months[0];
    if (active) { token.current = session.access_token; setDefinitions(months); setFilters(createBilanFilters(initial.prefix, months)); setReady(true); }
  } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Registre indisponible — Bilan non certifié."); }
  })(); return () => { active = false; token.current = ""; }; }, [router]);
  useEffect(() => { if (ready) void load(); }, [ready, filters.cohort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const guard = requests.current; return () => guard.invalidate(); }, []);

  function changeFilters(next: BilanFilters) {
    requests.current.invalidate();
    setData(null); setUnresolved(""); setError(""); setLoading(false);
    setFilters(next);
  }

  async function load() {
    if (!token.current) return;
    const request = requests.current.begin();
    setLoading(true); setData(null); setError(""); setUnresolved("");
    try {
      const query = buildBilanFilterQuery(filters, definitions);
      const result = await loadAdminBilan(token.current, query, request.signal);
      if (!request.isCurrent()) return;
      if ("code" in result) { setUnresolved(result.requested); } else setData(result);
    }
    catch (cause) { if (request.isCurrent()) { setData(null); setError(cause instanceof Error ? cause.message : "Source BILAN temporairement indisponible."); } }
    finally { if (request.isCurrent()) setLoading(false); }
  }

  return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container>
    <header><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-accent"><ArrowLeft className="h-4 w-4"/>Retour au tableau de bord Admin</Link><div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">BILAN</h1>{data ? <StatusBadge status={data.meta.status}/> : null}</div><p className="mt-2 text-sm text-muted-foreground">Lecture, agrégation et présentation uniquement — aucune écriture métier.</p></header>
    <Link href="/admin/bilan/mois-origine" className="mt-4 inline-block text-accent">Gérer les mois d’origine</Link>
    {definition ? <section className="mt-8" aria-label="Zone de pilotage du bilan">
      <div className="grid gap-5 md:grid-cols-2">
        <GlassPanel className="border-accent/20 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-accent">Mois d’origine</p><label className="mt-4 block text-sm">Mois d’origine<select className={field} value={filters.cohort} onChange={event=>changeFilters(createBilanFilters(event.target.value, definitions))}>{definitions.map(option=>option.active ? <option key={option.id} value={option.id}>{option.prefix} — {option.label}</option> : null)}</select></label><p className="mt-3 text-xs text-muted-foreground">Le préfixe du code détermine le mois d’origine du colis. La période d’analyse ne change jamais son mois d’origine. Les mois inactifs restent protégés dans l’historique.</p></GlassPanel>
        <GlassPanel className="border-primary/20 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#AFC7FF]">Période</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant={filters.mode==="MONTH"?"growth":"outline"} onClick={()=>changeFilters({...filters,mode:"MONTH"})}>Mois / année</Button>
            <Button type="button" variant={filters.mode==="CUSTOM"?"growth":"outline"} onClick={()=>changeFilters({...filters,mode:"CUSTOM"})}>Dates personnalisées</Button>
          </div>
          {filters.mode==="MONTH" ? <div className="mt-4" aria-label="Période mensuelle automatique"><p>{definition.label}</p><Badge>AUTOMATIQUE</Badge></div> : <>
            <p className="mt-4 text-sm">Analyse personnalisée — mois d’origine {definition.prefix}/{definition.label}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input label="Date de début" value={filters.from} min={bounds.from} max={bounds.to} onChange={from=>changeFilters({...filters,from})}/>
              <Input label="Date de fin" value={filters.to} min={bounds.from} max={bounds.to} onChange={to=>changeFilters({...filters,to})}/>
            </div>
          </>}
          <p className="mt-3 text-xs text-muted-foreground">Utilisée uniquement pour les indicateurs de période. Les colis restent rattachés au mois d’origine ; les charges fixes restent le forfait mensuel.</p>
        </GlassPanel>
      </div>
      <Button className="mt-5" variant="growth" onClick={()=>void load()} disabled={!ready||loading}>{loading?<LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>:<RefreshCw className="mr-2 h-4 w-4"/>}Afficher le bilan</Button>
    </section> : null}
    {loading && !data ? <State icon={<LoaderCircle className="h-8 w-8 animate-spin text-accent"/>} title="Chargement du BILAN…"/> : null}
    {error ? <State icon={<CircleAlert className="h-8 w-8 text-amber-200"/>} title="Source indisponible" detail={error}/> : null}
    {unresolved ? <State icon={<BarChart3 className="h-8 w-8 text-muted-foreground"/>} title="COHORTE NON RÉSOLUE" detail={`Aucun mois n’a été inventé pour ${unresolved}.`}/> : null}
    {data ? <BilanView data={data}/> : null}
  </Container></main>;
}

type BilanSectionId = "activity" | "shipments" | "payments" | "direct-costs" | "air-freight" | "fixed-costs" | "expenses" | "monthly-bonuses" | "treasury" | "agency-profits" | "results" | "quality";

function BilanView({data}:{data:BilanPayload}) {
  const [selectedSection,setSelectedSection] = useState<BilanSectionId | null>(null);
  const cards: ReadonlyArray<{id:BilanSectionId;title:string;icon:React.ReactNode;lines:string[];status?:BilanStatus;featured?:boolean}> = [
    {id:"activity",title:"Activité du mois d’origine",icon:<Activity className="h-5 w-5"/>,lines:[`Enregistré : ${kg(data.shipment.registeredCohortWeightKg)}`,`Expédié certifié : ${kg(data.shipment.certifiedShippedWeightKg)}`,`Restant : ${kg(data.shipment.remainingWeightKg)}`],status:data.shipment.status},
    {id:"shipments",title:"Expéditions du mois d’origine",icon:<PackageCheck className="h-5 w-5"/>,lines:[...agencies.map(agency=>`${agency} : ${kg(data.shipment.byAgency[agency].certifiedShippedWeightKg)}`),`Restant total : ${kg(data.shipment.remainingWeightKg)}`]},
    {id:"payments",title:"Encaissements",icon:<WalletCards className="h-5 w-5"/>,lines:[usd(data.payments.receivedAmount),`${data.payments.paymentCount} paiements`,`${data.payments.completePayments} complets · ${data.payments.partialPayments} partiels`]},
    {id:"direct-costs",title:"Charges directes",icon:<ReceiptText className="h-5 w-5"/>,lines:[`Imputées : ${usd(data.directCosts.totalAllocatedUsd)}`,`Non imputées : ${usd(data.directCosts.totalUnallocatedUsd)}`]},
    {id:"air-freight",title:"Coût d’expédition du mois",icon:<ReceiptText className="h-5 w-5"/>,lines:[`FIH : ${usd(data.airFreight.byAgency.FIH)}`,`LSHI : ${usd(data.airFreight.byAgency.LSHI)}`,`TOTAL : ${usd(data.airFreight.totalUsd)}`],status:data.airFreight.status},
    {id:"fixed-costs",title:"Charges fixes",icon:<Landmark className="h-5 w-5"/>,lines:[`COO : ${usd(data.fixedCosts.byAgency.COO)}`,`FIH : ${usd(data.fixedCosts.byAgency.FIH)}`,`LSHI : ${usd(data.fixedCosts.byAgency.LSHI)}`,`TOTAL : ${usd(data.fixedCosts.totalUsd)}`]},
    {id:"expenses",title:"Dépenses opérationnelles",icon:<BarChart3 className="h-5 w-5"/>,lines:data.periodExpenses?[`Historique USD : ${currency(data.periodExpenses.byCurrency,"USD")}`,`Déductible USD : ${currency(data.periodExpenses.deductibleByCurrency,"USD")}`,"Déclarant et charges fixes Agent exclus du bénéfice"]:["NON CALCULABLE"]},
    {id:"monthly-bonuses",title:"Prime du mois",icon:<ReceiptText className="h-5 w-5"/>,lines:[`COO : ${usd(data.monthlyBonuses.byAgency.COO)}`,`FIH : ${usd(data.monthlyBonuses.byAgency.FIH)}`,`LSHI : ${usd(data.monthlyBonuses.byAgency.LSHI)}`,`KLZ : ${usd(data.monthlyBonuses.byAgency.KLZ)}`,`TOTAL : ${usd(data.monthlyBonuses.totalUsd)}`],status:data.monthlyBonuses.status},
    {id:"treasury",title:"Trésorerie",icon:<Landmark className="h-5 w-5"/>,lines:data.treasury?["TF Bénin",currencyLine(data.treasury.tfBeninByCurrency)]:["Aucune donnée disponible"]},
    {id:"agency-profits",title:"Bénéfice par agence",icon:<TrendingUp className="h-5 w-5"/>,lines:[`FIH : ${usd(data.results.finalProfit.byAgency.FIH.amountUsd)}`,`LSHI : ${usd(data.results.finalProfit.byAgency.LSHI.amountUsd)}`,`KLZ : ${usd(data.results.finalProfit.byAgency.KLZ.amountUsd)}`,`EEB consolidé : ${usd(data.results.finalProfit.consolidatedUsd)}`],status:data.results.finalProfit.status},
    {id:"results",title:"Résultat financier",icon:<TrendingUp className="h-5 w-5"/>,featured:true,lines:[`CA réel : ${usd(data.results.realRevenue.totalUsd)}`,`Prime totale : ${data.monthlyBonuses.status==="A_DEFINIR"?"À DÉFINIR":usd(data.monthlyBonuses.totalUsd)}`,`Coût aérien : ${usd(data.airFreight.totalUsd)}`,`Bénéfice final : ${usd(data.results.finalProfit.consolidatedUsd)}`],status:data.results.finalProfit.status},
    {id:"quality",title:"Qualité des données",icon:<ShieldAlert className="h-5 w-5"/>,lines:[`${data.dataQuality.length} anomalie(s) réelle(s)`,`${data.payments.unmatchedPayments} paiement(s) non rapproché(s)`,`${data.directCosts.unallocated.length} charge(s) non imputée(s)`],status:data.dataQuality.length?"ANOMALIE":"CERTIFIE"}
  ];
  const selectedCard = cards.find(card=>card.id===selectedSection);
  return <div className="mt-8">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Synthèse du bilan">
      {cards.map(card=><BilanSummaryCard key={card.id} {...card} selected={selectedSection===card.id} onToggle={()=>setSelectedSection(current=>current===card.id?null:card.id)}/>) }
    </div>
    {selectedSection&&selectedCard?<section id="bilan-detail-panel" aria-label={`Détails — ${selectedCard.title}`} className="mt-6 scroll-mt-6"><GlassPanel className="p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><h2 className="text-xl font-semibold">Détails — {selectedCard.title}</h2><Button type="button" variant="outline" size="sm" onClick={()=>setSelectedSection(null)}><X className="mr-2 h-4 w-4"/>Fermer</Button></div><div className="mt-6"><BilanSectionDetail section={selectedSection} data={data}/></div><p className="mt-6 text-xs text-muted-foreground">Sources lues : {data.meta.sources.join(" · ")}</p></GlassPanel></section>:null}
  </div>;
}

function BilanSummaryCard({title,icon,lines,status,featured,selected,onToggle}:{title:string;icon:React.ReactNode;lines:string[];status?:BilanStatus;featured?:boolean;selected:boolean;onToggle:()=>void}) {
  return <button type="button" aria-expanded={selected} aria-controls="bilan-detail-panel" onClick={onToggle} className={`min-h-52 rounded-xl border p-5 text-left shadow-glass transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selected?"border-accent bg-accent/15 -translate-y-0.5":featured?"border-primary/50 bg-primary/10 hover:border-primary":"border-white/10 bg-white/[0.05] hover:border-white/25 hover:bg-white/[0.08]"}`}><div className="flex items-start justify-between gap-3"><span className={featured?"text-[#AFC7FF]":"text-accent"}>{icon}</span>{status?<StatusBadge status={status}/>:null}</div><h2 className="mt-4 text-base font-semibold">{title}</h2><div className="mt-3 space-y-1">{lines.slice(0,4).map(line=><p key={line} className="text-sm text-muted-foreground">{line}</p>)}</div><span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">Voir détails<ChevronRight className={`h-4 w-4 transition-transform ${selected?"rotate-90":""}`}/></span></button>;
}

function BilanSectionDetail({section,data}:{section:BilanSectionId;data:BilanPayload}) {
  if(section==="activity") return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{agencies.map(agency=>{const item=data.shipment.byAgency[agency];return <Metric key={agency} title={agency} value={kg(item.registeredWeightKg)} lines={[`Expédié : ${kg(item.certifiedShippedWeightKg)}`,`Restant : ${kg(item.remainingWeightKg)}`,formatBilanStatus(item.status)]}/>})}<Metric title="TOTAL DU MOIS D’ORIGINE" value={kg(data.activity.totalCohortWeightKg)} lines={[`Poids période : ${nullableKg(data.activity.periodRegisteredWeightKg)}`,`Écart mois d’origine / période : ${nullableKg(data.activity.cohortPeriodDifferenceKg)}`]}/></div>;
  if(section==="shipments") return <><div className="grid gap-4 md:grid-cols-3">{agencies.map(agency=>{const item=data.shipment.byAgency[agency];return <Metric key={agency} title={agency} value={kg(item.certifiedShippedWeightKg)} lines={[`Enregistré : ${kg(item.registeredWeightKg)}`,`Expédié certifié : ${kg(item.certifiedShippedWeightKg)}`,`${item.status==="CERTIFIED"?"Restant":"Solde arithmétique"} : ${kg(item.remainingWeightKg)}`,formatBilanStatus(item.status),`${item.anomalies.length} anomalie(s)`,`${item.groupages} groupages · ${item.monoCohort} mono · ${item.multiCohort} multi`]}/>})}</div>{agencies.some(agency=>data.shipment.byAgency[agency].anomalies.length)?<div className="mt-4 space-y-3">{agencies.flatMap(agency=>data.shipment.byAgency[agency].anomalies.map((issue,index)=><GlassPanel key={`${agency}-${issue.type}-${issue.sourceRawCode??issue.shipmentRawCode??index}`} className="p-4"><div className="flex flex-wrap items-center gap-2"><StatusBadge status="ANOMALIE"/><p className="font-semibold">{agency} · {issue.type.replaceAll("_"," ")}</p></div><p className="mt-2 text-sm">{[issue.sourceRawCode&&`Source ${issue.sourceRawCode}`,issue.shipmentRawCode&&`Expédition ${issue.shipmentRawCode}`,issue.sourceReference,...issue.shipmentReferences].filter(Boolean).join(" · ")}</p><p className="mt-1 text-sm text-muted-foreground">Les valeurs ambiguës restent exclues du poids expédié certifié.</p></GlassPanel>))}</div>:null}</>;
  if(section==="payments") return <PaymentsDetail data={data}/>;
  if(section==="direct-costs") return <><div className="grid gap-4 md:grid-cols-3"><Metric title="Déclarant LSHI standard" value={usd(data.directCosts.declarantLshiUsd)} lines={["58 USD/groupage · hors DHL"]}/><Metric title="Déclarant LSHI DHL" value={usd(data.directCosts.declarantLshiDhlUsd)} lines={["2,8 USD/kg · poids officiel colonne E"]}/><Metric title="Déclarant FIH standard" value={usd(data.directCosts.declarantFihStandardUsd)}/><Metric title="Déclarant FIH DHL" value={usd(data.directCosts.declarantFihDhlUsd)}/><Metric title="Transit FIH → LSHI" value={usd(data.directCosts.transitFihLshiUsd)} lines={["Charge économique LSHI"]}/><Metric title="Expédition KLZ automatique" value={usd(data.directCosts.expeditionKlzUsd)} lines={["0,60 USD/kg KLZ"]}/><Metric title="Autres charges imputées" value={usd(data.directCosts.otherCertifiedUsd)}/><Metric title="TOTAL CHARGES DIRECTES IMPUTÉES" value={usd(data.directCosts.totalAllocatedUsd)}/><Metric title="CHARGES DIRECTES NON IMPUTÉES" value={usd(data.directCosts.totalUnallocatedUsd)} lines={[`${data.directCosts.unallocated.length} élément(s)`,"Séparées du total imputé"]}/></div><h3 className="mt-6 font-semibold">Transit FIH → LSHI</h3><div className="mt-4 grid gap-4 md:grid-cols-4"><Metric title="Condition" value="DHL + destination LSHI"/><Metric title="Nombre d’expéditions" value={String(data.transit.shipments)}/><Metric title="Poids officiel — colonne E" value={kg(data.transit.officialWeightKg)}/><Metric title="Montant total" value={usd(data.transit.amountUsd)} lines={["1,7 USD/kg"]}/></div></>;
  if(section==="air-freight") return <><div className="grid gap-4 md:grid-cols-3"><Metric title="FIH" value={usd(data.airFreight.byAgency.FIH)} lines={[`Ethiopian : ${usd(data.airFreight.byAgencyCompany.FIH.ETHIOPIAN)}`,`ASKY : ${usd(data.airFreight.byAgencyCompany.FIH.ASKY)}`,`DHL : ${usd(data.airFreight.byAgencyCompany.FIH.DHL)}`]}/><Metric title="LSHI" value={usd(data.airFreight.byAgency.LSHI)} lines={[`Ethiopian : ${usd(data.airFreight.byAgencyCompany.LSHI.ETHIOPIAN)}`,`ASKY : ${usd(data.airFreight.byAgencyCompany.LSHI.ASKY)}`,`DHL : ${usd(data.airFreight.byAgencyCompany.LSHI.DHL)}`]}/><Metric title="TOTAL GÉNÉRAL" value={usd(data.airFreight.totalUsd)} lines={[formatBilanStatus(data.airFreight.status),`Départs du mois : ${usd(data.airFreight.physicalMonthUsd)}`,`Mois suivants rattachés : ${usd(data.airFreight.laterMonthUsd)}`,"KLZ : aucun coût aérien"]}/></div>{data.airFreight.anomalies.length?<div className="mt-4 space-y-2">{data.airFreight.anomalies.map(item=><GlassPanel key={item} className="p-4 text-sm text-amber-100">{item}</GlassPanel>)}</div>:null}</>;
  if(section==="fixed-costs") return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{(["COO","FIH","LSHI","KLZ"] as const).map(agency=><Metric key={agency} title={agency} value={usd(data.fixedCosts.byAgency[agency])} lines={[...data.fixedCosts.definitions[agency].components]}/>) }<Metric title="TOTAL CHARGES FIXES MENSUELLES" value={usd(data.fixedCosts.totalUsd)} lines={["Charge de la période mensuelle","Indépendante des kg, colis, groupages et encaissements"]}/></div>;
  if(section==="expenses") return data.periodExpenses?<><h3 className="font-semibold">Dépenses historiques / mouvements de Caisse des agences concernées</h3><div className="mt-4"><CurrencyCards totals={data.periodExpenses.byCurrency}/></div><h3 className="mt-6 font-semibold">Dépenses déductibles du bénéfice</h3><div className="mt-4"><CurrencyCards totals={data.periodExpenses.deductibleByCurrency}/></div><p className="mt-3 text-sm text-muted-foreground">Les dépenses Agent « Déclarant », celles couvertes par les charges fixes et l’historique « Expédition KLZ » couvert par la charge automatique restent dans l’historique, mais ne sont pas déduits une seconde fois du bénéfice. COO ne possède aucune Caisse : ses dépenses déductibles supplémentaires sont uniquement des charges centrales EEB.</p><div className="mt-4 space-y-2">{Object.entries(data.periodExpenses.byCategoryAndCurrency).map(([category,totals])=><GlassPanel key={category} className="p-4"><p className="font-medium">{category}</p><p className="mt-1 text-sm text-muted-foreground">{currencyLine(totals)}</p>{category==="Expédition KLZ"?<p className="mt-2 text-xs text-accent">Historique uniquement — couvert par la charge automatique Expédition KLZ.</p>:null}</GlassPanel>)}</div></>:<Empty text="Aucune période exploitable."/>;
  if(section==="monthly-bonuses") return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{(["COO","FIH","LSHI","KLZ"] as const).map(agency=><Metric key={agency} title={`Prime ${agency}`} value={usd(data.monthlyBonuses.byAgency[agency])}/>) }<Metric title="PRIME TOTALE EEB" value={data.monthlyBonuses.status==="A_DEFINIR"?"À DÉFINIR":usd(data.monthlyBonuses.totalUsd)} lines={[formatBilanStatus(data.monthlyBonuses.status)]}/></div>{data.monthlyBonuses.rows.length?<div className="mt-6 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr><th className="p-2">Agent</th><th className="p-2">Agence</th><th className="p-2">Mois</th><th className="p-2">Prime</th><th className="p-2">Statut</th></tr></thead><tbody>{data.monthlyBonuses.rows.map(row=><tr key={row.id} className="border-t border-white/10"><td className="p-2">{row.agentName}</td><td className="p-2">{row.agency}</td><td className="p-2">{data.monthlyBonuses.monthOrigin}</td><td className="p-2">{row.amountUsd===null?"À définir":usd(row.amountUsd)}</td><td className="p-2">{formatBilanStatus(row.status)}</td></tr>)}</tbody></table></div>:<Empty text="Aucune décision Prime certifiée pour ce mois. Le bénéfice après prime reste provisoire."/>}<Button asChild className="mt-5" variant="outline"><Link href="/admin/bilan/primes">Gérer les primes mensuelles</Link></Button></>;
  if(section==="treasury") return <><h3 className="font-semibold">TF Bénin transféré à la trésorière</h3>{data.treasury?<CurrencyCards totals={data.treasury.tfBeninByCurrency}/>:<Empty text="Aucune donnée de trésorerie pour la période."/>}<p className="mt-3 text-xs text-muted-foreground">Mouvement interne de trésorerie — non inclus dans le chiffre d’affaires, les revenus, les dépenses déductibles, les charges directes ou le bénéfice.</p></>;
  if(section==="agency-profits") return <><div className="grid gap-4 md:grid-cols-3">{agencies.map(agency=>{const final=data.results.finalProfit.byAgency[agency];const base=data.results.agencyProfits.byAgency[agency];const connection=data.periodExpenses?.deductibleConnectionByAgencyAndCurrency[agency]?.USD??0;return <Metric key={agency} title={`Bénéfice final ${agency}`} value={usd(final.amountUsd)} lines={[`Après prime, avant coût aérien : ${usd(final.beforeAirFreightUsd)}`,`Coût aérien : ${usd(final.airFreightUsd)}`,`Connexion opérationnelle : ${usd(connection)}`,`Autres dépenses hors connexion : ${usd(base.operationalExpensesUsd-connection)}`,agency==="KLZ"?`Expédition KLZ ${usd(data.directCosts.expeditionKlzUsd)} déjà intégrée`:"Coût attribué au mois d’origine"]}/>})}</div><div className="mt-4 grid gap-4 md:grid-cols-2"><Metric title="Charges centrales COO" value={usd(data.results.agencyProfits.centralCoo.totalCostsUsd+data.results.profitAfterBonuses.centralCooBonusUsd)} lines={["Aucun chiffre d’affaires ni bénéfice COO",`Prime Agents COO : ${usd(data.results.profitAfterBonuses.centralCooBonusUsd)}`]}/><Metric title="BÉNÉFICE CONSOLIDÉ EEB FINAL" value={usd(data.results.finalProfit.consolidatedUsd)} lines={[formatBilanStatus(data.results.finalProfit.status),`Coût aérien total : ${usd(data.airFreight.totalUsd)}`,`Écart de réconciliation : ${usd(data.results.finalProfit.reconciliationDifferenceUsd)}`]}/></div></>;
  if(section==="results") return <div className="grid gap-4 md:grid-cols-2"><Metric title="Chiffre d’affaires réel" value={usd(data.results.realRevenue.totalUsd)} lines={[`FIH : ${usd(data.results.realRevenue.byAgency.FIH)} · 9 USD/kg`,`LSHI : ${usd(data.results.realRevenue.byAgency.LSHI)} · 10 USD/kg`,`KLZ : ${usd(data.results.realRevenue.byAgency.KLZ)} · 11 USD/kg`,"Base : kg enregistrés du mois d’origine"]}/><Metric title="Encaissements / trésorerie reçue" value={usd(data.payments.receivedAmount)} lines={["Distincts du chiffre d’affaires."]}/><Metric title="Charges directes calculées automatiquement" value={usd(data.directCosts.totalAllocatedUsd)}/><Metric title="Charges fixes mensuelles" value={usd(data.fixedCosts.totalUsd)}/><Metric title="Dépenses opérationnelles déductibles" value={data.periodExpenses?currency(data.periodExpenses.deductibleByCurrency,"USD"):usd(0)}/><Metric title="Prime totale du mois" value={data.monthlyBonuses.status==="A_DEFINIR"?"À DÉFINIR":usd(data.monthlyBonuses.totalUsd)}/><Metric title="Bénéfice avant prime" value={usd(data.results.profitAfterBonuses.beforeBonusUsd)}/><Metric title="BÉNÉFICE APRÈS PRIME" value={usd(data.results.profitAfterBonuses.afterBonusUsd)}/><Metric title="Coût d’expédition du mois" value={usd(data.airFreight.totalUsd)} lines={["FIH + LSHI · KLZ exclu"]}/><Metric title="BÉNÉFICE FINAL" value={usd(data.results.finalProfit.consolidatedUsd)} lines={[formatBilanStatus(data.results.finalProfit.status)]}/></div>;
  return data.dataQuality.length?<div className="space-y-3">{data.dataQuality.map((issue,index)=><GlassPanel key={`${issue.type}-${issue.reference??index}`} className="p-4"><div className="flex flex-wrap items-center gap-2"><StatusBadge status="ANOMALIE"/><p className="font-semibold">{issue.type.replaceAll("_"," ")}</p></div><p className="mt-2 text-sm">{[issue.reference,issue.agency,issue.cohortId,issue.source].filter(Boolean).join(" · ")}</p><p className="mt-1 text-sm text-muted-foreground">{issue.impact}</p></GlassPanel>)}</div>:<Empty text="Aucune anomalie détectée pour ce périmètre."/>;
}

type FZeroAgency = { total: number; withP1: number; settled: number; partial: number; ambiguous: number; absent: number; duplicates: number; forwarding: number; rows: Array<{ code: string; cohort: string | null; weightKg: number | null; totalPaidUsd: number; classification: string; transactions: Array<{ amountUsd: number; status: string; date: string; agency: string; paymentRequestId: string | null }> }> };
type FZeroPayload = { fZeroAudit?: Record<"FIH" | "LSHI" | "KLZ", FZeroAgency> };

function PaymentsDetail({ data }: { data: BilanPayload }) {
  const [audit, setAudit] = useState<FZeroPayload | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => { const controller = new AbortController(); void (async () => { try { const response = await authenticatedRead(getSupabaseBrowserClient().auth, "/api/admin/encaissements-certification-readonly", { signal: controller.signal }); const payload = await response.json() as FZeroPayload; if (!response.ok || !payload.fZeroAudit) throw new Error("Rapprochement Encaissements temporairement indisponible."); setAudit(payload); } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Rapprochement Encaissements temporairement indisponible."); } })(); return () => controller.abort(); }, []);
  return <><div className="grid gap-4 md:grid-cols-3"><Metric title="Montant encaissé" value={usd(data.payments.receivedAmount)} lines={[`${data.payments.paymentCount} paiements`,`${data.payments.completePayments} complets · ${data.payments.partialPayments} partiels`,`${data.payments.unmatchedPayments} non rapprochés`]}/>{data.payments.historicalRevenueStatus==="CERTIFIE"?<><Metric title="Montant attendu enregistré" value={usd(data.payments.recordedExpectedAmount)}/><Metric title="Reste / taux" value={`${usd(data.payments.remainingAmount??0)} · ${percent(data.payments.collectionRate)}`}/></>:<Metric title="MONTANT ATTENDU NON CERTIFIÉ" value="Reste non calculé" lines={["Encaissements ≠ chiffre d’affaires."]}/>}</div><section className="mt-8" aria-label="Encaissements par agence"><h3 className="text-lg font-semibold">ENCAISSEMENTS PAR AGENCE</h3><p className="mt-1 text-sm text-muted-foreground">Identités financières certifiées par destination commerciale. COO reste un site d’encaissement, pas une agence de Bilan.</p>{error?<p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>:!audit?<p className="mt-3 text-sm text-muted-foreground">Chargement du rapprochement read-only…</p>:<div className="mt-4 grid gap-4 xl:grid-cols-3">{agencies.map(agency=><FZeroAgencyCard key={agency} agency={agency} data={audit.fZeroAudit?.[agency]} expanded={expanded===agency} onToggle={()=>setExpanded(expanded===agency?null:agency)}/>)}</div>}</section></>;
}

function FZeroAgencyCard({ agency, data, expanded, onToggle }: { agency: "FIH" | "LSHI" | "KLZ"; data?: FZeroAgency; expanded: boolean; onToggle: () => void }) {
  if (!data) return <GlassPanel className="p-5"><h4 className="text-lg font-semibold">{agency}</h4><p className="mt-2 text-sm text-muted-foreground">Données temporairement indisponibles.</p></GlassPanel>;
  const toVerify = data.ambiguous + data.absent + data.duplicates + data.forwarding;
  const debts = data.rows.filter(row => row.classification === "F_ZERO_P1_PARTIEL_CERTIFIE");
  const paid = data.rows.reduce((sum, row) => sum + row.totalPaidUsd, 0);
  return <GlassPanel className="p-5"><h4 className="text-lg font-semibold text-accent">{agency}</h4><dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Codes totaux</dt><dd>{data.total}</dd></div><div className="flex justify-between gap-3"><dt>Codes soldés</dt><dd>{data.settled}</dd></div><div className="flex justify-between gap-3"><dt>Codes partiels</dt><dd>{data.partial}</dd></div><div className="flex justify-between gap-3"><dt>Restant à encaisser</dt><dd>{debts.length}</dd></div><div className="flex justify-between gap-3"><dt>À vérifier</dt><dd>{toVerify}</dd></div></dl><div className="mt-4 border-t border-white/10 pt-3 text-sm"><p>Total encaissé : <strong>{usd(paid)}</strong></p><p className="mt-1">Total restant certifié : <strong>{debts.length ? "NON CERTIFIABLE" : "0,00 USD"}</strong></p></div><Button type="button" variant="outline" className="mt-4 w-full" disabled={!debts.length} onClick={onToggle}>Voir les codes restant à encaisser ({debts.length})</Button>{expanded&&debts.length?<div className="mt-4 space-y-2">{debts.map(row=><div key={row.code} className="rounded border border-white/10 p-3 text-sm"><p className="font-semibold">{row.code} · {row.cohort ?? "cohorte non résolue"}</p><p className="mt-1 text-muted-foreground">Poids : {row.weightKg === null ? "À vérifier" : `${row.weightKg} kg`} · Payé : {usd(row.totalPaidUsd)}</p><p className="mt-1 text-xs text-amber-200">Reste exact non certifiable depuis les sources actuelles.</p></div>)}</div>:null}</GlassPanel>;
}

function Metric({title,value,lines=[]}:{title:string;value:string;lines?:string[]}) { return <GlassPanel className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p><p className="mt-2 text-xl font-semibold">{value}</p>{lines.map(line=><p key={line} className="mt-1 text-sm text-muted-foreground">{line}</p>)}</GlassPanel>; }
function StatusBadge({status}:{status:BilanStatus}) { const label=formatBilanStatus(status); const variant=label==="CERTIFIÉ"?"growth":label==="ANOMALIE"?"premium":"muted"; return <Badge variant={variant}>{label}</Badge>; }
function CurrencyCards({totals}:{totals:Record<string,number>}) { return <div className="grid gap-4 sm:grid-cols-3">{(["USD","FCFA","CDF"] as const).map(currency=><Metric key={currency} title={currency} value={`${(totals[currency]??0).toLocaleString("fr-FR",{maximumFractionDigits:2})} ${currency}`}/>)}</div>; }
function Input({label,value,onChange,min,max}:{label:string;value:string;onChange:(value:string)=>void;min:string;max:string}) { return <label className="text-sm">{label}<input type="date" className={field} value={value} min={min} max={max} onChange={event=>onChange(event.target.value)}/></label>; }
function State({icon,title,detail}:{icon:React.ReactNode;title:string;detail?:string}) { return <GlassPanel className="mt-8 p-10 text-center"><div className="mx-auto w-fit">{icon}</div><h2 className="mt-3 font-semibold">{title}</h2>{detail?<p className="mt-2 text-sm text-muted-foreground">{detail}</p>:null}</GlassPanel>; }
function Empty({text}:{text:string}) { return <GlassPanel className="p-6 text-center text-sm text-muted-foreground">{text}</GlassPanel>; }
function kg(value:number){return formatWeight(value);} function nullableKg(value:number|null){return value===null?"NON CALCULABLE":kg(value);} function usd(value:number){return `${value.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} USD`;} function percent(value:number|null){return value===null?"NON CALCULABLE":`${value.toLocaleString("fr-FR",{maximumFractionDigits:2})} %`;} function currency(value:Record<string,number>,code:string){return `${(value[code]??0).toLocaleString("fr-FR",{maximumFractionDigits:2})} ${code}`;} function currencyLine(value:Record<string,number>){return Object.entries(value).map(([currency,amount])=>`${amount.toLocaleString("fr-FR")} ${currency}`).join(" · ")||"Aucun montant";}
