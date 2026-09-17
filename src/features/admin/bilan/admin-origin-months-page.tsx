"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Container, GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { getAdminProfile } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { monthPeriod, type OriginMonth } from "./cohort-catalog";
import { loadOriginMonths } from "./origin-month-client";

const field = "mt-1 w-full rounded border border-white/15 bg-ebe-night p-2 text-white";
export function AdminOriginMonthsPage() {
  const [months, setMonths] = useState<readonly OriginMonth[]>([]);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [form, setForm] = useState({ prefix: "", year: "", month: "", label: "" });
  const [labels, setLabels] = useState<Record<string, string>>({});
  const flight = useRef(false);
  async function sessionToken() {
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
    if (!session?.user || !session.access_token) throw new Error("Session Admin requise.");
    await getAdminProfile(session.user);
    return session.access_token;
  }
  async function refresh(token: string) {
    const rows = await loadOriginMonths(token); setMonths(rows);
    setLabels(Object.fromEntries(rows.map(row => [row.registryId, row.label])));
  }
  useEffect(() => { let active = true; void (async () => {
    try { const token = await sessionToken(); const rows = await loadOriginMonths(token);
      if (active) { setMonths(rows); setLabels(Object.fromEntries(rows.map(row => [row.registryId, row.label]))); setReady(true); }
    } catch (cause) { if (active) setMessage(cause instanceof Error ? cause.message : "Registre indisponible."); }
  })(); return () => { active = false; }; }, []);
  async function save(method: "POST" | "PATCH", body: object) {
    if (flight.current || !ready) return;
    if (!window.confirm("Confirmer cette modification du registre ? L’identité des mois existants et les données métier resteront inchangées.")) return;
    flight.current = true; setBusy(true); setMessage("");
    try {
      const token = await sessionToken();
      // No automatic write retry: after an uncertain response, read the registry.
      const response = await fetch("/api/admin/bilan/origin-months", { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.code === "ORIGIN_MONTH_CONFLICT" ? "Préfixe déjà utilisé, chevauchant ou année/mois déjà enregistré." : "Modification refusée ou non confirmée. Rechargez le registre avant de réessayer.");
      await refresh(token); setMessage("Registre enregistré. Aucun paiement ni calcul financier modifié.");
      if (method === "POST") setForm({ prefix: "", year: "", month: "", label: "" });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Résultat non confirmé. Rechargez avant de réessayer."); }
    finally { flight.current = false; setBusy(false); }
  }
  return <main className="min-h-screen bg-ebe-night py-8 text-white"><Container>
    <Link href="/admin/bilan" className="text-accent">← Retour au Bilan</Link>
    <h1 className="mt-4 text-3xl font-semibold">Mois d’origine</h1>
    <p className="mt-3 text-muted-foreground">Préfixe, année et mois sont immuables. Les mois inactifs restent disponibles pour l’analyse historique. Aucun préfixe n’est généré automatiquement.</p>
    {message ? <p role="status" className="mt-4 text-amber-100">{message}</p> : null}
    {ready ? <>
      <GlassPanel className="mt-6 p-5"><h2 className="text-xl">Ajouter un mois</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-4" onSubmit={event => { event.preventDefault(); void save("POST", { ...form, year: Number(form.year), month: Number(form.month) }); }}>
          <label>Préfixe<input required pattern="[A-Za-z]{2,8}" minLength={2} maxLength={8} className={field} value={form.prefix} onChange={e=>setForm({...form,prefix:e.target.value.toUpperCase()})}/></label>
          <label>Année<input required type="number" min={2000} max={2199} className={field} value={form.year} onChange={e=>setForm({...form,year:e.target.value})}/></label>
          <label>Mois<input required type="number" min={1} max={12} className={field} value={form.month} onChange={e=>setForm({...form,month:e.target.value})}/></label>
          <label>Libellé<input required maxLength={80} className={field} value={form.label} onChange={e=>setForm({...form,label:e.target.value})}/></label>
          <Button type="submit" disabled={busy}>Ajouter</Button>
        </form>
      </GlassPanel>
      <div className="mt-6 space-y-3">{months.map(row=><GlassPanel key={row.registryId} className="p-4">
        <div className="flex flex-wrap items-center gap-4"><strong>{row.prefix} — {row.id}</strong><span>{row.active ? "Actif" : "Inactif / historique"}</span><span className="text-sm">{monthPeriod(row.year,row.month).from} → {monthPeriod(row.year,row.month).to}</span></div>
        <div className="mt-3 flex flex-wrap items-end gap-3"><label className="grow">Libellé<input maxLength={80} className={field} value={labels[row.registryId]??row.label} onChange={e=>setLabels({...labels,[row.registryId]:e.target.value})}/></label>
          <Button disabled={busy||!labels[row.registryId]?.trim()} onClick={()=>void save("PATCH",{id:row.registryId,label:labels[row.registryId],active:row.active})}>Enregistrer le libellé</Button>
          <Button variant="outline" disabled={busy} onClick={()=>void save("PATCH",{id:row.registryId,label:row.label,active:!row.active})}>{row.active ? "Désactiver" : "Activer"}</Button>
        </div>
      </GlassPanel>)}</div>
    </> : null}
  </Container></main>;
}
