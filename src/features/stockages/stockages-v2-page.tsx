"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, ClipboardCheck, LogOut, RefreshCcw, ShieldCheck, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { formatStockageAnomalies, formatStockageWeight } from "@/features/stockages/presentation";

type Account = { agency: string; status: "SUSPENDED" | "ACTIVE"; current_parcel_count: number; current_weight_kg: number; version: number; opened_business_date: string | null };
type EventRow = { event_id: string; event_type: string; agency?: string; business_date: string; occurred_at: string; parcel_count_delta: number; weight_kg_delta: number; tracking_code?: string | null; arrival_reference?: string | null; actor_name: string };
type Activity = { agency: string; business_date: string; actor_name: string; arrivals: number; deliveries: number; arrived_weight_kg: number; delivered_weight_kg: number };
type AgentData = { mode: "V2"; account: Account; events: EventRow[]; activity: Activity[]; actionsEnabled: boolean };
type AdminData = { mode: "V2"; accounts: Account[]; events: EventRow[]; activity: Activity[]; anomalies: Array<Record<string, unknown>>; audit: Array<Record<string, unknown>> };
type QueueSectionCode = "TO_COLLECT" | "PARTIAL" | "READY" | "VERIFICATION" | "RECENT";
type QueueItem = { trackingCode: string; beneficiary: string; destination: string; weightKg: number | null; weightState: string; amountExpected: number | null; amountPaid: number | null; remainingBalance: number | null; paymentSites: string[]; paymentAgents: string[]; paymentLabel: string; deliveryStatus: "TO_COLLECT" | "PARTIAL_PAYMENT_REMAINING" | "READY" | "VERIFICATION_REQUIRED" | "DELIVERED"; financialState: "COMPLETE" | "INCOMPLETE" | "CONFLICT"; anomalies: string[]; deliveredAt: string | null; businessDate: string | null; deliveredBy: string | null; deliveryReference: string | null; canConfirmDelivery: boolean };
type QueueResponse = { agency: string; accountStatus: string; items: QueueItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; summary: { totalDeduplicated: number; toCollect: number; partialPaymentRemaining: number; readyForDelivery: number; verificationRequired: number; recentlyDelivered: number; weightToVerify: number; unknownAmounts: number; conflicts: number; activeCollectionButtons: number; activeDeliveryButtons: number }; audit?: { rawRows: number; normalizedRows: number; uniqueCodes: number; strictDuplicateCodes: number; divergentDuplicateCodes: number; excludedHistorical: number; excludedWrongAgency: number; invalidCodes: number } };

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
    <div className="grid gap-5">
      <AgentCommandForm title="Déclarer un arrivage" endpoint="/api/agent/stockages/arrival" disabled={!data.actionsEnabled} fields="arrival" onDone={load} />
    </div>
    <PhysicalStatistics events={data.events} />
    <EventTable title="Arrivages et livraisons récents" rows={data.events} />
    <ActivityTable rows={data.activity} />
    {message && <Notice text={message} />}
  </Shell>;
}

export function AgentEncaissementQueues() {
  const [accountActive, setAccountActive] = useState(false);
  const refresh = useCallback(async () => { const data = await request<AgentData>("/api/agent/stockages"); setAccountActive(data.actionsEnabled); }, []);
  useEffect(() => { void refresh().catch(() => setAccountActive(false)); }, [refresh]);
  return <AgentWorkQueues accountActive={accountActive} onDelivery={refresh} />;
}

