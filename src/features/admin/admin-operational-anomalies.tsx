"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { OperationalAnomaly } from "@/server/operational-reconciliation";

type Result = { generatedAt: string; anomalies: OperationalAnomaly[]; metrics: Record<string, number>; sources: Record<string, string> };

export function AdminOperationalAnomalies() {
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState("");
  const [category, setCategory] = useState("TOUTES"), [agency, setAgency] = useState("TOUTES");
  useEffect(() => { void authenticatedRead(getSupabaseBrowserClient().auth, "/api/admin/operational-anomalies").then((response) => readJsonOrThrow<Result>(response, "Centre d’anomalies indisponible.")).then(setResult).catch((cause) => setError(cause instanceof Error ? cause.message : "Centre d’anomalies indisponible.")); }, []);
  const anomalies = useMemo(() => (result?.anomalies ?? []).filter((row) => (category === "TOUTES" || row.category === category) && (agency === "TOUTES" || row.agency === agency)), [result, category, agency]);
  return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container className="max-w-6xl">
    <Link href="/admin" className="text-sm font-semibold text-accent">← Retour au tableau de bord Admin</Link>
    <header className="mt-5 flex items-center gap-3"><CircleAlert className="h-8 w-8 text-accent"/><div><h1 className="text-3xl font-semibold">Centre d’anomalies</h1><p className="mt-1 text-sm text-muted-foreground">Contrôles automatiques strictement en lecture seule. Aucune réparation n’est exécutée ici.</p></div></header>
    {error ? <GlassPanel className="mt-7 p-6 text-red-200" role="alert">{error}</GlassPanel> : null}
    {!result && !error ? <LoaderCircle className="mx-auto mt-12 h-7 w-7 animate-spin text-accent"/> : null}
    {result ? <><GlassPanel className="mt-7 p-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Anomalies actives" value={result.anomalies.length}/><Metric label="Pending" value={result.metrics.pending ?? 0}/><Metric label="Paiements sans Caisse" value={result.metrics.paymentsWithoutCash ?? 0}/><Metric label="Paiements sans Stockage" value={result.metrics.paymentsWithoutStorage ?? 0}/></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Select label="Catégorie" value={category} onChange={setCategory} values={["TOUTES","CAISSE","ENCAISSEMENTS","STOCKAGE","ORCHESTRATION","CONTINUITE","PAGINATION","DOUBLON"]}/><Select label="Agence" value={agency} onChange={setAgency} values={["TOUTES","COO","FIH","LSHI","KLZ"]}/></div><div className="mt-4 flex flex-wrap gap-2">{Object.entries(result.sources).map(([name,state])=><span key={name} className="rounded-full border border-white/15 px-3 py-1 text-xs">{name} — {state === "AVAILABLE" ? "DISPONIBLE" : "INDISPONIBLE"}</span>)}</div><p className="mt-3 text-xs text-muted-foreground">Dernière vérification : {new Date(result.generatedAt).toLocaleString("fr-FR")}</p></GlassPanel>
    <section className="mt-6 space-y-4">{anomalies.length ? anomalies.map((row)=><GlassPanel key={row.id} className="p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold text-accent">{row.category} · {row.agency ?? "NON IMPUTABLE"}</p><h2 className="mt-1 font-semibold">{row.type.replaceAll("_", " ")}</h2></div><span className="rounded-full border border-amber-300/40 px-3 py-1 text-xs">{row.severity} · {row.status.replaceAll("_", " ")}</span></div>{row.trackingCode ? <p className="mt-3 font-mono text-sm">Code colis : {row.trackingCode}</p> : null}{row.paymentRequestId ? <p className="mt-1 break-all text-xs text-muted-foreground">paymentRequestId : {row.paymentRequestId}</p> : null}<p className="mt-3 text-sm">{row.cause}</p><p className="mt-2 text-sm text-muted-foreground">Action recommandée : {row.recommendation}</p><p className="mt-3 text-xs text-muted-foreground">Étape : {row.interruptedStep ?? "—"} · Âge : {row.ageMinutes} min · Vérifiée : {new Date(result.generatedAt).toLocaleString("fr-FR")}</p></GlassPanel>) : <GlassPanel className="p-8 text-center text-muted-foreground">Aucune anomalie active pour ces filtres.</GlassPanel>}</section></> : null}
  </Container></main>;
}

function Metric({label,value}:{label:string;value:number}) { return <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></div>; }
function Select({label,value,onChange,values}:{label:string;value:string;onChange:(value:string)=>void;values:string[]}) { return <label className="text-sm">{label}<select className="mt-1 h-11 w-full rounded-md border border-white/15 bg-ebe-night px-3" value={value} onChange={(event)=>onChange(event.target.value)}>{values.map((item)=><option key={item}>{item}</option>)}</select></label>; }
