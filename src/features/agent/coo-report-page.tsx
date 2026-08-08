"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminPayment } from "@/features/admin/types";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { CooReport, CooReportExpense } from "@/server/coo-report";

type Tab = "PAYMENTS" | "EXPENSES";
const field = "h-11 rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none focus:border-accent";

export function CooReportPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("PAYMENTS");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [report, setReport] = useState<CooReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (filters?: { from?: string; to?: string; code?: string; label?: string }) => {
    setLoading(true); setError("");
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
      if (!session?.access_token) { router.replace("/auth/sign-in"); return; }
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters ?? {})) if (value) query.set(key, value);
      const response = await fetch(`/api/agent/coo-report${query.size ? `?${query}` : ""}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as CooReport | { message?: string } | null;
      if (!response.ok || !payload || !("readOnly" in payload)) throw new Error(payload && "message" in payload ? payload.message : "Rapport COO indisponible.");
      setReport(payload); setFrom(payload.from); setTo(payload.to);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rapport COO indisponible."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  function submit(event: FormEvent) { event.preventDefault(); void load({ from, to, code: tab === "PAYMENTS" ? code : undefined, label: tab === "EXPENSES" ? label : undefined }); }
  function reset() { setCode(""); setLabel(""); void load(); }

  return <section className="mt-6" aria-labelledby="coo-report-title">
    <Badge variant="growth">Lecture seule</Badge>
    <h1 id="coo-report-title" className="mt-3 text-3xl font-semibold">Rapport COO</h1>
    <p className="mt-2 text-sm text-muted-foreground">Encaissements et Dépenses de l’agence COO. Aucune Caisse COO n’existe.</p>
    <div className="mt-6 grid grid-cols-2 gap-3"><Button type="button" variant={tab === "PAYMENTS" ? "growth" : "outline"} onClick={() => setTab("PAYMENTS")}>Encaissements</Button><Button type="button" variant={tab === "EXPENSES" ? "growth" : "outline"} onClick={() => setTab("EXPENSES")}>Dépenses</Button></div>
    <GlassPanel className="mt-5 p-5"><form className="grid gap-4 md:grid-cols-4 md:items-end" onSubmit={submit}><label className="grid gap-2 text-sm">Date début<input className={field} type="date" required value={from} onChange={(event) => setFrom(event.target.value)}/></label><label className="grid gap-2 text-sm">Date fin<input className={field} type="date" required value={to} onChange={(event) => setTo(event.target.value)}/></label>{tab === "PAYMENTS" ? <label className="grid gap-2 text-sm">Code colis<input className={field} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Rechercher un code"/></label> : <label className="grid gap-2 text-sm">Libellé<input className={field} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Catégorie ou description"/></label>}<div className="flex gap-2"><Button type="submit" variant="growth">Filtrer</Button><Button type="button" variant="outline" onClick={reset}>Réinitialiser</Button></div></form></GlassPanel>
    {loading ? <p className="mt-6 text-muted-foreground">Chargement du rapport…</p> : null}
    {error ? <p role="alert" className="mt-6 rounded-md border border-red-400/25 bg-red-400/10 p-4 text-red-200">{error}</p> : null}
    {!loading && !error && report ? tab === "PAYMENTS" ? <Payments report={report}/> : <Expenses report={report}/> : null}
  </section>;
}

function Payments({ report }: { report: CooReport }) {
  return <GlassPanel className="mt-6 overflow-hidden"><Summary title="Recettes COO hors caisse" count={report.summary.paymentCount} total={`${money(report.summary.paymentsTotalUsd)} USD`}/><Table headings={["Date / heure", "Code colis", "Destination", "Montant payé", "Mode", "Agent", "Référence", "Observation"]} rows={report.payments.map(paymentRow)}/></GlassPanel>;
}
function Expenses({ report }: { report: CooReport }) {
  const totals = Object.entries(report.summary.expensesByCurrency).map(([currency, amount]) => `${money(amount)} ${currency}`).join(" · ") || "0";
  return <GlassPanel className="mt-6 overflow-hidden"><Summary title="Dépenses COO" count={report.summary.expenseCount} total={totals}/><Table headings={["Date / heure", "Libellé", "Montant", "Agent", "Observation / justificatif"]} rows={report.expenses.map(expenseRow)}/></GlassPanel>;
}
function Summary({ title, count, total }: { title: string; count: number; total: string }) { return <div className="grid gap-3 border-b border-white/10 p-5 sm:grid-cols-2"><div><p className="text-sm text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold text-accent">{count}</p></div><div><p className="text-sm text-muted-foreground">Montant total</p><p className="mt-1 text-2xl font-semibold text-accent">{total}</p></div></div>; }
function Table({ headings, rows }: { headings: string[]; rows: string[][] }) { return rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-white/[0.04] text-xs uppercase text-muted-foreground"><tr>{headings.map((heading) => <th className="px-4 py-3" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{rows.map((row, index) => <tr key={`${row[0]}-${row[1]}-${index}`}>{row.map((value, cell) => <td className="px-4 py-3" key={cell}>{value || "—"}</td>)}</tr>)}</tbody></table></div> : <p className="p-6 text-center text-muted-foreground">Aucune opération COO ne correspond aux filtres.</p>; }
function paymentRow(row: AdminPayment) { return [dateTime(row.dateTime), row.codeColis, row.destination, `${money(row.montantPaye)} USD`, row.modePaiement, row.agent, row.reference, row.observation]; }
function expenseRow(row: CooReportExpense) { return [dateTime(row.dateHeure), row.categorie || row.description, `${money(row.montant)} ${row.devise}`, row.agent, row.observation || row.reference || row.description]; }
function money(value: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value); }
function dateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Porto-Novo" }).format(date); }
