"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, LoaderCircle, LogOut, RefreshCw, Send } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SHIPMENT_STATUSES, type ShipmentStatus, type ShipmentTrackingRow } from "@/features/admin/shipment-tracking";
import { getAdminProfile, signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { readJsonOrThrow } from "@/features/auth/authenticated-fetch";

const field = "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none focus:border-accent";

export function ShipmentTrackingPage() {
  const router = useRouter(); const token = useRef("");
  const [ready, setReady] = useState(false); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()); const [bulkStatus, setBulkStatus] = useState<ShipmentStatus>("En Vol"); const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [rows, setRows] = useState<ShipmentTrackingRow[]>([]);
  const [filters, setFilters] = useState({ from: "", to: "", company: "ALL", destination: "ALL", status: "ALL", search: "" });

  const load = useCallback(async () => {
    if (!token.current) return; setLoading(true); setError("");
    try {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== "ALL"));
      const response = await fetch(`/api/admin/shipment-tracking?${query}`, { headers: { Authorization: `Bearer ${token.current}` }, cache: "no-store" });
      const body = await readJsonOrThrow<{ rows?: ShipmentTrackingRow[] }>(response, "Lecture impossible.");
      setRows(body.rows ?? []);
      setSelected(new Set());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lecture impossible."); } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { let active = true; void (async () => { try { const supabase = getSupabaseBrowserClient(); const { data: { session } } = await supabase.auth.getSession(); if (!session?.user || !session.access_token) return router.replace("/auth/sign-in"); await getAdminProfile(session.user); if (active) { token.current = session.access_token; setReady(true); } } catch { if (active) setError("Accès Admin refusé."); } })(); return () => { active = false; token.current = ""; }; }, [router]);
  useEffect(() => { if (ready) void load(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  async function update(row: ShipmentTrackingRow, status: ShipmentStatus) {
    if (bulkSaving) return;
    setSaving(row.rowNumber); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/shipment-tracking", { method: "PATCH", headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" }, body: JSON.stringify({ rowNumber: row.rowNumber, identity: row.identity, status }) });
      const body = await readJsonOrThrow<{ row?: ShipmentTrackingRow }>(response, "Mise à jour impossible.");
      if (!body.row || body.row.status !== status) throw new Error("La source n’a pas confirmé le nouveau statut.");
      setRows((current) => current.map((item) => item.id === row.id ? body.row! : item));
      setSuccess(`Statut réel confirmé dans EXPÉDITION!K${row.rowNumber} : ${body.row.status}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mise à jour impossible."); } finally { setSaving(null); }
  }

  async function updateSelected() {
    const targets = rows.filter((row) => selected.has(row.id));
    if (!targets.length || bulkSaving || saving !== null) return;
    if (!window.confirm(`Vous allez modifier ${targets.length} groupage${targets.length === 1 ? "" : "s"} vers « ${bulkStatus} ». Confirmer ?`)) return;
    setBulkSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/shipment-tracking", { method: "PATCH", headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" }, body: JSON.stringify({ items: targets.map(({ rowNumber, identity }) => ({ rowNumber, identity })), status: bulkStatus }) });
      const body = await readJsonOrThrow<{ results?: Array<{ ok: boolean; rowNumber: number; row?: ShipmentTrackingRow; message?: string }>; succeeded?: number; failed?: number }>(response, "Mise à jour en lot impossible.");
      const successfulRows = new Map((body.results ?? []).filter((result) => result.ok && result.row).map((result) => [result.rowNumber, result.row!]));
      setRows((current) => current.map((row) => successfulRows.get(row.rowNumber) ?? row));
      setSelected(new Set(targets.filter((row) => !successfulRows.has(row.rowNumber)).map((row) => row.id)));
      const failures = (body.results ?? []).filter((result) => !result.ok);
      setSuccess(`${body.succeeded ?? 0} réussi${body.succeeded === 1 ? "" : "s"} ; ${body.failed ?? failures.length} échoué${body.failed === 1 ? "" : "s"}.`);
      if (failures.length) setError(failures.map((result) => `Ligne ${result.rowNumber} : ${result.message ?? "échec"}`).join(" · "));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mise à jour en lot impossible."); } finally { setBulkSaving(false); }
  }

  const options = (key: "company" | "destination") => Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort();
  return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-accent"><ArrowLeft className="h-4 w-4"/>Retour au tableau de bord Admin</Link><Badge variant="growth" className="mt-4 block w-fit">Administration</Badge><h1 className="mt-3 text-3xl font-semibold">Suivi des expéditions</h1><p className="mt-2 text-sm text-muted-foreground">Consultez et mettez à jour le statut des groupages depuis le Manifeste de l’expédition COO.</p></div><Button variant="outline" onClick={() => void signOutAgent().then(() => router.replace("/auth/sign-in"))}><LogOut className="mr-2 h-4 w-4"/>Se déconnecter</Button></header>
    <GlassPanel className="mt-8 p-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Input label="Date de début" type="date" value={filters.from} onChange={(from)=>setFilters({...filters,from})}/><Input label="Date de fin" type="date" value={filters.to} onChange={(to)=>setFilters({...filters,to})}/><Select label="Compagnie" value={filters.company} options={["ALL",...options("company")]} onChange={(company)=>setFilters({...filters,company})}/><Select label="Destination" value={filters.destination} options={["ALL",...options("destination")]} onChange={(destination)=>setFilters({...filters,destination})}/><Select label="Statut" value={filters.status} options={["ALL",...SHIPMENT_STATUSES]} onChange={(status)=>setFilters({...filters,status})}/><Input label="Recherche groupage" value={filters.search} onChange={(search)=>setFilters({...filters,search})}/></div><Button className="mt-4" variant="growth" disabled={!ready||loading} onClick={()=>void load()}>{loading?<LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>:<RefreshCw className="mr-2 h-4 w-4"/>}Rafraîchir</Button></GlassPanel>
    {error?<p role="alert" className="mt-4 flex items-center gap-2 text-sm text-red-200"><CircleAlert className="h-4 w-4"/>{error}</p>:null}{success?<p role="status" className="mt-4 text-sm text-accent">{success}</p>:null}
    <GlassPanel className="mt-6 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end"><label className="text-xs text-muted-foreground">Nouveau statut<select className={field} value={bulkStatus} disabled={bulkSaving} onChange={(event)=>setBulkStatus(event.target.value as ShipmentStatus)}>{SHIPMENT_STATUSES.map(status=><option key={status} value={status}>{status}</option>)}</select></label><Button variant="growth" disabled={!selected.size||bulkSaving||saving!==null} onClick={()=>void updateSelected()}>{bulkSaving?<><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Mise à jour…</>:`APPLIQUER AUX GROUPAGES SÉLECTIONNÉS (${selected.size})`}</Button></div></GlassPanel>
    <GlassPanel className="mt-6 overflow-x-auto"><table className="w-full min-w-[1400px] text-sm"><thead><tr className="border-b border-white/10 text-left text-muted-foreground"><th className="p-4"><label className="flex items-center gap-2"><input type="checkbox" aria-label="Tout sélectionner" checked={rows.length>0&&selected.size===rows.length} disabled={!rows.length||bulkSaving} onChange={(event)=>setSelected(event.target.checked?new Set(rows.map((row)=>row.id)):new Set())}/>Tout sélectionner</label></th><th>Date</th><th>Compagnie</th><th>Destination</th><th>Groupage</th><th>Poids total</th><th>Poids manifeste</th><th>Colis</th><th>Statut</th><th>Date d’arrivée</th><th>Action</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-b border-white/5"><td className="p-4"><input type="checkbox" aria-label={`Sélectionner le groupage ligne ${row.rowNumber}`} checked={selected.has(row.id)} disabled={bulkSaving||saving===row.rowNumber} onChange={(event)=>setSelected((current)=>{const next=new Set(current);if(event.target.checked)next.add(row.id);else next.delete(row.id);return next;})}/></td><td>{row.date||"—"}</td><td>{row.company||"—"}</td><td>{row.destination||"—"}</td><td className="max-w-64 whitespace-pre-wrap">{row.groupage||"—"}</td><td>{row.totalWeight||"—"}</td><td>{row.manifestWeight||"—"}</td><td>{row.parcelCount||"—"}</td><td><Badge variant="growth">{row.status||"Non renseigné"}</Badge></td><td>{row.arrivalDate||"—"}</td><td className="py-3 pr-4"><select aria-label={`Modifier le statut ligne ${row.rowNumber}`} className="h-10 rounded-md border border-white/15 bg-ebe-navy px-3" value={SHIPMENT_STATUSES.includes(row.status as ShipmentStatus)?row.status:""} disabled={saving===row.rowNumber||bulkSaving} onChange={(event)=>void update(row,event.target.value as ShipmentStatus)}><option value="" disabled>Modifier le statut</option>{SHIPMENT_STATUSES.map(status=><option key={status} value={status}>{status}</option>)}</select></td></tr>)}</tbody></table>{!loading&&!rows.length?<div className="p-12 text-center text-muted-foreground"><Send className="mx-auto h-8 w-8"/><p className="mt-3">Aucun groupage trouvé.</p></div>:null}</GlassPanel>
  </Container></main>;
}
function Input({label,value,onChange,type="search"}:{label:string;value:string;onChange:(value:string)=>void;type?:string}) { return <label className="text-xs text-muted-foreground">{label}<input className={field} type={type} value={value} onChange={(event)=>onChange(event.target.value)}/></label>; }
function Select({label,value,options,onChange}:{label:string;value:string;options:readonly string[];onChange:(value:string)=>void}) { return <label className="text-xs text-muted-foreground">{label}<select className={field} value={value} onChange={(event)=>onChange(event.target.value)}>{options.map(option=><option key={option} value={option}>{option==="ALL"?"Tous":option}</option>)}</select></label>; }
