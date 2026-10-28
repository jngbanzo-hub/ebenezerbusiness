"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, LogOut, RefreshCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { formatStockageWeight } from "@/features/stockages/presentation";

type Account = { agency: string; status: "SUSPENDED" | "ACTIVE"; current_parcel_count: number; current_weight_kg: number };
type Parcel = { parcelId: string; forwardingId?: string | null; trackingCode: string; displayCode?: string; agency: string; weightKg: number; status: string; arrivedAt: string | null; arrivalAgent: string | null };
type Response = { account: Account; parcels: Parcel[] };
type CorrectionPreview = {
  ready: boolean; enabled: boolean; blockers: string[];
  identity: { forwardingId: string; parcelId: string; trackingCode: string; originAgency: string; destinationAgency: string; weightKg: number; forwardingStatus: string; destinationParcelStatus: string | null };
  financial: { historicalExpectedUsd: number | null; historicalPaidUsd: number | null; source: string | null; manifestDate: string | null; forwardingExpectedUsd: number; state: string };
  effects: { destination: string; origin: string; payment: string; source: string };
};

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
  const [correction, setCorrection] = useState<{ parcel: Parcel; preview: CorrectionPreview | null; requestId: string; reason: string; physicalConfirmed: boolean; loading: boolean; error: string } | null>(null);
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
  const openCorrection = async (parcel: Parcel) => {
    if (!parcel.forwardingId) return;
    const requestId = crypto.randomUUID();
    setCorrection({ parcel, preview: null, requestId, reason: "", physicalConfirmed: false, loading: true, error: "" });
    try {
      const params = new URLSearchParams({ forwardingId: parcel.forwardingId, parcelId: parcel.parcelId, agency: normalizedAgency });
      const preview = await request<CorrectionPreview>(`/api/admin/stockages/v2/forwarding-correction?${params}`);
      setCorrection(current => current?.requestId === requestId ? { ...current, preview, loading: false } : current);
    } catch (error) {
      setCorrection(current => current?.requestId === requestId ? { ...current, loading: false, error: error instanceof Error ? error.message : "Vérification indisponible." } : current);
    }
  };
  const confirmCorrection = async () => {
    if (!correction?.preview?.ready || !correction.preview.enabled || !correction.physicalConfirmed || correction.reason.trim().length < 10 || correction.loading) return;
    const { parcel, requestId, reason } = correction;
    setCorrection(current => current ? { ...current, loading: true, error: "" } : current);
    try {
      const session = await getSupabaseBrowserClient().auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Session Admin expirée.");
      const response = await fetch("/api/admin/stockages/v2/forwarding-correction", {
        method: "POST", cache: "no-store", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ forwardingId: parcel.forwardingId, parcelId: parcel.parcelId, agency: normalizedAgency,
          requestId, reason: reason.trim(), physicalConfirmed: true })
      });
      await readJsonOrThrow(response, "Correction non effectuée.");
      setCorrection(null);
      await load();
    } catch (error) {
      setCorrection(current => current?.requestId === requestId ? { ...current, loading: false, error: error instanceof Error ? error.message : "Correction non effectuée." } : current);
    }
  };
  return <main className="min-h-screen bg-slate-950 py-8 text-white"><div className="mx-auto max-w-7xl space-y-6 px-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin/stockages" className="inline-flex items-center gap-2 text-sm text-lime-300"><ArrowLeft className="h-4 w-4" />Retour aux Stockages</Link><h1 className="mt-2 text-3xl font-bold">Détail Stockage {normalizedAgency}</h1><p className="mt-1 text-sm text-slate-400">Consultation en lecture seule des colis physiquement présents.</p></div><Button variant="outline" onClick={() => void getSupabaseBrowserClient().auth.signOut()}><LogOut className="mr-2 h-4 w-4" />Déconnexion</Button></header>
    {data && <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Agence" value={data.account.agency} /><Metric label="Statut Stockage" value={data.account.status} /><Metric label="Nombre total" value={`${data.account.current_parcel_count} colis`} /><Metric label="Poids total" value={formatStockageWeight(Number(data.account.current_weight_kg))} /></section>}
    <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm">Rechercher un code<div className="relative mt-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-950 py-2 pl-9 pr-3" /></div></label><label className="text-sm">Statut<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2"><option value="ALL">Tous</option>{statuses.map((item) => <option key={item} value={item}>{storageParcelStatusLabel(item)}</option>)}</select></label><label className="text-sm">Date d’arrivée<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label><Button variant="outline" className="self-end" onClick={() => { setQuery(""); setStatus("ALL"); setDate(""); }}>Réinitialiser</Button></div></section>
    <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="text-slate-400"><th className="pb-3">Code</th><th className="pb-3">Poids</th><th className="pb-3">Statut</th><th className="pb-3">Date arrivée</th><th className="pb-3">Heure arrivée</th><th className="pb-3">Agent</th></tr></thead><tbody>{filtered.map((parcel) => { const moment = formatArrival(parcel.arrivedAt); return <tr key={parcel.parcelId} className="border-t border-white/10"><td className="py-3 font-semibold text-white">{parcel.displayCode ?? parcel.trackingCode}{parcel.forwardingId && parcel.status === "AVAILABLE" ? <button type="button" className="mt-1 block text-xs font-normal text-amber-200 underline underline-offset-2 hover:text-amber-100" onClick={() => void openCorrection(parcel)}>Corriger l’acheminement</button> : null}</td><td>{formatStockageWeight(parcel.weightKg)}</td><td><span className="rounded-full border border-lime-400/25 bg-lime-400/10 px-2 py-1 text-xs text-lime-300">{storageParcelStatusLabel(parcel.status)}</span></td><td>{moment.date}</td><td>{moment.time}</td><td>{parcel.arrivalAgent || "Non disponible"}</td></tr>; })}</tbody></table>{data && filtered.length === 0 && <p className="py-8 text-center text-slate-400">Aucun colis actuellement présent.</p>}{!data && <p className="py-8 text-center text-slate-400">{message || "Chargement…"}</p>}</div>{message && data && <p className="mt-4 text-sm text-amber-300">{message}</p>}<Button variant="outline" className="mt-4" onClick={() => void load()}><RefreshCcw className="mr-2 h-4 w-4" />Actualiser</Button></section>
    {correction && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="correction-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-amber-300/30 bg-slate-900 p-5 shadow-2xl"><h2 id="correction-title" className="text-xl font-semibold">Corriger l’acheminement</h2><p className="mt-2 text-sm text-slate-300">Cette action corrige un enregistrement informatique erroné. Elle ne déclare aucun transport physique.</p>
      {correction.loading && !correction.preview ? <p className="mt-4 text-sm">Vérification des preuves…</p> : null}
      {correction.preview ? <div className="mt-4 space-y-2 text-sm"><p><strong>Colis :</strong> {correction.preview.identity.trackingCode} · {correction.preview.identity.weightKg} kg · identifiant {correction.preview.identity.parcelId}</p><p><strong>Trajet enregistré :</strong> {correction.preview.identity.originAgency} → {correction.preview.identity.destinationAgency}</p><p><strong>Code rétabli :</strong> {correction.preview.identity.trackingCode} à {correction.preview.identity.originAgency}, sans suffixe d’acheminement.</p><p><strong>Tarif d’origine vérifié :</strong> {correction.preview.financial.historicalExpectedUsd === null ? "NON VÉRIFIÉ" : `${correction.preview.financial.historicalExpectedUsd} USD`} · payé {correction.preview.financial.historicalPaidUsd ?? "N/C"} USD · source {correction.preview.financial.source ?? "indisponible"} · date {correction.preview.financial.manifestDate ?? "N/C"}</p><p><strong>Tarif d’acheminement distinct :</strong> {correction.preview.financial.forwardingExpectedUsd} USD.</p><p><strong>Stockages :</strong> {correction.preview.identity.destinationAgency} {correction.preview.effects.destination} ; {correction.preview.identity.originAgency} {correction.preview.effects.origin}.</p><p>Les paiements réels et l’historique seront conservés. Aucun faux retour physique n’est enregistré.</p>{correction.preview.blockers.length ? <p role="alert" className="text-amber-200">Correction bloquée : {correction.preview.blockers.join(" · ")}</p> : null}{!correction.preview.enabled ? <p role="status" className="text-amber-200">Prévisualisation : validation finale désactivée. Aucune correction de données possible.</p> : null}</div> : null}
      <label className="mt-4 block text-sm">Motif obligatoire<textarea value={correction.reason} onChange={event => setCorrection(current => current ? { ...current, reason: event.target.value } : current)} rows={3} className="mt-1 w-full rounded-lg border border-white/20 bg-slate-950 p-2" /></label>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={correction.physicalConfirmed} onChange={event => setCorrection(current => current ? { ...current, physicalConfirmed: event.target.checked } : current)} className="mt-1" />Je confirme que le colis est physiquement dans l’agence d’origine et qu’aucun retour physique fictif ne doit être enregistré.</label>
      {correction.error ? <p role="alert" className="mt-3 text-sm text-red-300">{correction.error}</p> : null}<div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setCorrection(null)} disabled={correction.loading}>Fermer sans corriger</Button><Button onClick={() => void confirmCorrection()} disabled={!correction.preview?.ready || !correction.preview.enabled || !correction.physicalConfirmed || correction.reason.trim().length < 10 || correction.loading}>Confirmer la correction</Button></div>
    </section></div>}
  </div></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-lime-400/25 bg-slate-900 p-5"><p className="text-xs uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-lime-300">{value}</p></div>; }
function formatArrival(value: string | null) { if (!value) return { date: "Non disponible", time: "Non disponible" }; const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return { date: "Non disponible", time: "Non disponible" }; return { date: new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Porto-Novo", day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed), time: new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Porto-Novo", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed) }; }
async function request<T>(url: string): Promise<T> {
  const response = await authenticatedRead(getSupabaseBrowserClient().auth, url);
  return readJsonOrThrow<T>(response, "Détail du Stockage indisponible.");
}
