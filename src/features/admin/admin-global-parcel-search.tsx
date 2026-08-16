"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { PackageSearch } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { AdminGlobalParcelSearchResult } from "@/server/admin-global-parcel-search";

const sourceLabel = { FOUND: "TROUVÉ", ABSENT: "ABSENT", UNAVAILABLE_TEMPORARILY: "INDISPONIBLE TEMPORAIREMENT" } as const;

export function AdminGlobalParcelSearch() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AdminGlobalParcelSearchResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const code = query.trim().toUpperCase();
      const response = await authenticatedRead(getSupabaseBrowserClient().auth, `/api/admin/global-parcel-search?code=${encodeURIComponent(code)}`);
      setResult(await readJsonOrThrow<AdminGlobalParcelSearchResult>(response, "Recherche globale indisponible."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recherche globale indisponible."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container className="max-w-6xl">
    <Link href="/admin" className="text-sm text-accent">← Retour au tableau de bord Admin</Link>
    <header className="mt-5"><div className="flex items-center gap-3"><PackageSearch className="h-8 w-8 text-accent"/><h1 className="text-3xl font-semibold">Recherche globale colis</h1></div><p className="mt-2 text-sm text-muted-foreground">Agrégation en lecture seule des sources officielles existantes.</p></header>
    <GlassPanel className="mt-7 p-6"><form onSubmit={search} className="flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="global-code">Code colis complet</label><input id="global-code" value={query} onChange={(event)=>setQuery(event.target.value.toUpperCase())} placeholder="AT09426" className="h-11 flex-1 rounded-md border border-white/15 bg-ebe-night px-3"/><Button type="submit" variant="growth" disabled={busy||!query.trim()}>{busy?"Recherche…":"Rechercher"}</Button></form>{error?<p role="alert" className="mt-4 text-amber-200">{error}</p>:null}</GlassPanel>
    {result?<section className="mt-6 space-y-5"><GlassPanel className="p-6"><p className="text-sm text-muted-foreground">Code recherché</p><h2 className="mt-1 text-2xl font-bold">{result.code}</h2><p className="mt-2 text-accent">{result.found?"INFORMATIONS TROUVÉES":"AUCUN COLIS TROUVÉ"}</p></GlassPanel>
      <div className="grid gap-5 lg:grid-cols-2"><SourceCard title="MANIFESTE" source={result.manifest} render={(item)=><><p>Destination : {item.agency}</p><p>Date : {item.date||"—"}</p><p>Poids : {item.weightKg??"—"} kg</p><p>Statut : {item.status}</p><p>Ligne : {item.rowNumber}</p></>}/><SourceCard title="STOCKAGE V2" source={result.storage} render={(item)=><><p>Agence : {item.agency}</p><p>Poids : {item.weightKg} kg</p><p>État : {item.status}</p><p>Dernière mise à jour : {item.updatedAt}</p><p>Dernier événement : {item.lastEvent?.type??"—"}</p></>}/><SourceCard title="ENCAISSEMENTS" source={result.payments} render={(item)=><><p>Montant attendu : {item.montantAttendu??"—"}</p><p>Montant payé : {item.montantPaye}</p><p>Statut : {item.statutPaiement}</p><p>Agence : {item.agenceEncaissement}</p><p>Date : {item.dateTime}</p><p>Mode : {item.modePaiement||"—"}</p><p>Référence : {item.reference||"—"}</p></>}/><SourceCard title="QR" source={result.qr} render={(item)=><><p>QR visible : {String(item.displayNumber).padStart(3,"0")}</p><p>qrId : {item.qrId}</p><p>Statut : {item.status}</p><p>Version : {item.version}</p><p>Association : {item.agency??"—"} + {item.trackingCode??"—"}</p><p>Date d’association : {item.assignedAt??"—"}</p><p>Audit : {item.audit.map((event)=>event.action).join(", ")||"—"}</p></>}/></div>
    </section>:null}
  </Container></main>;
}

function SourceCard<T>({title,source,render}:{title:string;source:{state:keyof typeof sourceLabel;matches:T[]};render:(item:T)=>React.ReactNode}) { return <GlassPanel className="p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xl font-semibold">{title}</h3><span className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold">{sourceLabel[source.state]}</span></div>{source.matches.length>1?<p className="mt-3 font-bold text-amber-200">PLUSIEURS CORRESPONDANCES TROUVÉES</p>:null}<div className="mt-4 space-y-3 text-sm">{source.matches.map((item,index)=><div key={index} className="rounded-lg border border-white/10 bg-white/5 p-4">{render(item)}</div>)}</div></GlassPanel>; }
