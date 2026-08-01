"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Boxes, ClipboardCheck, LogOut, RefreshCcw, ShieldCheck, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";

type Account = { agency: string; status: "SUSPENDED" | "ACTIVE"; current_parcel_count: number; current_weight_kg: number; version: number; opened_business_date: string | null };
type EventRow = { event_id: string; event_type: string; agency?: string; business_date: string; occurred_at: string; parcel_count_delta: number; weight_kg_delta: number; tracking_code?: string | null; arrival_reference?: string | null; actor_name: string };
type Activity = { agency: string; business_date: string; actor_name: string; arrivals: number; deliveries: number; arrived_weight_kg: number; delivered_weight_kg: number };
type AgentData = { mode: "V2"; account: Account; events: EventRow[]; activity: Activity[]; actionsEnabled: boolean };
type AdminData = { mode: "V2"; accounts: Account[]; events: EventRow[]; activity: Activity[]; anomalies: Array<Record<string, unknown>>; audit: Array<Record<string, unknown>> };

export function AgentStockagesV2Page() {
  const [data, setData] = useState<AgentData | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try { setMessage(""); setData(await request<AgentData>("/api/agent/stockages")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Stockages indisponible."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <Shell back="/agent" title="Stockages"><Notice text={message || "Chargement…"} /><Button onClick={() => void load()} variant="outline"><RefreshCcw className="mr-2 h-4 w-4" />Réessayer</Button></Shell>;
  return <Shell back="/agent" title={`Stockages ${data.account.agency}`}>
    <AccountCards accounts={[data.account]} />
    {!data.actionsEnabled && <Notice text="Stockage non ouvert — solde initial requis" />}
    <div className="grid gap-5 lg:grid-cols-2">
      <AgentCommandForm title="Déclarer un arrivage" endpoint="/api/agent/stockages/arrival" disabled={!data.actionsEnabled} fields="arrival" onDone={load} />
      <AgentCommandForm title="Confirmer une livraison" endpoint="/api/agent/stockages/delivery" disabled={!data.actionsEnabled} fields="delivery" onDone={load} />
    </div>
    <EventTable title="Arrivages et livraisons récents" rows={data.events} />
    <ActivityTable rows={data.activity} />
    {message && <Notice text={message} />}
  </Shell>;
}

export function AdminStockagesV2Page() {
  const [data, setData] = useState<AdminData | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { try { setMessage(""); setData(await request<AdminData>("/api/admin/stockages/v2")); } catch (error) { setMessage(error instanceof Error ? error.message : "Stockages indisponible."); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <Shell back="/admin" title="Stockages — Administration"><Notice text={message || "Chargement…"} /></Shell>;
  return <Shell back="/admin" title="Stockages — Administration">
    <Notice text="Stockages V2 en Preview. FIH, LSHI et KLZ restent indépendants et SUSPENDED tant que leur solde initial n’est pas validé. COO est exclu." />
    <AccountCards accounts={data.accounts} />
    <div className="grid gap-5 xl:grid-cols-2">
      <AdminCommandForm action="OPENING" title="Solde initial" accounts={data.accounts} onDone={load} />
      <AdminCommandForm action="ADJUSTMENT" title="Ajustement CREDIT / DEBIT" accounts={data.accounts} onDone={load} />
      <AdminCommandForm action="CORRECTION" title="Correction compensatoire" accounts={data.accounts} onDone={load} />
      <AdminCommandForm action="RESOLVE_ANOMALY" title="Résoudre une anomalie" accounts={data.accounts} onDone={load} />
    </div>
    <EventTable title="Mouvements consolidés" rows={data.events} />
    <ActivityTable rows={data.activity} />
    <JsonList title="Anomalies" rows={data.anomalies} />
    <JsonList title="Audit immutable" rows={data.audit} />
    {message && <Notice text={message} />}
  </Shell>;
}

function AgentCommandForm({ title, endpoint, disabled, fields, onDone }: { title: string; endpoint: string; disabled: boolean; fields: "arrival" | "delivery"; onDone: () => Promise<void> }) {
  const [result, setResult] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    if (!window.confirm(`Confirmer : ${title} ?`)) return;
    const payload = fields === "arrival" ? { parcelCount: Number(values.get("parcelCount")), weightKg: Number(values.get("weightKg")), reference: values.get("reference"), observation: values.get("observation"), requestId: crypto.randomUUID() } : { trackingCode: values.get("trackingCode"), physicalDeliveryConfirmed: true, requestId: crypto.randomUUID() };
    try { const response = await request<{ replayed?: boolean }>(endpoint, payload); setResult(response.replayed ? "Commande déjà enregistrée : rejeu idempotent." : "Commande enregistrée avec succès."); form.reset(); await onDone(); } catch (error) { setResult(error instanceof Error ? error.message : "Commande refusée."); }
  }
  return <Panel title={title}><form className="space-y-3" onSubmit={submit}>
    {fields === "arrival" ? <><Input name="parcelCount" type="number" label="Nombre de colis" min="1" required /><Input name="weightKg" type="number" label="Poids total (kg)" min="0.001" step="0.001" required /><Input name="reference" label="Référence d’arrivage" /><Input name="observation" label="Observation" /></> : <><Input name="trackingCode" label="Code colis" required /><p className="text-xs text-slate-400">Le poids est résolu côté serveur depuis le Manifeste; aucune saisie Agent.</p></>}
    <Button disabled={disabled} className="w-full bg-lime-400 text-slate-950 hover:bg-lime-300">{disabled ? "Solde initial requis" : title}</Button>{result && <p className="text-sm text-slate-300">{result}</p>}
  </form></Panel>;
}

function AdminCommandForm({ action, title, accounts, onDone }: { action: string; title: string; accounts: Account[]; onDone: () => Promise<void> }) {
  const [result, setResult] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); if (!window.confirm(`Confirmation finale : ${title} ?`)) return; try { const body = { ...values, action, requestId: crypto.randomUUID(), confirmed: true, parcelCount: Number(values.parcelCount ?? 0), weightKg: Number(values.weightKg ?? 0), correctedParcelDelta: Number(values.correctedParcelDelta ?? 0), correctedWeightDelta: Number(values.correctedWeightDelta ?? 0) }; const response = await request<{ replayed?: boolean }>("/api/admin/stockages/v2", body); setResult(response.replayed ? "Rejeu idempotent confirmé." : "Commande enregistrée."); form.reset(); await onDone(); } catch (error) { setResult(error instanceof Error ? error.message : "Commande refusée."); } }
  return <Panel title={title}><form className="space-y-3" onSubmit={submit}>
    {action !== "CORRECTION" && action !== "RESOLVE_ANOMALY" && <label className="block text-sm">Agence<select name="agency" required className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2">{accounts.map((a) => <option key={a.agency}>{a.agency}</option>)}</select></label>}
    {action === "OPENING" && <><Input name="parcelCount" type="number" min="0" label="Nombre initial de colis" required /><Input name="weightKg" type="number" min="0" step="0.001" label="Poids initial (kg)" required /><Input name="observation" label="Observation" /></>}
    {action === "ADJUSTMENT" && <><label className="block text-sm">Direction<select name="direction" className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2"><option>CREDIT</option><option>DEBIT</option></select></label><Input name="parcelCount" type="number" min="0" label="Variation colis" required /><Input name="weightKg" type="number" min="0" step="0.001" label="Variation poids" required /></>}
    {action === "CORRECTION" && <><Input name="targetEventId" label="Event ID cible" required /><Input name="correctedParcelDelta" type="number" label="Nouvelle variation colis" required /><Input name="correctedWeightDelta" type="number" step="0.001" label="Nouvelle variation poids" required /></>}
    {action === "RESOLVE_ANOMALY" && <Input name="anomalyId" label="Anomaly ID" required />}
    {action !== "RESOLVE_ANOMALY" && <Input name="businessDate" type="date" label="Date métier" required />}{action !== "OPENING" && <Input name="reason" label="Motif obligatoire" required />}
    <Button className="w-full bg-lime-400 text-slate-950 hover:bg-lime-300">{title}</Button>{result && <p className="text-sm text-slate-300">{result}</p>}
  </form></Panel>;
}

async function request<T>(url: string, body?: unknown): Promise<T> { const { data: { session } } = await getSupabaseBrowserClient().auth.getSession(); if (!session?.access_token) throw new Error("Session expirée."); const response = await fetch(url, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }); const payload = await response.json().catch(() => null) as Record<string, unknown> | null; if (!response.ok) throw new Error(typeof payload?.message === "string" ? payload.message : "Service Stockages indisponible."); return payload as T; }
function Shell({ back, title, children }: { back: string; title: string; children: React.ReactNode }) { return <main className="min-h-screen bg-slate-950 py-8 text-white"><div className="mx-auto max-w-7xl space-y-6 px-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><Link href={back} className="text-sm text-lime-300">← Retour au tableau de bord</Link><h1 className="mt-2 text-3xl font-bold">{title}</h1></div><Button variant="outline" onClick={() => void getSupabaseBrowserClient().auth.signOut()}><LogOut className="mr-2 h-4 w-4" />Déconnexion</Button></div>{children}</div></main>; }
function AccountCards({ accounts }: { accounts: Account[] }) { return <div className="grid gap-4 md:grid-cols-3">{accounts.map((a) => <div key={a.agency} className="rounded-2xl border border-lime-400/25 bg-slate-900 p-5"><div className="flex justify-between"><h2 className="text-xl font-semibold">{a.agency}</h2><span className={a.status === "ACTIVE" ? "text-lime-300" : "text-amber-300"}>{a.status}</span></div><p className="mt-4 text-3xl font-bold">{a.current_parcel_count} colis</p><p className="text-slate-300">{Number(a.current_weight_kg).toFixed(3)} kg</p></div>)}</div>; }
function EventTable({ title, rows }: { title: string; rows: EventRow[] }) { return <Panel title={title}><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-slate-400"><th>Agence</th><th>Date</th><th>Type</th><th>Colis</th><th>Kg</th><th>Agent</th></tr></thead><tbody>{rows.map((row) => <tr key={row.event_id} className="border-t border-white/10"><td>{row.agency ?? "—"}</td><td>{row.business_date}</td><td>{row.event_type}</td><td>{row.parcel_count_delta}</td><td>{row.weight_kg_delta}</td><td>{row.actor_name}</td></tr>)}</tbody></table>{!rows.length && <p className="py-5 text-slate-400">Aucun mouvement.</p>}</div></Panel>; }
function ActivityTable({ rows }: { rows: Activity[] }) { return <Panel title="Activité par Agent"><div className="grid gap-3 md:grid-cols-2">{rows.map((row, index) => <div key={`${row.actor_name}-${row.business_date}-${index}`} className="rounded-xl border border-white/10 p-3"><b>{row.actor_name}</b><p className="text-sm text-slate-300">{row.arrivals} arrivage(s) · {row.deliveries} livraison(s)</p></div>)}{!rows.length && <p className="text-slate-400">Aucune activité.</p>}</div></Panel>; }
function JsonList({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) { return <Panel title={title}>{rows.length ? <div className="space-y-2">{rows.map((row, i) => <pre key={i} className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs">{JSON.stringify(row, null, 2)}</pre>)}</div> : <p className="text-slate-400">Aucune donnée.</p>}</Panel>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"><h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Boxes className="h-5 w-5 text-lime-300" />{title}</h2>{children}</section>; }
function Notice({ text }: { text: string }) { return <div className="flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm"><ShieldCheck className="h-5 w-5" />{text}</div>; }
function Input(props: { name: string; label: string; type?: string; min?: string; step?: string; required?: boolean }) { return <label className="block text-sm">{props.label}<input {...props} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label>; }
