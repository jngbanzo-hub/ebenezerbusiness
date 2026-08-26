"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, LoaderCircle } from "lucide-react";
import { GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { AdminActivity, AdminActivityCategory, AdminRecentActivityResult } from "@/server/admin-recent-activity";
import { sortAdminNotificationsNewestFirst } from "@/features/admin/admin-notification-order";

const categories: Array<"TOUTES" | AdminActivityCategory> = ["TOUTES", "ENCAISSEMENTS", "DÉPENSES", "QR", "STOCKAGE", "CAISSE", "AGENTS"];
const agencies = ["TOUTES", "COO", "FIH", "LSHI", "KLZ"] as const;
const readFilters = ["TOUTES", "NON LUES", "LUES"] as const;

export function AdminRecentActivityPanel({ onCount }: { onCount?: (count: number) => void }) {
  const [result, setResult] = useState<AdminRecentActivityResult | null>(null);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof categories)[number]>("TOUTES");
  const [agency, setAgency] = useState<(typeof agencies)[number]>("TOUTES");
  const [readFilter, setReadFilter] = useState<(typeof readFilters)[number]>("TOUTES");

  const load = useCallback(async () => {
    const response = await authenticatedRead(getSupabaseBrowserClient().auth, "/api/admin/recent-activity");
    const value = await readJsonOrThrow<AdminRecentActivityResult>(response, "Activité récente indisponible.");
    setResult(value);
    onCount?.(value.unreadCount);
    setError("");
  }, [onCount]);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Activité récente indisponible."));
  }, [load]);

  const items = useMemo(() => sortAdminNotificationsNewestFirst(
    (result?.activities ?? []).filter((item) =>
      (category === "TOUTES" || item.category === category) &&
      (agency === "TOUTES" || item.agency === agency || item.agency === "TOUTES") &&
      (readFilter === "TOUTES" || (readFilter === "LUES" ? item.read : !item.read))
    )
  ), [result, category, agency, readFilter]);

  async function mark(activityId?: string) {
    setMarking(activityId ?? "ALL");
    try {
      const response = await authenticatedRead(getSupabaseBrowserClient().auth, "/api/admin/recent-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: activityId ? "MARK_READ" : "MARK_ALL_READ", activityId })
      });
      await readJsonOrThrow(response, "Marquage de l’activité indisponible.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Marquage de l’activité indisponible.");
    } finally {
      setMarking(null);
    }
  }

  return <>
    {error ? <GlassPanel className="mt-7 p-6 text-red-200" role="alert">{error}</GlassPanel> : null}
    {!result && !error ? <LoaderCircle className="mx-auto mt-12 h-7 w-7 animate-spin text-accent" /> : null}
    {result ? <>
      <GlassPanel className="mt-7 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-6">
            <Counter label="Activités des dernières 24 heures" value={result.activeCount} />
            <Counter label="Non lues" value={result.unreadCount} accent />
            <Counter label="Lues" value={result.readCount} />
          </div>
          <Button variant="outline" disabled={result.unreadCount === 0 || marking !== null} onClick={() => void mark()}>
            {marking === "ALL" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Tout marquer comme lu
          </Button>
        </div>
        <p className="mt-3 max-w-xl text-xs text-muted-foreground">Les connexions Agents ne sont pas affichées : aucun journal fiable de connexion/déconnexion n’est actuellement disponible.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Filter label="Lecture" value={readFilter} values={readFilters} set={setReadFilter} />
          <Filter label="Catégorie" value={category} values={categories} set={setCategory} />
          <Filter label="Agence" value={agency} values={agencies} set={setAgency} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{Object.entries(result.sources).map(([name, state]) => <span key={name} className="rounded-full border border-white/15 px-3 py-1 text-xs">{name} — {state === "AVAILABLE" ? "DISPONIBLE" : state === "NOT_RECORDED" ? "NON JOURNALISÉ" : "INDISPONIBLE TEMPORAIREMENT"}</span>)}</div>
      </GlassPanel>
      <section className="mt-6 space-y-4">{items.length ? items.map((item) => <ActivityCard key={item.id} item={item} marking={marking} onMark={mark} />) : <GlassPanel className="p-8 text-center text-muted-foreground">Aucune activité pour ces filtres sur les dernières 24 heures.</GlassPanel>}</section>
    </> : null}
  </>;
}

function Counter({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div><p className="text-sm text-muted-foreground">{label}</p><p className={`text-3xl font-bold ${accent ? "text-accent" : "text-white"}`}>{value}</p></div>;
}

function Filter<T extends string>({ label, value, values, set }: { label: string; value: T; values: readonly T[]; set: (value: T) => void }) {
  return <label className="text-sm">{label}<select className="mt-1 h-11 w-full rounded-md border border-white/15 bg-ebe-night px-3" value={value} onChange={(event) => set(event.target.value as T)}>{values.map((item) => <option key={item}>{item}</option>)}</select></label>;
}

function ActivityCard({ item, marking, onMark }: { item: AdminActivity; marking: string | null; onMark: (activityId?: string) => Promise<void> }) {
  return <GlassPanel className={`p-5 ${item.read ? "border-white/10 opacity-70" : "border-accent/35"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-accent">{item.category} · {item.agency}</p><h2 className="mt-1 text-lg font-semibold">{item.title}</h2></div><div className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1 text-xs ${item.read ? "border-white/15 text-muted-foreground" : "border-accent/40 text-accent"}`}>{item.read ? "LUE" : "NON LUE"}</span><time className="text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString("fr-FR")}</time></div></div>{item.trackingCode ? <p className="mt-3 font-mono text-sm">Code colis : {item.trackingCode}</p> : null}{item.amount ? <p className="mt-2 font-semibold">{item.amount}</p> : null}<p className="mt-2 text-sm">{item.description}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Agent/acteur : {item.actor || "Non disponible"}{item.status ? ` · Statut : ${item.status}` : ""} · Source : {item.source}</p>{item.read ? <p className="text-xs text-muted-foreground">Lue {item.readAt ? new Date(item.readAt).toLocaleString("fr-FR") : ""}</p> : <Button size="sm" variant="outline" disabled={marking !== null} onClick={() => void onMark(item.id)}>{marking === item.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Marquer comme lue</Button>}</div></GlassPanel>;
}
