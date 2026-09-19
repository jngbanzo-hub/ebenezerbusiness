"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banknote, CircleAlert, LoaderCircle, LogOut } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import type { AdminCashDashboard, CashDashboard } from "./cash-dashboard";
import { loadAdminCash, loadAgentCash } from "./cash-dashboard-client";

export function AgentCashDashboardView() {
  const [data, setData] = useState<CashDashboard | null | undefined>();
  const [outsideCash, setOutsideCash] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); void (async () => { try { const response = await authenticatedRead(getSupabaseBrowserClient().auth, "/api/agent/cash", { signal: controller.signal }); const result = await readJsonOrThrow<Awaited<ReturnType<typeof loadAgentCash>>>(response, "Lecture Caisse impossible."); if (!controller.signal.aborted) { setData(result.cash); setOutsideCash(result.outsideCash); } } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Lecture impossible."); } })(); return () => controller.abort(); }, []);
  if (outsideCash) return <GlassPanel className="mt-8 p-6"><Badge>Hors caisse</Badge><h2 className="mt-3 text-xl font-semibold">Aucune caisse COO</h2><p className="mt-2 text-sm text-muted-foreground">Les encaissements COO restent des recettes hors caisse. Aucun solde ni aucune clôture ne s’applique.</p></GlassPanel>;
  if (error) return <LoadState error={error} />;
  if (data === undefined) return <LoadState />;
  return data ? <AgencyCashPanel cash={data} /> : null;
}

export function AgentCashPage() {
  const router = useRouter();
  async function handleSignOut() { await signOutAgent(); router.replace("/auth/sign-in"); router.refresh(); }
  return <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12"><Container><header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between"><div><Link href="/agent" className="text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">← Retour au tableau de bord</Link><Badge variant="growth" className="mt-4 block w-fit">Caisse</Badge><h1 className="mt-3 text-3xl font-semibold">Caisse de votre agence</h1><p className="mt-2 text-sm text-muted-foreground">Consultation en lecture seule du solde, des mouvements et de l’historique.</p></div><Button type="button" variant="outline" onClick={handleSignOut}><LogOut className="h-4 w-4" />Se déconnecter</Button></header><AgentCashDashboardView /></Container></main>;
}

export function AdminCashDashboardView({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<AdminCashDashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void (async () => { try { const response = await authenticatedRead(getSupabaseBrowserClient().auth, "/api/admin/cash", {}, fetch, accessToken); const value = await readJsonOrThrow<AdminCashDashboard>(response, "Lecture de la Caisse impossible."); if (active) setData(value); } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Lecture impossible."); } })(); return () => { active = false; }; }, [accessToken]);
  if (error) return <LoadState error={error} />;
  if (!data) return <LoadState />;
  return <section className="mt-8"><div><h2 className="text-2xl font-semibold">Caisses des agences</h2><p className="mt-2 text-sm text-muted-foreground">Date métier {data.businessDate} · Africa/Porto-Novo · consultation sécurisée</p></div><div className="mt-5 grid gap-5 xl:grid-cols-3">{data.agencies.map((cash) => <AgencyCashPanel key={cash.agency} cash={cash} compact />)}</div><GlassPanel className="mt-6 p-6"><Badge>Hors caisse</Badge><h3 className="mt-3 text-xl font-semibold">Recettes COO hors caisse</h3><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Encaissements" value={String(data.cooOutsideCash.paymentCount)} /><Metric label="Montant" value={usd(data.cooOutsideCash.paymentsTotal)} /><Metric label="Dépenses COO" value={usd(data.cooOutsideCash.expensesTotal)} /></div><AgentBreakdown rows={data.cooOutsideCash.byAgent} /></GlassPanel><GlassPanel className="mt-6 p-6"><h3 className="text-xl font-semibold">Contrôles Admin</h3><p className="mt-2 text-sm text-muted-foreground">Ajustement, correction compensatoire, clôture et réouverture restent soumis aux droits Admin et aux contrôles de sécurité. Les comptes SUSPENDED refusent ces commandes. Chaque action exige un motif et une confirmation finale, utilise un identifiant technique généré automatiquement et produit une trace d’Audit immutable. Les soldes initiaux sont désormais traités exclusivement par procédure contrôlée hors interface quotidienne.</p><p className="mt-3 text-sm">Audit disponible : {data.audit.length} trace{data.audit.length === 1 ? "" : "s"}.</p></GlassPanel></section>;
}

function AgencyCashPanel({ cash, compact = false }: { cash: CashDashboard; compact?: boolean }) { return <GlassPanel className="mt-8 p-5 sm:p-6" glow="growth"><div className="flex items-center justify-between gap-3"><div><Badge variant={cash.accountStatus === "ACTIVE" ? "growth" : "default"}>{cash.accountStatus}</Badge><h2 className="mt-3 text-xl font-semibold">Caisse {cash.agency}</h2><p className="mt-1 text-xs text-muted-foreground">Date métier {cash.businessDate}</p></div><Banknote className="h-7 w-7 text-accent" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Metric label="Solde d’ouverture" value={usd(cash.openingBalance)} /><Metric label="Solde actuel" value={usd(cash.currentBalance)} /><Metric label={`Encaissements (${cash.paymentCount})`} value={usd(cash.paymentsTotal)} /><Metric label="Dépenses USD" value={usd(cash.expensesTotal)} /><Metric label="Corrections nettes" value={usd(cash.correctionsNet)} /><Metric label="Solde initial" value={cash.initialBalance === null ? "Non défini" : usd(cash.initialBalance)} /></div><p className="mt-4 text-xs text-muted-foreground">Calcul : ouverture + encaissements − dépenses + corrections nettes.</p><AgentBreakdown rows={cash.byAgent} />{!compact ? <div className="mt-5"><h3 className="font-semibold">Historique journalier</h3>{cash.history.length ? <ul className="mt-2 space-y-2 text-sm">{cash.history.map((row) => <li key={`${row.businessDate}-${row.version}`} className="rounded border border-white/10 p-3">{row.businessDate} · {row.status} · {usd(row.closingBalance)}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Aucune clôture disponible.</p>}</div> : <p className="mt-4 text-sm text-muted-foreground">{cash.history.length} clôture(s) · {cash.anomalies.length} anomalie(s)</p>}</GlassPanel>; }
function AgentBreakdown({ rows }: { rows: CashDashboard["byAgent"] }) { return <div className="mt-5"><h3 className="font-semibold">Détail par agent</h3>{rows.length ? <ul className="mt-2 space-y-2 text-sm">{rows.map((row) => <li key={row.actorUserId} className="flex justify-between gap-3 rounded border border-white/10 p-3"><span>{row.actorName} · {row.paymentCount} paiement(s)</span><strong>{usd(row.amountCollected)}</strong></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Aucun encaissement pour cette date.</p>}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded border border-white/10 bg-white/[0.03] p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function LoadState({ error }: { error?: string }) { return <GlassPanel className="mt-8 p-6 text-center">{error ? <CircleAlert className="mx-auto h-6 w-6 text-red-200" /> : <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-accent" />}<p role={error ? "alert" : undefined} className="mt-3 text-sm text-muted-foreground">{error ?? "Chargement de la Caisse…"}</p></GlassPanel>; }
function usd(value: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(value); }