function AgentWorkQueues({ accountActive, onDelivery }: { accountActive: boolean; onDelivery: () => Promise<void> }) {
  return <div className="space-y-5">
    <QueueSection title="COLIS À ENCAISSER" section="TO_COLLECT" accountActive={accountActive} onDelivery={onDelivery} />
    <QueueSection title="COLIS AVEC SOLDE RESTANT" section="PARTIAL" accountActive={accountActive} onDelivery={onDelivery} />
    <QueueSection title="COLIS PRÊTS À REMETTRE" section="READY" accountActive={accountActive} onDelivery={onDelivery} />
    <QueueSection title="VÉRIFICATION NÉCESSAIRE" section="VERIFICATION" accountActive={accountActive} onDelivery={onDelivery} />
    <QueueSection title="LIVRAISONS RÉCENTES" section="RECENT" accountActive={accountActive} onDelivery={onDelivery} />
    <Panel title="RECHERCHER UN AUTRE COLIS"><p className="mb-3 text-sm text-slate-400">Recherche complémentaire pour un colis précis ou un cas particulier.</p><Link className="inline-flex rounded-lg border border-lime-400/40 px-4 py-2 text-lime-300" href="#manual-delivery">Utiliser la recherche manuelle</Link></Panel>
  </div>;
}

