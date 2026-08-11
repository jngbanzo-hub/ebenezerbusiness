"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, LogOut, RefreshCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { formatStockageWeight } from "@/features/stockages/presentation";

type Account = { agency: string; status: "SUSPENDED" | "ACTIVE"; current_parcel_count: number; current_weight_kg: number };
type Parcel = { trackingCode: string; agency: string; weightKg: number; status: string; arrivedAt: string | null; arrivalAgent: string | null };
type Response = { account: Account; parcels: Parcel[] };

const ALLOWED_AGENCIES = new Set(["FIH", "LSHI", "KLZ"]);

export function storageParcelStatusLabel(status: string) {
  const normalized = status.trim().toUpperCase();
  const labels: Record<string, string> = { AVAILABLE: "DISPONIBLE", PRESENT: "PRÉSENT", PAID: "PAYÉ", DELIVERED: "LIVRÉ", RELEASED: "REMIS" };
  return labels[normalized] ?? normalized.replaceAll("_", " ").toLocaleUpperCase("fr-FR");
}

export function AdminStorageAgencyDetailPage({ agency }: { agency: string }) {
  const normalizedAgency = agency.trim().toUpperCase();
  const [data, setData] = useState<Response | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [date, setDate] = useState("");
  const load = useCallback(async () => {
    if (!ALLOWED_AGENCIES.has(normalizedAgency)) { setMessage("Agence Stockage non prise en charge."); return; }
    try { setMessage(""); setData(await request<Response>(`/api/admin/stockages/v2/parcels?agency=${encodeURIComponent(normalizedAgency)}`)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Détail du Stockage indisponible."); }
  }, [normalizedAgency]);
  useEffect(() => { void load(); }, [load]);
  const statuses = useMemo(() => Array.from(new Set((data?.parcels ?? []).map((parcel) => parcel.status))).sort(), [data]);
  const filtered = useMemo(() => (data?.parcels ?? []).filter((parcel) => {
    const dateKey = parcel.arrivedAt ? parcel.arrivedAt.slice(0, 10) : "";
    return (!query || parcel.trackingCode.includes(query.trim().toUpperCase())) && (status === "ALL" || parcel.status === status) && (!date || dateKey === date);
  }), [data, date, query, status]);
  return <main className="min-h-screen bg-slate-950 py-8 text-white"><div className="mx-auto max-w-7xl space-y-6 px-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin/stockages" className="inline-flex items-center gap-2 text-sm text-lime-300"><ArrowLeft className="h-4 w-4" />Retour aux Stockages</Link><h1 className="mt-2 text-3xl font-bold">Détail Stockage {normalizedAgency}</h1><p className="mt-1 text-sm text-slate-400">Consultation en lecture seule des colis physiquement présents.</p></div><Button variant="outline" onClick={() => void getSupabaseBrowserClient().auth.signOut()}><LogOut className="mr-2 h-4 w-4" />Déconnexion</Button></header>
    {data && <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Agence" value={data.account.agency} /><Metric label="Statut Stockage" value={data.account.status} /><Metric label="Nombre total" value={`${data.account.current_parcel_count} colis`} /><Metric label="Poids total" value={formatStockageWeight(Number(data.account.current_weight_kg))} /></section>}
    <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm">Rechercher un code<div className="relative mt-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-950 py-2 pl-9 pr-3" /></div></label><label className="text-sm">Statut<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2"><option value="ALL">Tous</option>{statuses.map((item) => <option key={item} value={item}>{storageParcelStatusLabel(item)}</option>)}</select></label><label className="text-sm">Date d’arrivée<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label><Button variant="outline" className="self-end" onClick={() => { setQuery(""); setStatus("ALL"); setDate(""); }}>Réinitialiser</Button></div></section>
    <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="text-slate-400"><th className="pb-3">Code</th><th className="pb-3">Poids</th><th className="pb-3">Statut</th><th className="pb-3">Date arrivée</th><th className="pb-3">Heure arrivée</th><th className="pb-3">Agent</th></tr></thead><tbody>{filtered.map((parcel) => { const moment = formatArrival(parcel.arrivedAt); return <tr key={`${parcel.agency}-${parcel.trackingCode}`} className="border-t border-white/10"><td className="py-3 font-semibold text-white">{parcel.trackingCode}</td><td>{formatStockageWeight(parcel.weightKg)}</td><td><span className="rounded-full border border-lime-400/25 bg-lime-400/10 px-2 py-1 text-xs text-lime-300">{storageParcelStatusLabel(parcel.status)}</span></td><td>{moment.date}</td><td>{moment.time}</td><td>{parcel.arrivalAgent || "Non disponible"}</td></tr>; })}</tbody></table>{data && filtered.length === 0 && <p className="py-8 text-center text-slate-400">Aucun colis actuellement présent.</p>}{!data && <p className="py-8 text-center text-slate-400">{message || "Chargement…"}</p>}</div>{message && data && <p className="mt-4 text-sm text-amber-300">{message}</p>}<Button variant="outline" className="mt-4" onClick={() => void load()}><RefreshCcw className="mr-2 h-4 w-4" />Actualiser</Button></section>
  </div></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-lime-400/25 bg-slate-900 p-5"><p className="text-xs uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-lime-300">{value}</p></div>; }
function formatArrival(value: string | null) { if (!value) return { date: "Non disponible", time: "Non disponible" }; const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return { date: "Non disponible", time: "Non disponible" }; return { date: new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Porto-Novo", day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed), time: new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Porto-Novo", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed) }; }
async function request<T>(url: string): Promise<T> { const { data: { session } } = await getSupabaseBrowserClient().auth.getSession(); if (!session?.access_token) throw new Error("Session expirée."); const response = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }); const payload = await response.json().catch(() => null) as Record<string, unknown> | null; if (!response.ok) throw new Error(typeof payload?.message === "string" ? payload.message : "Détail du Stockage indisponible."); return payload as T; }
