"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { FileSearch, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { formatWeight } from "@/lib/format-weight";

type Row = { date: string; trackingCode: string; weightKg: number; status: string; sourceSite: string; presentInStorage: boolean; storageWeightKg: number | null; weightDifferenceKg: number | null };
type ResponseData = { agency: string; rows: Row[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type ManifestFilters = { code: string; status: string; from: string; to: string };
const EMPTY_FILTERS: ManifestFilters = { code: "", status: "", from: "", to: "" };
const COO_MANIFEST_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;

export function AgentManifestControl({ cooModule = false }: { cooModule?: boolean }) {
  const [data, setData] = useState<ResponseData | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<ManifestFilters>(EMPTY_FILTERS);
  const [manifestAgency, setManifestAgency] = useState<(typeof COO_MANIFEST_AGENCIES)[number]>("FIH");
  const requestSequence = useRef(0);
  const load = useCallback(async (page = 1, next: ManifestFilters = EMPTY_FILTERS, agency = manifestAgency) => {
    const sequence = ++requestSequence.current;
    setError("");
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
      if (!session?.access_token) throw new Error("Session expirée.");
      const params = new URLSearchParams({ ...next, page: String(page), pageSize: "25" });
      if (cooModule) {
        params.set("view", "coo");
        params.set("agency", agency);
      }
      const response = await fetch(`/api/agent/manifest?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as ResponseData | { message?: string } | null;
      if (!response.ok || !payload || !("rows" in payload)) throw new Error(payload && "message" in payload ? payload.message : "Lecture indisponible.");
      if (sequence === requestSequence.current) setData(payload);
    } catch (cause) { if (sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : "Lecture indisponible."); }
  }, [cooModule, manifestAgency]);
  useEffect(() => { void load(); }, [load]);
  function submit(event: FormEvent) { event.preventDefault(); void load(1, filters); }
  function selectAgency(agency: (typeof COO_MANIFEST_AGENCIES)[number]) {
    setManifestAgency(agency);
    setFilters(EMPTY_FILTERS);
    setData(null);
  }
  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    void load(1, EMPTY_FILTERS);
  }
  return <section className="mt-10 space-y-5 border-t border-white/10 pt-8" aria-labelledby="manifest-control-title">
    <header><h2 id="manifest-control-title" className="text-2xl font-semibold">{cooModule ? "MANIFESTE" : "CONTRÔLE MANIFESTE PUBLIC"} — {data?.agency ?? (cooModule ? manifestAgency : "AGENCE")}</h2><p className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">{cooModule ? "MANIFESTE PUBLIC — CONSULTATION EN LECTURE SEULE" : "Information de contrôle uniquement — le MANIFESTE PUBLIC ne détermine pas l’encaissement ni le Stockage."}</p></header>
    {cooModule ? <nav aria-label="Destination du Manifeste" className="grid gap-3 sm:grid-cols-3">{COO_MANIFEST_AGENCIES.map((agency) => <Button key={agency} type="button" variant={manifestAgency === agency ? "growth" : "outline"} onClick={() => selectAgency(agency)} aria-pressed={manifestAgency === agency}>{agency}</Button>)}</nav> : null}
    <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"><form onSubmit={submit} className="grid gap-3 md:grid-cols-4"><Field label="Rechercher un code"><input value={filters.code} onChange={(e)=>setFilters({...filters,code:e.target.value.toUpperCase()})} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-slate-950 px-3" /></Field><Field label="Statut"><select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-slate-950 px-3"><option value="">Tous</option>{["EN ATTENTE","ENREGISTRÉ","EN VOL","EN TRANSIT","ARRIVÉ","LIVRÉ"].map((s)=><option key={s}>{s}</option>)}</select></Field><Field label="Du"><input type="date" value={filters.from} onChange={(e)=>setFilters({...filters,from:e.target.value})} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-slate-950 px-3" /></Field><Field label="Au"><input type="date" value={filters.to} onChange={(e)=>setFilters({...filters,to:e.target.value})} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-slate-950 px-3" /></Field><div className="flex gap-3 md:col-span-4"><Button type="submit" variant="growth" className="flex-1"><FileSearch className="mr-2 h-4 w-4" />Filtrer</Button><Button type="button" variant="outline" onClick={resetFilters}>Réinitialiser</Button></div></form></section>
    {error ? <section className="rounded-xl border border-red-300/30 bg-red-300/10 p-4"><p>{error}</p><Button className="mt-3" variant="outline" onClick={()=>void load(1, filters)}><RefreshCcw className="mr-2 h-4 w-4" />Réessayer</Button></section> : null}
    <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr><th>Date</th><th>Code</th><th>Destination</th><th>Poids manifeste</th><th>Statut</th>{!cooModule ? <><th>Présent Stockage</th><th>Poids Stockage</th><th>Écart</th></> : null}</tr></thead><tbody>{data?.rows.map((row)=><tr key={`${row.sourceSite}-${row.trackingCode}-${row.date}`} className="border-t border-white/10"><td>{row.date||"—"}</td><td>{row.trackingCode}</td><td>{row.sourceSite}</td><td>{formatWeight(row.weightKg)}</td><td>{row.status}</td>{!cooModule ? <><td>{row.presentInStorage?"OUI":"NON"}</td><td>{row.storageWeightKg===null?"—":formatWeight(row.storageWeightKg)}</td><td>{row.weightDifferenceKg===null||row.weightDifferenceKg===0?"—":formatWeight(row.weightDifferenceKg)}</td></> : null}</tr>)}</tbody></table>{data && !data.rows.length ? <p className="py-6 text-slate-400">Aucune ligne ne correspond aux filtres.</p> : null}</div><div className="mt-4 flex items-center justify-between"><p className="text-sm text-slate-400">{data?.pagination.total ?? 0} résultat(s)</p><div className="flex gap-2"><Button variant="outline" disabled={!data||data.pagination.page<=1} onClick={()=>data&&void load(data.pagination.page-1, filters)}>Précédent</Button><Button variant="outline" disabled={!data||data.pagination.page>=data.pagination.totalPages} onClick={()=>data&&void load(data.pagination.page+1, filters)}>Suivant</Button></div></div></section>
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm">{label}{children}</label>; }
