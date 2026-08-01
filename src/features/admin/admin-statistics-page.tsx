"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, LoaderCircle, LogOut, PackageSearch, RefreshCw, Scale, Send } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import type { ManifestStatistics } from "@/features/admin/manifest-statistics";
import type { ShipmentStatistics } from "@/features/admin/shipment-statistics";
import { getAdminProfile, signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

type PageKind = "manifest" | "shipments";
const field = "h-11 rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none focus:border-accent";

export function AdminStatisticsPage({ kind }: { kind: PageKind }) {
  const router = useRouter(); const token = useRef(""); const initialLoadDone = useRef(false);
  const [ready, setReady] = useState(false); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [manifest, setManifest] = useState<ManifestStatistics | null>(null); const [shipments, setShipments] = useState<ShipmentStatistics | null>(null);
  const [year, setYear] = useState(""); const [month, setMonth] = useState("");
  const [site, setSite] = useState("ALL"); const [shipmentYear, setShipmentYear] = useState(""); const [shipmentMonth, setShipmentMonth] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [company, setCompany] = useState("ALL"); const [destination, setDestination] = useState("ALL"); const [status, setStatus] = useState("ALL");

  const load = useCallback(async () => {
    if (!token.current) return; setLoading(true); setError("");
    const params = new URLSearchParams();
    if (kind === "manifest") { if (year) params.set("year", year); if (month) params.set("month", month); }
    else { if (from) params.set("from", from); if (to) params.set("to", to); if (shipmentYear) params.set("year", shipmentYear); if (shipmentMonth) params.set("month", shipmentMonth); params.set("company", company); params.set("destination", destination); params.set("status", status); }
    try {
      const response = await fetch(`/api/admin/statistics/${kind}?${params}`, { headers: { Authorization: `Bearer ${token.current}` }, cache: "no-store" });
      const body = await response.json() as { statistics?: ManifestStatistics | ShipmentStatistics; message?: string };
      if (!response.ok || !body.statistics) throw new Error(body.message || "Lecture impossible.");
      if (kind === "manifest") setManifest(body.statistics as ManifestStatistics); else setShipments(body.statistics as ShipmentStatistics);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lecture impossible."); } finally { setLoading(false); }
  }, [company, destination, from, kind, month, shipmentMonth, shipmentYear, status, to, year]);

  useEffect(() => { let active = true; void (async () => {
    try { const supabase = getSupabaseBrowserClient(); const { data: { session } } = await supabase.auth.getSession(); if (!session?.user || !session.access_token) return router.replace("/auth/sign-in"); await getAdminProfile(session.user); if (active) { token.current = session.access_token; setReady(true); } }
    catch { if (active) setError("Accès Admin refusé."); }
  })(); return () => { active = false; token.current = ""; }; }, [router]);
  useEffect(() => { if (ready && !initialLoadDone.current) { initialLoadDone.current = true; void load(); } }, [load, ready]);

  const title = kind === "manifest" ? "Statistiques du manifeste" : "Statistiques des expéditions";
  return <main className="min-h-screen py-8"><Container>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-accent"><ArrowLeft className="h-4 w-4"/>Retour au tableau de bord Admin</Link><h1 className="mt-3 text-3xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">Lecture sécurisée et sans écriture de MANIFESTE PUBLIC.</p></div><Button variant="outline" onClick={() => void signOutAgent().then(() => router.replace("/auth/sign-in"))}><LogOut className="mr-2 h-4 w-4"/>Se déconnecter</Button></header>
    <GlassPanel className="mt-8 p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{kind === "manifest" ? <><input aria-label="Année" className={field} inputMode="numeric" placeholder="Année" value={year} onChange={(e)=>setYear(e.target.value)}/><select aria-label="Mois" className={field} value={month} onChange={(e)=>setMonth(e.target.value)}><option value="">Tous les mois</option>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Intl.DateTimeFormat("fr-FR",{month:"long"}).format(new Date(2026,i,1))}</option>)}</select><select aria-label="Site" className={field} value={site} onChange={(e)=>setSite(e.target.value)}><option value="ALL">Tous les sites</option><option>FIH</option><option>LSHI</option><option>KLZ</option></select></> : <><input aria-label="Date de début" type="date" className={field} value={from} onChange={(e)=>setFrom(e.target.value)}/><input aria-label="Date de fin" type="date" className={field} value={to} onChange={(e)=>setTo(e.target.value)}/><input aria-label="Année" className={field} inputMode="numeric" placeholder="Année" value={shipmentYear} onChange={(e)=>setShipmentYear(e.target.value)}/><select aria-label="Mois" className={field} value={shipmentMonth} onChange={(e)=>setShipmentMonth(e.target.value)}><option value="">Tous les mois</option>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select><input aria-label="Compagnie" className={field} placeholder="Compagnie ou ALL" value={company} onChange={(e)=>setCompany(e.target.value.toUpperCase())}/><input aria-label="Destination" className={field} placeholder="Destination ou ALL" value={destination} onChange={(e)=>setDestination(e.target.value.toUpperCase())}/><input aria-label="Statut" className={field} placeholder="Statut ou ALL" value={status} onChange={(e)=>setStatus(e.target.value)}/></>}<Button variant="growth" onClick={()=>void load()} disabled={!ready||loading}>{loading?<LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>:<RefreshCw className="mr-2 h-4 w-4"/>}Appliquer</Button></div></GlassPanel>
    {error ? <GlassPanel className="mt-6 p-8 text-center"><p role="alert">{error}</p><Button className="mt-4" variant="growth" onClick={()=>void load()}>Réessayer</Button></GlassPanel> : null}
    {!error && loading && !manifest && !shipments ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="h-8 w-8 animate-spin text-accent"/></div> : null}
    {!error && kind === "manifest" && manifest ? <ManifestView data={manifest} site={site}/> : null}
    {!error && kind === "shipments" && shipments ? <ShipmentView data={shipments}/> : null}
  </Container></main>;
}

function ManifestView({data,site}:{data:ManifestStatistics;site:string}) { const siteKey = site.toLowerCase() as "fih"|"lshi"|"klz"; const value=(row:{fih:number;lshi:number;klz:number;total:number})=>site==="ALL"?row.total:row[siteKey]; const rows = data.kilograms.map((row,i)=>({...row, parcels:value(data.parcels[i]??{fih:0,lshi:0,klz:0,total:0})})); return <><div className="mt-6 grid gap-4 sm:grid-cols-3"><Metric label={`Kg annuels — ${site}`} value={`${data.annualKilograms?value(data.annualKilograms):0} kg`} icon={Scale}/><Metric label={`Colis annuels — ${site}`} value={String(data.annualParcels?value(data.annualParcels):0)} icon={PackageSearch}/><Metric label="Périodes affichées" value={String(rows.length)} icon={BarChart3}/></div><GlassPanel className="mt-6 overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b border-white/10 text-left text-muted-foreground"><th className="p-4">Période</th><th>FIH (kg)</th><th>LSHI (kg)</th><th>KLZ (kg)</th><th>Total kg</th><th>Colis filtrés</th></tr></thead><tbody>{rows.map(row=><tr key={row.month} className="border-b border-white/5"><td className="p-4 font-medium">{row.month}</td><td>{row.fih}</td><td>{row.lshi}</td><td>{row.klz}</td><td>{row.total}</td><td>{row.parcels}</td></tr>)}</tbody></table>{rows.length===0?<Empty/>:null}</GlassPanel></>; }
function ShipmentView({data}:{data:ShipmentStatistics}) { return <><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Expéditions" value={String(data.totals.shipments)} icon={Send}/><Metric label="Groupages" value={String(data.totals.groupages)} icon={PackageSearch}/><Metric label="Poids" value={`${data.totals.weightKg.toFixed(2)} kg`} icon={Scale}/><Metric label="Montant" value={`${data.totals.amountUsd.toFixed(2)} USD`} icon={BarChart3}/></div><GlassPanel className="mt-6 overflow-x-auto"><table className="w-full min-w-[1400px] text-sm"><thead><tr className="border-b border-white/10 text-left text-muted-foreground"><th className="p-4">Date</th><th>Compagnie</th><th>Destination</th><th>Groupages</th><th>Poids</th><th>Détails groupages</th><th>Prix/kg</th><th>Montant</th><th>Poids/groupage</th><th>Total manifeste / colis</th><th>Statut</th><th>Arrivée</th><th>Groupages arrivés</th></tr></thead><tbody>{data.shipments.map(row=><tr key={row.id} className="border-b border-white/5 align-top"><td className="p-4">{row.date}</td><td>{row.company}</td><td>{row.destination}</td><td>{row.groupages}</td><td>{row.weightKg} kg</td><td className="max-w-64 whitespace-pre-wrap">{row.groupageCodes||"—"}</td><td>{row.pricePerKg} USD</td><td>{row.amountUsd} USD</td><td className="whitespace-pre-wrap">{row.groupageWeights||"—"}</td><td className="whitespace-pre-wrap">{row.manifestTotal||row.klzPackages||"—"}</td><td>{row.status||"—"}</td><td>{row.arrivalDate||"—"}</td><td className="whitespace-pre-wrap">{row.arrivedGroupages||"—"}</td></tr>)}</tbody></table>{data.shipments.length===0?<Empty/>:null}</GlassPanel><div className="mt-6 grid gap-4 md:grid-cols-2"><Breakdown title="Par compagnie" rows={data.byCompany}/><Breakdown title="Par destination" rows={data.byDestination}/></div></>; }
function Breakdown({title,rows}:{title:string;rows:Array<{label:string;shipments:number;weightKg:number}>}){return <GlassPanel className="p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4 space-y-2">{rows.map(row=><div key={row.label} className="flex justify-between gap-4 text-sm"><span>{row.label}</span><span>{row.shipments} exp. · {row.weightKg} kg</span></div>)}</div></GlassPanel>}
function Metric({label,value,icon:Icon}:{label:string;value:string;icon:typeof Scale}) { return <GlassPanel className="p-5"><Icon className="h-5 w-5 text-accent"/><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></GlassPanel>; }
function Empty(){return <div className="p-12 text-center"><PackageSearch className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 font-medium">Aucune donnée ne correspond aux filtres.</p></div>;}
