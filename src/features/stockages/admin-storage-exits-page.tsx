"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { portoNovoDateKey, type StorageExitPeriod, type StorageExitRow } from "@/features/stockages/admin-storage-exits-model";
import { formatStockageWeight } from "@/features/stockages/presentation";

type Report = {
  agency: string;
  timezone: "Africa/Porto-Novo";
  asOf: string;
  interval: { fromDate: string; toDate: string };
  items: StorageExitRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { complete: boolean; count: number | null; weightKg: number | null; issues: string[] };
};

const AGENCIES = new Set(["FIH", "KLZ", "LSHI"]);
const PERIODS: Array<{ value: StorageExitPeriod; label: string }> = [
  { value: "today", label: "Aujourd’hui" },
  { value: "yesterday", label: "Hier" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
  { value: "year", label: "Année" },
  { value: "custom", label: "Personnalisé" }
];

export function AdminStorageExitsPage({ agency }: { agency: string }) {
  const normalizedAgency = agency.trim().toUpperCase();
  const [period, setPeriod] = useState<StorageExitPeriod>("today");
  const [year, setYear] = useState(portoNovoDateKey(new Date()).slice(0, 4));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const requestSequence = useRef(0);
  const customRangeReversed = period === "custom" && from !== "" && to !== "" && from > to;
  const canRead = AGENCIES.has(normalizedAgency) && (period !== "custom" || (from !== "" && to !== "" && !customRangeReversed));

  const query = useMemo(() => {
    const params = new URLSearchParams({ agency: normalizedAgency, period, page: String(page) });
    if (period === "year") params.set("year", year);
    if (period === "custom") { params.set("from", from); params.set("to", to); }
    return params.toString();
  }, [normalizedAgency, period, year, from, to, page]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    setReport(null);
    if (!AGENCIES.has(normalizedAgency)) { setMessage("Agence Stockage non prise en charge."); return; }
    if (customRangeReversed) { setMessage("La date de début doit être antérieure ou égale à la date de fin."); return; }
    if (!canRead) { setMessage("Choisissez une date de début et une date de fin."); return; }
    setMessage("Chargement de l’historique complet de la période…");
    void authenticatedRead(getSupabaseBrowserClient().auth, `/api/admin/stockages/v2/exits?${query}`)
      .then((response) => readJsonOrThrow<Report>(response, "Historique des sorties indisponible ou incomplet."))
      .then((data) => { if (requestSequence.current === sequence) { setReport(data); setMessage(""); } })
      .catch((error: unknown) => { if (requestSequence.current === sequence) setMessage(error instanceof Error ? error.message : "Historique des sorties indisponible ou incomplet."); });
    return () => { requestSequence.current += 1; };
  }, [canRead, customRangeReversed, normalizedAgency, query]);

  const changePeriod = (value: StorageExitPeriod) => { setPeriod(value); setPage(1); };
  return <main className="min-h-screen bg-slate-950 py-8 text-white"><div className="mx-auto max-w-7xl space-y-6 px-4">
    <header><Link href="/admin/stockages" className="text-sm text-lime-300">← Retour aux Stockages</Link><h1 className="mt-2 text-3xl font-bold">Codes sortis — {normalizedAgency}</h1><p className="mt-1 text-sm text-slate-400">Historique physique en lecture seule · dates et heures Africa/Porto-Novo</p></header>
    <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
      <div className="flex flex-wrap gap-2" aria-label="Période des sorties">{PERIODS.map((option) => <button key={option.value} type="button" onClick={() => changePeriod(option.value)} aria-pressed={period === option.value} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold ${period === option.value ? "border-lime-400 bg-lime-400/15 text-lime-300" : "border-white/15 text-slate-300 hover:bg-white/5"}`}>{option.label}</button>)}</div>
      {period === "year" && <label className="mt-4 block max-w-48 text-sm">Année<input type="number" min="2000" max="2100" value={year} onChange={(event) => { setYear(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label>}
      {period === "custom" && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Date de début<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label><label className="text-sm">Date de fin incluse<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label></div>}
      {report && <p className="mt-3 text-sm text-slate-400">Du {formatDay(report.interval.fromDate)} au {formatDay(report.interval.toDate)} inclus · données arrêtées au {formatMoment(report.asOf)}</p>}
    </section>
    {message && <p role="status" className="rounded-xl border border-amber-400/25 bg-slate-900 p-4 text-amber-200">{message}</p>}
    {report && <>
      <section className="grid gap-4 sm:grid-cols-2"><Metric label="Nombre de sorties" value={report.summary.complete ? String(report.summary.count) : "NON CERTIFIABLE"} /><Metric label="Poids total sorti" value={report.summary.complete && report.summary.weightKg !== null ? formatStockageWeight(report.summary.weightKg) : "NON CERTIFIABLE"} /></section>
      {!report.summary.complete && <section className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200"><p className="font-semibold">Total non certifiable : une ou plusieurs sorties nécessitent une vérification.</p><ul className="mt-2 list-inside list-disc">{report.summary.issues.slice(0, 10).map((issue) => <li key={issue}>{issue}</li>)}</ul>{report.summary.issues.length > 10 && <p>{report.summary.issues.length - 10} autre(s) cas à vérifier.</p>}</section>}
      <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="text-slate-400"><th className="pb-3">Code exact</th><th className="pb-3">Poids sorti</th><th className="pb-3">Date et heure de sortie</th><th className="pb-3">Type</th><th className="pb-3">Correction</th></tr></thead><tbody>{report.items.map((item) => <tr key={item.eventId} className="border-t border-white/10 align-top"><td className="py-3 font-semibold text-white">{item.trackingCode || "NON CERTIFIABLE"}<small className="mt-1 block break-all font-normal text-slate-500">Événement : {item.eventId}{item.parcelId ? ` · Colis : ${item.parcelId}` : ""}{item.forwardingId ? ` · Acheminement : ${item.forwardingId}` : ""}</small></td><td className="py-3">{item.weightKg === null ? "À vérifier" : formatStockageWeight(item.weightKg)}</td><td className="py-3">{formatMoment(item.occurredAt)}</td><td className="py-3">{item.type === "ACHEMINEMENT" ? "Acheminement" : "Livraison / remise"}</td><td className="py-3">{correctionLabel(item)}{item.correctionReason && <small className="mt-1 block text-slate-400">{item.correctionReason}</small>}{item.correction === "ADJUSTED" && item.countedWeightKg !== null && <small className="mt-1 block text-slate-400">Contribution corrigée : {formatStockageWeight(item.countedWeightKg)}</small>}</td></tr>)}</tbody></table>{report.items.length === 0 && <p className="py-8 text-center text-slate-400">Aucune sortie pour cette période.</p>}</div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"><span>{report.pagination.total} événement(s) de sortie · page {report.pagination.page} / {Math.max(report.pagination.totalPages, 1)}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-white/20 px-4 py-2 disabled:opacity-40">Précédent</button><button type="button" disabled={page >= report.pagination.totalPages} onClick={() => setPage(page + 1)} className="rounded-lg border border-white/20 px-4 py-2 disabled:opacity-40">Suivant</button></div></div>
      </section>
    </>}
  </div></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-lime-400/25 bg-slate-900 p-5"><p className="text-xs uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-lime-300">{value}</p></div>; }
function formatDay(value: string) { return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00Z`)); }
function formatMoment(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "À vérifier" : new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Porto-Novo", dateStyle: "short", timeStyle: "short" }).format(date); }
function correctionLabel(row: StorageExitRow) { return row.correction === "NONE" ? "—" : row.correction === "ADJUSTED" ? "Corrigée" : row.correction === "CANCELLED" ? "Annulée — exclue des totaux" : "À vérifier — totaux suspendus"; }
