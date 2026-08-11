"use client";

import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, ClipboardCopy, LoaderCircle, PackageSearch, RefreshCw, Scale } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Container, GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { formatParcelsForArrival, type ReceptionStatistics } from "@/features/agent/reception-statistics";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { formatWeight } from "@/lib/format-weight";

const field = "h-11 rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none focus:border-accent";

export function ReceptionStatisticsPage() {
  const router = useRouter();
  const token = useRef("");
  const initialLoadDone = useRef(false);
  const [ready, setReady] = useState(false);
  const [statistics, setStatistics] = useState<ReceptionStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [year, setYear] = useState(""); const [month, setMonth] = useState("");
  const [company, setCompany] = useState("ALL"); const [status, setStatus] = useState("ALL");
  const [arrival, setArrival] = useState("ALL"); const [search, setSearch] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  const load = useCallback(async () => {
    if (!token.current) return;
    setLoading(true); setError("");
    const params = new URLSearchParams();
    const add = (key: string, value: string) => { if (value && value !== "ALL") params.set(key, value); };
    if (!month) { add("from", from); add("to", to); }
    add("year", year); add("month", month); add("company", company); add("status", status); add("arrival", arrival); add("search", search.trim());
    try {
      const response = await fetch(`/api/agent/reception-statistics?${params}`, { headers: { Authorization: `Bearer ${token.current}` }, cache: "no-store" });
      const body = await response.json() as { statistics?: ReceptionStatistics; message?: string };
      if (!response.ok || !body.statistics) throw new Error(body.message || "Lecture impossible.");
      setStatistics(body.statistics);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lecture impossible.");
    } finally { setLoading(false); }
  }, [arrival, company, from, month, search, status, to, year]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return router.replace("/auth/sign-in");
      if (active) { token.current = session.access_token; setReady(true); }
    })();
    return () => { active = false; token.current = ""; };
  }, [router]);
  useEffect(() => {
    if (ready && !initialLoadDone.current) {
      initialLoadDone.current = true;
      void load();
    }
  }, [load, ready]);

  function reset() { setFrom(""); setTo(""); setYear(""); setMonth(""); setCompany("ALL"); setStatus("ALL"); setArrival("ALL"); setSearch(""); }

  async function copyForArrival() {
    if (!statistics || statistics.copyValidationErrors.length) return;
    try {
      await navigator.clipboard.writeText(formatParcelsForArrival(statistics.parcels));
      setCopyFeedback(`${statistics.parcels.length} colis · ${formatWeight(statistics.parcels.reduce((sum, parcel) => sum + parcel.weightKg, 0))} copiés`);
      window.setTimeout(() => setCopyFeedback(""), 4000);
    } catch { setError("La copie dans le presse-papiers a échoué."); }
  }

  return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container>
    <header><Link href="/agent" className="inline-flex items-center gap-2 text-sm text-accent"><ArrowLeft className="h-4 w-4"/>Retour au tableau de bord Agent</Link><h1 className="mt-3 text-3xl font-semibold">Statistiques de Réception</h1><p className="mt-2 text-sm text-muted-foreground">Consulter les colis et le poids prévus à la réception de votre agence.</p></header>
    <GlassPanel className="mt-8 p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Input label="Date de début" type="date" value={from} onChange={setFrom}/><Input label="Date de fin" type="date" value={to} onChange={setTo}/><Input label="Année" value={year} onChange={setYear} placeholder="2026"/><Select label="Mois" value={month} onChange={setMonth} options={["",...Array.from({length:12},(_,i)=>String(i+1))]}/><Select label="Compagnie" value={company} onChange={setCompany} options={["ALL","ASKY","ETHIOPIAN","DHL","AIR CONGO"]}/><Select label="Statut groupage" value={status} onChange={setStatus} options={["ALL","ARRIVE","EN ATTENTE"]}/><Select label="Groupage arrivé" value={arrival} onChange={setArrival} options={["ALL","ARRIVED","NOT_ARRIVED"]}/><Input label="Recherche groupage" value={search} onChange={setSearch} placeholder="Numéro ou nom"/>
    </div><div className="mt-4 flex gap-3"><Button variant="growth" onClick={()=>void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Appliquer les filtres</Button><Button variant="outline" onClick={reset}>Réinitialiser</Button></div></GlassPanel>
    {error?<GlassPanel className="mt-6 p-8 text-center"><CircleAlert className="mx-auto h-8 w-8 text-red-200"/><p role="alert" className="mt-3">{error}</p></GlassPanel>:null}
    {loading&&!statistics?<div className="grid min-h-64 place-items-center"><LoaderCircle className="h-8 w-8 animate-spin text-accent"/></div>:null}
    {statistics?<><div className="mt-6 grid gap-4 sm:grid-cols-2"><Metric label="NOMBRE DE COLIS À RECEVOIR" value={`${statistics.totals.parcels} colis`} icon={PackageSearch}/><Metric label="POIDS À RECEVOIR" value={formatWeight(statistics.totals.weightKg)} icon={Scale}/></div><p className="mt-5 text-sm text-amber-100">Ces statistiques indiquent les colis prévus à la réception. Le Stockage V2 reste la source de vérité des colis physiquement reçus.</p><GlassPanel className="mt-5 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">COLIS À RECEVOIR</h2><p className="mt-1 text-sm text-muted-foreground">Nombre de colis sélectionnés : {statistics.parcels.length}</p><p className="text-sm text-muted-foreground">Poids total sélectionné : {formatWeight(statistics.parcels.reduce((sum, parcel) => sum + parcel.weightKg, 0))}</p></div><Button variant="growth" onClick={()=>void copyForArrival()} disabled={!statistics.parcels.length||statistics.copyValidationErrors.length>0}><ClipboardCopy className="mr-2 h-4 w-4"/>COPIER POUR ARRIVAGE</Button></div>{copyFeedback?<p role="status" className="mt-4 flex items-center gap-2 text-sm text-accent"><Check className="h-4 w-4"/>Liste copiée pour Arrivage — {copyFeedback}</p>:null}{statistics.copyValidationErrors.length?<div role="alert" className="mt-4 rounded-md border border-red-300/30 bg-red-950/30 p-3 text-sm text-red-100"><p className="font-semibold">Copie indisponible :</p><ul className="mt-1 list-disc pl-5">{statistics.copyValidationErrors.map(message=><li key={message}>{message}</li>)}</ul></div>:null}<div className="mt-4 max-h-72 overflow-auto rounded-md border border-white/10"><table className="w-full min-w-[420px] text-sm"><thead><tr className="border-b border-white/10 text-left text-muted-foreground"><th className="p-3">Code colis</th><th className="p-3">Poids</th></tr></thead><tbody>{statistics.parcels.map(parcel=><tr key={parcel.code} className="border-b border-white/5"><td className="p-3">{parcel.code}</td><td className="p-3">{formatWeight(parcel.weightKg)}</td></tr>)}</tbody></table></div></GlassPanel><GlassPanel className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-white/10 text-left text-muted-foreground"><th className="p-4">Groupage</th><th>Compagnie</th><th>Date</th><th>Nombre colis</th><th>Poids à recevoir</th><th>Statut</th></tr></thead><tbody>{statistics.rows.map(row=><tr key={row.id} className="border-b border-white/5"><td className="max-w-64 whitespace-pre-wrap p-4">{row.groupage}</td><td>{row.company}</td><td>{formatDate(row.date)}</td><td>{row.parcels}</td><td>{formatWeight(row.weightKg)}</td><td>{row.status}</td></tr>)}</tbody></table>{statistics.rows.length===0?<div className="p-10 text-center text-muted-foreground">Aucune réception prévue ne correspond aux filtres.</div>:null}</GlassPanel></>:null}
  </Container></main>;
}

function Input({label,value,onChange,type="text",placeholder}:{label:string;value:string;onChange:(value:string)=>void;type?:string;placeholder?:string}) { return <label className="text-xs text-muted-foreground">{label}<input className={`${field} mt-2 w-full`} type={type} value={value} placeholder={placeholder} onChange={(event)=>onChange(event.target.value)}/></label>; }
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:string[]}) { return <label className="text-xs text-muted-foreground">{label}<select className={`${field} mt-2 w-full`} value={value} onChange={(event)=>onChange(event.target.value)}>{options.map(option=><option key={option||"EMPTY"} value={option}>{option||"Tous"}</option>)}</select></label>; }
function Metric({label,value,icon:Icon}:{label:string;value:string;icon:typeof Scale}) { return <GlassPanel className="p-6" glow="growth"><Icon className="h-6 w-6 text-accent"/><p className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></GlassPanel>; }
function formatDate(value:string) { const [year,month,day]=value.split("-"); return year&&month&&day?`${day}/${month}/${year}`:value; }
