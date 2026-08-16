"use client";

import Link from "next/link";
import { useEffect,useMemo,useState } from "react";
import { BellRing,LoaderCircle } from "lucide-react";
import { Container,GlassPanel } from "@/components/design-system";
import { authenticatedRead,readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { AdminAlert,AdminAlertCategory,AdminAlertLevel } from "@/server/admin-alert-rules";

type Result={generatedAt:string;count:number;alerts:AdminAlert[];thresholds:{storageStaleDays:number;cooPartialPaymentDays:number}};
const levels:Array<"TOUTES"|AdminAlertLevel>=["TOUTES","INFO","ATTENTION","IMPORTANT"];
const agencies=["TOUTES","COO","FIH","LSHI","KLZ"] as const;
const categories:Array<"TOUTES"|AdminAlertCategory>=["TOUTES","QR","STOCKAGE","ENCAISSEMENTS","CAISSE","DÉPENSES","COHÉRENCE COLIS"];

export function AdminAlertCenter(){const [result,setResult]=useState<Result|null>(null),[error,setError]=useState("");const [level,setLevel]=useState<(typeof levels)[number]>("TOUTES"),[agency,setAgency]=useState<(typeof agencies)[number]>("TOUTES"),[category,setCategory]=useState<(typeof categories)[number]>("TOUTES");
useEffect(()=>{authenticatedRead(getSupabaseBrowserClient().auth,"/api/admin/alerts").then((response)=>readJsonOrThrow<Result>(response,"Centre d’alertes indisponible.")).then(setResult).catch((cause)=>setError(cause instanceof Error?cause.message:"Centre d’alertes indisponible."));},[]);
const alerts=useMemo(()=>(result?.alerts??[]).filter((item)=>(level==="TOUTES"||item.level===level)&&(agency==="TOUTES"||item.agency===agency||item.agency==="TOUTES")&&(category==="TOUTES"||item.category===category)),[result,level,agency,category]);
return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container className="max-w-6xl"><Link href="/admin" className="text-sm font-semibold text-accent">← Retour au tableau de bord Admin</Link><header className="mt-5 flex items-center gap-3"><BellRing className="h-8 w-8 text-accent"/><div><h1 className="text-3xl font-semibold">Centre d’alertes Admin</h1><p className="mt-1 text-sm text-muted-foreground">Situations actives calculées en lecture seule depuis les sources officielles.</p></div></header>
{error?<GlassPanel className="mt-7 p-6 text-red-200" role="alert">{error}</GlassPanel>:null}{!result&&!error?<LoaderCircle className="mx-auto mt-12 h-7 w-7 animate-spin text-accent"/>:null}
{result?<><GlassPanel className="mt-7 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">Alertes actives</p><p className="text-3xl font-bold text-accent">{result.count}</p></div><p className="text-xs text-muted-foreground">Seuil Stockage : {result.thresholds.storageStaleDays} jours · Paiement partiel COO : {result.thresholds.cooPartialPaymentDays} jours</p></div><div className="mt-5 grid gap-3 md:grid-cols-3"><Filter label="Niveau" value={level} values={levels} set={setLevel}/><Filter label="Agence" value={agency} values={agencies} set={setAgency}/><Filter label="Catégorie" value={category} values={categories} set={setCategory}/></div></GlassPanel>
<section className="mt-6 space-y-4">{alerts.length===0?<GlassPanel className="p-8 text-center text-muted-foreground">Aucune alerte active pour ces filtres.</GlassPanel>:alerts.map((item)=><AlertCard key={item.id} item={item}/>)}</section></>:null}</Container></main>}

function Filter<T extends string>({label,value,values,set}:{label:string;value:T;values:readonly T[];set:(value:T)=>void}){return <label className="text-sm">{label}<select className="mt-1 h-11 w-full rounded-md border border-white/15 bg-ebe-night px-3" value={value} onChange={(event)=>set(event.target.value as T)}>{values.map((item)=><option key={item}>{item}</option>)}</select></label>}
function AlertCard({item}:{item:AdminAlert}){const tone=item.level==="IMPORTANT"?"border-red-300/40":item.level==="ATTENTION"?"border-amber-300/40":"border-sky-300/30";return <GlassPanel className={`p-5 ${tone}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-accent">{item.level} · {item.category}</p><h2 className="mt-1 text-lg font-semibold">{item.title}</h2></div><span className="rounded-full border border-white/15 px-3 py-1 text-xs">{item.agency}</span></div>{item.trackingCode?<p className="mt-3 font-mono text-sm">Code colis : {item.trackingCode}</p>:null}<p className="mt-2 text-sm">{item.description}</p><p className="mt-3 text-xs text-muted-foreground">Sources : {item.sources.join(" / ")} · {new Date(item.occurredAt).toLocaleString("fr-FR")}</p></GlassPanel>}