function QueueSection({ title, section, accountActive, onDelivery }: { title: string; section: QueueSectionCode; accountActive: boolean; onDelivery: () => Promise<void> }) {
  const [response, setResponse] = useState<QueueResponse | null>(null); const [query, setQuery] = useState(""); const [paymentSite, setPaymentSite] = useState("ALL"); const [page, setPage] = useState(1); const [message, setMessage] = useState(""); const [pendingCode, setPendingCode] = useState("");
  const load = useCallback(async () => { try { setMessage(""); const params = new URLSearchParams({ section, query, paymentSite, page: String(page), pageSize: "12" }); setResponse(await request<QueueResponse>(`/api/agent/stockages/queues?${params}`)); } catch (error) { setMessage(error instanceof Error ? error.message : "Liste indisponible."); } }, [section, query, paymentSite, page]);
  useEffect(() => { void load(); }, [load]);
  async function deliver(code: string) { if (!accountActive || pendingCode || !window.confirm(`Confirmer la remise physique du colis ${code} ?`)) return; setPendingCode(code); try { const result = await request<{ replayed?: boolean }>("/api/agent/stockages/delivery", { trackingCode: code, physicalDeliveryConfirmed: true, requestId: crypto.randomUUID() }); setMessage(result.replayed ? "Livraison déjà confirmée." : "Livraison confirmée avec succès."); await Promise.all([load(), onDelivery()]); } catch (error) { setMessage(error instanceof Error ? error.message : "Livraison refusée."); } finally { setPendingCode(""); } }
  return <Panel title={title}><div className="mb-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">Code colis<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label><label className="text-sm">Site d’encaissement<select value={paymentSite} onChange={(event) => { setPaymentSite(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2"><option value="ALL">Tous</option><option>COO</option><option>FIH</option><option>LSHI</option><option>KLZ</option></select></label></div>
    {message && <p className="mb-3 rounded-lg bg-amber-400/10 p-3 text-sm">{message}</p>}
    {!response ? <p className="text-slate-400">Chargement…</p> : response.items.length === 0 ? <p className="text-slate-400">Aucun résultat.</p> : <div className="grid gap-3 lg:grid-cols-2">{response.items.map((item) => <article key={item.trackingCode} className="rounded-xl border border-white/10 bg-slate-950/60 p-4"><div className="flex justify-between gap-3"><b>{item.trackingCode}</b><span className={`text-xs ${item.deliveryStatus === "VERIFICATION_REQUIRED" ? "text-amber-300" : "text-lime-300"}`}>{queueStatusLabel(item.deliveryStatus)}</span></div><p className="mt-2 text-sm">Bénéficiaire : {item.beneficiary}</p><p className="text-sm">Destination : {item.destination} · Poids : {item.weightKg === null ? "Poids à vérifier" : formatStockageWeight(item.weightKg)}</p><p className="text-sm">Attendu : {money(item.amountExpected)} · Payé : {money(item.amountPaid)} · Solde : {money(item.remainingBalance)}</p>{item.paymentSites.length > 0 && <p className="text-xs text-slate-400">Site(s) d’encaissement : {item.paymentSites.join(", ")}</p>}<p className="mt-2 text-xs text-slate-400">{item.paymentLabel}</p>{item.anomalies.length > 0 && <p className="mt-2 text-xs text-amber-300">Anomalie : {formatStockageAnomalies(item.anomalies).join(", ")}</p>}{section === "READY" && <Button disabled={!item.canConfirmDelivery || pendingCode === item.trackingCode} onClick={() => void deliver(item.trackingCode)} className="mt-3 w-full bg-lime-400 text-slate-950 hover:bg-lime-300 focus-visible:ring-lime-300 disabled:bg-slate-800 disabled:text-slate-400">{pendingCode === item.trackingCode ? "Confirmation…" : item.weightState !== "VALID" ? "Poids à vérifier" : accountActive ? "Confirmer la livraison" : "Solde initial requis"}</Button>}{section === "TO_COLLECT" && <CollectionLink item={item} label="Encaisser" />}{section === "PARTIAL" && <CollectionLink item={item} label="Encaisser le solde" />}{section === "VERIFICATION" && <CollectionLink item={item} label="Vérifier dans Encaissements" />}{section === "RECENT" && <p className="mt-3 text-xs text-slate-300">{item.businessDate ?? "—"} · {item.deliveredAt ? new Date(item.deliveredAt).toLocaleString("fr-FR") : "—"} · {item.destination} · {item.deliveredBy ?? "—"} · Référence : {item.deliveryReference ?? "—"}</p>}</article>)}</div>}
    {response && <div className="mt-4 flex items-center justify-between text-sm"><Button variant="outline" disabled={response.pagination.page <= 1} onClick={() => setPage((value) => value - 1)}>Précédente</Button><span>Page {response.pagination.page}/{response.pagination.totalPages} · {response.pagination.total} résultat(s)</span><Button variant="outline" disabled={response.pagination.page >= response.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Suivante</Button></div>}
  </Panel>;
}

function AdminWorkQueue({ accounts }: { accounts: Account[] }) { const [agency, setAgency] = useState(accounts[0]?.agency ?? "FIH"); const [section, setSection] = useState<QueueSectionCode>("TO_COLLECT"); const [response, setResponse] = useState<QueueResponse | null>(null); const [message, setMessage] = useState(""); useEffect(() => { let active = true; const params = new URLSearchParams({ agency, section, page: "1", pageSize: "12" }); request<QueueResponse>(`/api/admin/stockages/v2/queues?${params}`).then((data) => { if (active) { setResponse(data); setMessage(""); } }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Vue indisponible."); }); return () => { active = false; }; }, [agency, section]); return <Panel title="Vue consultative des colis"><div className="mb-4 flex flex-wrap gap-3"><select value={agency} onChange={(event) => setAgency(event.target.value)} className="rounded-lg border border-white/15 bg-slate-950 p-2">{accounts.map((account) => <option key={account.agency}>{account.agency}</option>)}</select><select value={section} onChange={(event) => setSection(event.target.value as QueueSectionCode)} className="rounded-lg border border-white/15 bg-slate-950 p-2"><option value="TO_COLLECT">Colis à encaisser</option><option value="PARTIAL">Colis avec solde restant</option><option value="READY">Prêts à remettre</option><option value="VERIFICATION">Vérification nécessaire</option><option value="RECENT">Livraisons récentes</option></select></div>{response && <p className="mb-4 text-sm text-slate-300">Total {response.summary.totalDeduplicated} · À encaisser {response.summary.toCollect} · Partiels {response.summary.partialPaymentRemaining} · Prêts {response.summary.readyForDelivery} · Vérifications {response.summary.verificationRequired} · Livrés {response.summary.recentlyDelivered}</p>}{response?.audit && <p className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">Audit source : {response.audit.rawRows} ligne(s), {response.audit.uniqueCodes} code(s) unique(s), {response.audit.excludedHistorical} historique(s) clos exclu(s), {response.audit.excludedWrongAgency} autre(s) agence(s) exclue(s), {response.audit.strictDuplicateCodes} doublon(s) strict(s), {response.audit.divergentDuplicateCodes} doublon(s) divergent(s), {response.audit.invalidCodes} code(s) invalide(s).</p>}{message ? <p>{message}</p> : <DataList rows={(response?.items ?? []).map((item) => `${item.trackingCode} · ${item.paymentLabel} · ${item.deliveryStatus}`)} empty="Aucun colis." />}</Panel>; }

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
    <PhysicalStatistics events={data.events} />
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
    const payload = fields === "arrival" ? { parcels: parseArrivalLines(String(values.get("parcels") ?? "")), reference: values.get("reference"), observation: values.get("observation"), requestId: crypto.randomUUID() } : { trackingCode: values.get("trackingCode"), physicalDeliveryConfirmed: true, requestId: crypto.randomUUID() };
    try { const response = await request<{ replayed?: boolean }>(endpoint, payload); setResult(response.replayed ? "Commande déjà enregistrée : rejeu idempotent." : "Commande enregistrée avec succès."); form.reset(); await onDone(); } catch (error) { setResult(error instanceof Error ? error.message : "Commande refusée."); }
  }
  return <Panel title={title}><form className="space-y-3" onSubmit={submit}>
    {fields === "arrival" ? <><label className="block text-sm">Colis arrivés — un par ligne au format CODE:POIDS<textarea name="parcels" required rows={6} placeholder={"JL00126:2.5\nJL00226:1"} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label><Input name="reference" label="Référence d’arrivage" /><Input name="observation" label="Observation" /></> : <><Input name="trackingCode" label="Code colis" required /><p className="text-xs text-slate-400">La présence physique et le poids sont contrôlés côté serveur dans le Stockage de l’agence.</p></>}
    <Button disabled={disabled} className="w-full bg-lime-400 text-slate-950 hover:bg-lime-300 focus-visible:ring-lime-300 disabled:bg-slate-800 disabled:text-slate-400">{disabled ? "Solde initial requis" : title}</Button>{result && <p className="text-sm text-slate-300">{result}</p>}
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
function AccountCards({ accounts }: { accounts: Account[] }) { return <div className="grid gap-4 md:grid-cols-3">{accounts.map((a) => <div key={a.agency} className="rounded-2xl border border-lime-400/25 bg-slate-900 p-5"><div className="flex justify-between"><h2 className="text-xl font-semibold">{a.agency}</h2><span className={a.status === "ACTIVE" ? "text-lime-300" : "text-amber-300"}>{a.status}</span></div><p className="mt-4 text-3xl font-bold">{a.current_parcel_count} colis</p><p className="text-slate-300">{formatStockageWeight(Number(a.current_weight_kg))}</p></div>)}</div>; }
function EventTable({ title, rows }: { title: string; rows: EventRow[] }) { return <Panel title={title}><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-slate-400"><th>Agence</th><th>Date</th><th>Type</th><th>Colis</th><th>Kg</th><th>Agent</th></tr></thead><tbody>{rows.map((row) => <tr key={row.event_id} className="border-t border-white/10"><td>{row.agency ?? "—"}</td><td>{row.business_date}</td><td>{row.event_type}</td><td>{row.parcel_count_delta}</td><td>{formatStockageWeight(row.weight_kg_delta)}</td><td>{row.actor_name}</td></tr>)}</tbody></table>{!rows.length && <p className="py-5 text-slate-400">Aucun mouvement.</p>}</div></Panel>; }
function ActivityTable({ rows }: { rows: Activity[] }) { return <Panel title="Activité par Agent"><div className="grid gap-3 md:grid-cols-2">{rows.map((row, index) => <div key={`${row.actor_name}-${row.business_date}-${index}`} className="rounded-xl border border-white/10 p-3"><b>{row.actor_name}</b><p className="text-sm text-slate-300">{row.arrivals} arrivage(s) · {row.deliveries} livraison(s)</p></div>)}{!rows.length && <p className="text-slate-400">Aucune activité.</p>}</div></Panel>; }
function PhysicalStatistics({ events }: { events: EventRow[] }) {
  const [period, setPeriod] = useState("MONTH");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    if (period === "DAY") start.setDate(today.getDate());
    else if (period === "WEEK") start.setDate(today.getDate() - 6);
    else if (period === "MONTH") start.setMonth(today.getMonth(), 1);
    else if (period === "YEAR") start.setMonth(0, 1);
    const inferredFrom = period === "CUSTOM" ? from : start.toISOString().slice(0, 10);
    const inferredTo = period === "CUSTOM" ? to : today.toISOString().slice(0, 10);
    return events.filter((event) => (!inferredFrom || event.business_date >= inferredFrom) && (!inferredTo || event.business_date <= inferredTo));
  }, [events, from, period, to]);
  const arrivals = filtered.filter((event) => event.parcel_count_delta > 0);
  const deliveries = filtered.filter((event) => event.parcel_count_delta < 0);
  const sum = (rows: EventRow[], field: "parcel_count_delta" | "weight_kg_delta") => rows.reduce((total, row) => total + Math.abs(Number(row[field])), 0);
  return <Panel title="Statistiques physiques"><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Période<select value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2"><option value="DAY">Journalière</option><option value="WEEK">Hebdomadaire</option><option value="MONTH">Mensuelle</option><option value="YEAR">Annuelle</option><option value="CUSTOM">Personnalisée</option></select></label>{period === "CUSTOM" && <><label className="text-sm">Du<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label><label className="text-sm">Au<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label></>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Colis entrés" value={sum(arrivals, "parcel_count_delta")} /><Metric label="Kg entrés" value={formatStockageWeight(sum(arrivals, "weight_kg_delta"))} /><Metric label="Colis sortis" value={sum(deliveries, "parcel_count_delta")} /><Metric label="Kg sortis" value={formatStockageWeight(sum(deliveries, "weight_kg_delta"))} /></div></Panel>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-lime-400/20 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-lime-300">{value}</p></div>; }
function JsonList({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) { return <Panel title={title}>{rows.length ? <div className="space-y-2">{rows.map((row, i) => <pre key={i} className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs">{JSON.stringify(row, null, 2)}</pre>)}</div> : <p className="text-slate-400">Aucune donnée.</p>}</Panel>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"><h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Boxes className="h-5 w-5 text-lime-300" />{title}</h2>{children}</section>; }
function Notice({ text }: { text: string }) { return <div className="flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm"><ShieldCheck className="h-5 w-5" />{text}</div>; }
function Input(props: { name: string; label: string; type?: string; min?: string; step?: string; required?: boolean }) { return <label className="block text-sm">{props.label}<input {...props} className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 p-2" /></label>; }
function CollectionLink({ item, label }: { item: QueueItem; label: string }) { return <Link href={`/agent/encaissement?code=${encodeURIComponent(item.trackingCode)}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-lime-400 px-4 py-2 font-medium text-slate-950 hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300">{label}</Link>; }
function parseArrivalLines(value: string) { return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [trackingCode, weight] = line.split(":"); return { trackingCode: trackingCode?.trim(), weightKg: Number(weight?.trim().replace(",", ".")) }; }); }
function queueStatusLabel(status: QueueItem["deliveryStatus"]) { return status === "DELIVERED" ? "Livré" : status === "READY" ? "Paiement terminé — colis à remettre" : status === "TO_COLLECT" ? "À encaisser" : status === "PARTIAL_PAYMENT_REMAINING" ? "Solde restant" : "Vérification nécessaire"; }
function money(value: number | null) { return value === null ? "Non disponible" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} $`; }
function DataList({ rows, empty }: { rows: string[]; empty: string }) { return rows.length ? <div className="space-y-2">{rows.map((row, index) => <p key={`${row}-${index}`} className="rounded-lg border border-white/10 p-3 text-sm">{row}</p>)}</div> : <p className="text-slate-400">{empty}</p>; }
