"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, PackageSearch, Scale } from "lucide-react";
import { GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BeneficiaryRanking, BeneficiaryStatistics } from "@/features/admin/beneficiaries";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { authenticatedRead } from "@/features/auth/authenticated-fetch";
import { formatWeight } from "@/lib/format-weight";

type Preset = "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "PREVIOUS_MONTH" | "THIS_YEAR" | "CUSTOM";
const OPTIONS: Array<[Preset, string]> = [["TODAY","Aujourd’hui"],["THIS_WEEK","Cette semaine"],["THIS_MONTH","Ce mois"],["PREVIOUS_MONTH","Mois précédent"],["THIS_YEAR","Cette année"],["CUSTOM","Période personnalisée"]];
const field = "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none focus:border-accent";

export function TopBeneficiariesSection({ accessToken }: { accessToken: string }) {
  const [preset, setPreset] = useState<Preset>("THIS_MONTH");
  const [custom, setCustom] = useState(() => range("THIS_MONTH"));
  const [ranking, setRanking] = useState<"PARCELS"|"WEIGHT">("PARCELS");
  const [data, setData] = useState<BeneficiaryStatistics | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const selected = useMemo(() => preset === "CUSTOM" ? custom : range(preset), [preset, custom]);

  useEffect(() => {
    if (!accessToken || !selected.startDate || !selected.endDate || selected.startDate > selected.endDate) return;
    const controller = new AbortController(); setLoading(true); setError("");
    const params = new URLSearchParams({ from: selected.startDate, to: selected.endDate });
    authenticatedRead(getSupabaseBrowserClient().auth, `/api/admin/beneficiaries/statistics?${params}`, { signal: controller.signal }, fetch, accessToken)
      .then(async (res) => { const body = await res.json() as BeneficiaryStatistics | { statistics?: BeneficiaryStatistics; message?: string }; if (!res.ok || !("statistics" in body) || !body.statistics) throw new Error("message" in body ? body.message : "Chargement impossible."); setData(body.statistics); })
      .catch((reason) => { if (!controller.signal.aborted) { setData(null); setError(reason instanceof Error ? reason.message : "Chargement impossible."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken, selected.startDate, selected.endDate]);

  return <div className="mt-8">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><Badge variant="growth">Admin · Lecture seule</Badge><h3 className="mt-3 text-xl font-semibold text-accent">Top bénéficiaires</h3><p className="mt-1 text-sm text-muted-foreground">Identité métier : agence + numéro de téléphone normalisé. Maximum 10 par agence.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[560px] lg:grid-cols-3">
        <label className="text-sm">Période<select className={field} value={preset} onChange={(e)=>setPreset(e.target.value as Preset)}>{OPTIONS.map(([v,l])=><option className="bg-ebe-navy" value={v} key={v}>{l}</option>)}</select></label>
        {preset === "CUSTOM" ? <><label className="text-sm">Du<input className={field} type="date" value={custom.startDate} onChange={(e)=>setCustom(x=>({...x,startDate:e.target.value}))}/></label><label className="text-sm">Au<input className={field} type="date" value={custom.endDate} onChange={(e)=>setCustom(x=>({...x,endDate:e.target.value}))}/></label></> : null}
        <div className="flex items-end gap-2"><Button type="button" variant={ranking === "PARCELS" ? "growth" : "outline"} onClick={()=>setRanking("PARCELS")}><PackageSearch className="h-4 w-4"/> Colis</Button><Button type="button" variant={ranking === "WEIGHT" ? "growth" : "outline"} onClick={()=>setRanking("WEIGHT")}><Scale className="h-4 w-4"/> Kg</Button></div>
      </div>
    </div>
    {loading ? <GlassPanel className="mt-5 grid min-h-36 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-accent"/></GlassPanel> : error ? <GlassPanel className="mt-5 p-5 text-amber-200">{error}</GlassPanel> : data ? <div className="mt-5 grid gap-5 xl:grid-cols-3">{(["FIH","LSHI","KLZ"] as const).map((agency)=><RankingPanel key={agency} agency={agency} rows={ranking === "PARCELS" ? data.byAgency[agency].byParcels : data.byAgency[agency].byWeight}/>)}</div> : null}
  </div>;
}

function RankingPanel({ agency, rows }: { agency: string; rows: BeneficiaryRanking[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return <GlassPanel className="overflow-hidden"><div className="border-b border-white/10 p-5"><h4 className="font-semibold text-accent">{agency}</h4></div>{rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Aucun bénéficiaire sur cette période.</p> : <ol className="divide-y divide-white/10">{rows.map((item,index)=><li key={item.key} className="p-4"><div className="flex gap-3"><span className="font-semibold text-accent">#{index+1}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.phone} · {item.agency}</p><p className="mt-2 text-sm"><strong>{item.parcelCount}</strong> colis · <strong>{formatWeight(item.totalWeightKg)}</strong></p><p className="text-xs text-muted-foreground">Moyenne {formatWeight(item.averageWeightKg)} · dernière réception {formatDate(item.lastReceiptDate)}</p><Button type="button" variant="ghost" size="sm" className="mt-2 px-0" onClick={()=>setOpen(open===item.key?null:item.key)}>{open===item.key?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>} Voir les détails</Button></div></div>{open===item.key?<div className="mt-3 overflow-x-auto rounded-lg border border-white/10"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-white/5"><tr>{["Date","Code","Agence","Poids","Destination","Statut"].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{item.parcels.map(p=><tr className="border-t border-white/10" key={p.id}><td className="p-2">{formatDate(p.date)}</td><td>{p.code}</td><td>{p.agency}</td><td>{formatWeight(p.weightKg)}</td><td>{p.destination}</td><td>{p.status}</td></tr>)}</tbody></table></div>:null}</li>)}</ol>}</GlassPanel>;
}

function range(preset: Exclude<Preset,"CUSTOM">) { const now = new Date(); const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Porto-Novo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now); const v=Object.fromEntries(parts.map(p=>[p.type,p.value])); const today=`${v.year}-${v.month}-${v.day}`; const [y,m,d]=today.split("-").map(Number); if(preset==="TODAY")return{startDate:today,endDate:today}; if(preset==="THIS_MONTH")return{startDate:`${v.year}-${v.month}-01`,endDate:today}; if(preset==="THIS_YEAR")return{startDate:`${v.year}-01-01`,endDate:today}; if(preset==="PREVIOUS_MONTH"){const first=new Date(Date.UTC(y,m-2,1));const last=new Date(Date.UTC(y,m-1,0));return{startDate:key(first),endDate:key(last)}} const day=new Date(Date.UTC(y,m-1,d)).getUTCDay()||7;const start=new Date(Date.UTC(y,m-1,d-day+1));return{startDate:key(start),endDate:today}; }
function key(date: Date){return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`}
function formatDate(value:string){const [y,m,d]=value.split("-");return `${d}/${m}/${y}`}
