"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Clock3, PackageSearch } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { AdminParcelHistory, ParcelHistoryEvent } from "@/server/admin-parcel-history";

const stateLabel = { FOUND: "TROUVÉ", ABSENT: "ABSENT", UNAVAILABLE_TEMPORARILY: "INDISPONIBLE TEMPORAIREMENT" } as const;

export function AdminParcelHistoryView({ code }: { code: string }) {
  const [history, setHistory] = useState<AdminParcelHistory | null>(null); const [error, setError] = useState("");
  useEffect(() => { let active = true; authenticatedRead(getSupabaseBrowserClient().auth, `/api/admin/parcel-history/${encodeURIComponent(code)}`).then((response) => readJsonOrThrow<AdminParcelHistory>(response, "Historique temporairement indisponible.")).then((value) => { if (active) setHistory(value); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Historique temporairement indisponible."); }); return () => { active = false; }; }, [code]);
  return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container className="max-w-5xl">
    <Link href="/admin/recherche-globale-colis" className="text-sm text-accent">← Retour à la recherche globale</Link>
    <header className="mt-5 flex items-center gap-3"><PackageSearch className="h-8 w-8 text-accent"/><div><h1 className="text-3xl font-semibold">Historique du colis</h1><p className="mt-1 text-muted-foreground">Lecture seule des sources officielles.</p></div></header>
    {error?<GlassPanel className="mt-7 p-6 text-amber-200" role="alert">{error}</GlassPanel>:null}
    {!history&&!error?<GlassPanel className="mt-7 p-6">Chargement de l’historique…</GlassPanel>:null}
    {history&&!history.found?<GlassPanel className="mt-7 p-6"><h2 className="text-2xl font-bold">{history.code}</h2><p className="mt-3 text-accent">AUCUN HISTORIQUE TROUVÉ</p><SourceStates history={history}/></GlassPanel>:null}
    {history?.found?<div className="mt-7 space-y-6">
      <GlassPanel className="p-6"><p className="text-sm text-muted-foreground">Code colis complet</p><h2 className="text-3xl font-bold">{history.code}</h2><h3 className="mt-6 text-lg font-semibold text-accent">ÉTAT ACTUEL</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Destination" value={history.current.destination}/><Summary label="Poids" value={history.current.weightKg==null?null:`${history.current.weightKg} kg`}/><Summary label="Statut" value={history.current.status}/><Summary label="QR associé" value={history.current.qr}/><Summary label="Paiement" value={history.current.payment}/><Summary label="Stockage" value={history.current.storage}/><Summary label="Dernière activité" value={formatDate(history.current.lastActivity)}/></div><SourceStates history={history}/></GlassPanel>
      {history.inconsistencies.length?<GlassPanel className="border-amber-300/40 p-6"><div className="flex gap-3"><AlertTriangle className="h-6 w-6 shrink-0 text-amber-300"/><div><h3 className="font-bold text-amber-200">INCOHÉRENCE À VÉRIFIER</h3>{history.inconsistencies.map((item)=><p key={item} className="mt-2 text-sm">{item}</p>)}</div></div></GlassPanel>:null}
      <GlassPanel className="p-6"><h3 className="flex items-center gap-2 text-xl font-semibold"><Clock3 className="h-5 w-5 text-accent"/>HISTORIQUE CHRONOLOGIQUE</h3><div className="mt-6 border-l-2 border-accent/50 pl-6">{history.datedEvents.map((event)=><EventCard key={event.id} event={event}/>)}</div>{history.datedEvents.length===0?<p className="mt-4 text-muted-foreground">Aucun événement daté.</p>:null}</GlassPanel>
      {history.undatedEvents.length?<GlassPanel className="p-6"><h3 className="text-xl font-semibold">Informations sans horodatage fiable</h3><div className="mt-4 space-y-3">{history.undatedEvents.map((event)=><EventCard key={event.id} event={event}/>)}</div></GlassPanel>:null}
    </div>:null}
  </Container></main>;
}

function Summary({label,value}:{label:string;value:string|null}) { return <div className="rounded-lg border border-white/10 bg-white/5 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value||"Aucun"}</p></div>; }
function EventCard({event}:{event:ParcelHistoryEvent}) { return <article className="relative mb-5 rounded-lg border border-white/10 bg-white/5 p-4 before:absolute before:-left-[31px] before:top-5 before:h-3 before:w-3 before:rounded-full before:bg-accent"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold">{event.type}</h4><span className="text-sm text-accent">{formatDate(event.occurredAt)||"Date non fiable"}</span></div><p className="mt-2 text-sm">Source : {event.source}</p><p className="text-sm">Agence : {event.agency}</p><p className="text-sm">{event.detail}</p><p className="mt-1 text-sm font-semibold">Statut : {event.status}</p></article>; }
function SourceStates({history}:{history:AdminParcelHistory}) { return <div className="mt-5 flex flex-wrap gap-2">{Object.entries(history.sources).map(([name,source])=><span key={name} className="rounded-full border border-white/15 px-3 py-1 text-xs">{name.toUpperCase()} — {stateLabel[source.state]}</span>)}</div>; }
function formatDate(value:string|null) { if (!value) return null; const date=new Date(value); return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:value.includes("T")?"short":undefined}).format(date); }
