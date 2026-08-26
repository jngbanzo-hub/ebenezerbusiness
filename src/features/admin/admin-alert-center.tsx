"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, LoaderCircle } from "lucide-react";
import { GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { AdminAlertCategory, AdminAlertLevel } from "@/server/admin-alert-rules";
import type { AdminAlertWithReadState } from "@/server/admin-alert-center";
import { sortAdminNotificationsNewestFirst } from "@/features/admin/admin-notification-order";

type Result = {
  generatedAt: string;
  count: number;
  activeCount: number;
  unreadCount: number;
  readCount: number;
  alerts: AdminAlertWithReadState[];
  thresholds: { storageStaleDays: number; cooPartialPaymentDays: number };
};

const levels: Array<"TOUTES" | AdminAlertLevel> = ["TOUTES", "INFO", "ATTENTION", "IMPORTANT"];
const agencies = ["TOUTES", "COO", "FIH", "LSHI", "KLZ"] as const;
const categories: Array<"TOUTES" | AdminAlertCategory> = ["TOUTES", "QR", "STOCKAGE", "ENCAISSEMENTS", "CAISSE", "DÉPENSES", "COHÉRENCE COLIS"];
const readFilters = ["TOUTES", "NON LUES", "LUES"] as const;

export function AdminAlertsPanel({ onCount }: { onCount?: (count: number) => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState<string | null>(null);
  const [level, setLevel] = useState<(typeof levels)[number]>("TOUTES");
  const [agency, setAgency] = useState<(typeof agencies)[number]>("TOUTES");
  const [category, setCategory] = useState<(typeof categories)[number]>("TOUTES");
  const [readFilter, setReadFilter] = useState<(typeof readFilters)[number]>("TOUTES");

  const load = useCallback(async () => {
    const response = await authenticatedRead(getSupabaseBrowserClient().auth, "/api/admin/alerts");
    const value = await readJsonOrThrow<Result>(response, "Centre d’alertes indisponible.");
    setResult(value);
    onCount?.(value.unreadCount);
    setError("");
  }, [onCount]);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Centre d’alertes indisponible."));
  }, [load]);

  const alerts = useMemo(
    () =>
      sortAdminNotificationsNewestFirst(
        (result?.alerts ?? []).filter(
          (item) =>
            (level === "TOUTES" || item.level === level) &&
            (agency === "TOUTES" || item.agency === agency || item.agency === "TOUTES") &&
            (category === "TOUTES" || item.category === category) &&
            (readFilter === "TOUTES" || (readFilter === "LUES" ? item.read : !item.read))
        )
      ),
    [result, level, agency, category, readFilter]
  );

  async function mark(alertId?: string) {
    setMarking(alertId ?? "ALL");
    try {
      const response = await authenticatedRead(getSupabaseBrowserClient().auth, "/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: alertId ? "MARK_READ" : "MARK_ALL_READ", alertId })
      });
      await readJsonOrThrow(response, "Marquage de l’alerte indisponible.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Marquage de l’alerte indisponible.");
    } finally {
      setMarking(null);
    }
  }

  return (
    <>
      {error ? <GlassPanel className="mt-7 p-6 text-red-200" role="alert">{error}</GlassPanel> : null}
      {!result && !error ? <LoaderCircle className="mx-auto mt-12 h-7 w-7 animate-spin text-accent" /> : null}
      {result ? (
        <>
          <GlassPanel className="mt-7 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-6">
                <Counter label="Alertes actives" value={result.activeCount} />
                <Counter label="Non lues" value={result.unreadCount} accent />
                <Counter label="Lues" value={result.readCount} />
              </div>
              <Button variant="outline" disabled={result.unreadCount === 0 || marking !== null} onClick={() => void mark()}>
                {marking === "ALL" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Tout marquer comme lu
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Une alerte lue reste visible tant que sa situation métier est active. Seuil Stockage : {result.thresholds.storageStaleDays} jours · Paiement partiel COO : {result.thresholds.cooPartialPaymentDays} jours
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <Filter label="Lecture" value={readFilter} values={readFilters} set={setReadFilter} />
              <Filter label="Niveau" value={level} values={levels} set={setLevel} />
              <Filter label="Agence" value={agency} values={agencies} set={setAgency} />
              <Filter label="Catégorie" value={category} values={categories} set={setCategory} />
            </div>
          </GlassPanel>
          <section className="mt-6 space-y-4">
            {alerts.length === 0 ? (
              <GlassPanel className="p-8 text-center text-muted-foreground">Aucune alerte active pour ces filtres.</GlassPanel>
            ) : (
              alerts.map((item) => <AlertCard key={`${item.id}:${item.occurrence}`} item={item} marking={marking} onMark={mark} />)
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

function Counter({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div><p className="text-sm text-muted-foreground">{label}</p><p className={`text-3xl font-bold ${accent ? "text-accent" : "text-white"}`}>{value}</p></div>;
}

function Filter<T extends string>({ label, value, values, set }: { label: string; value: T; values: readonly T[]; set: (value: T) => void }) {
  return <label className="text-sm">{label}<select className="mt-1 h-11 w-full rounded-md border border-white/15 bg-ebe-night px-3" value={value} onChange={(event) => set(event.target.value as T)}>{values.map((item) => <option key={item}>{item}</option>)}</select></label>;
}

function AlertCard({ item, marking, onMark }: { item: AdminAlertWithReadState; marking: string | null; onMark: (alertId?: string) => Promise<void> }) {
  const tone = item.read ? "border-white/10 opacity-70" : item.level === "IMPORTANT" ? "border-red-300/40" : item.level === "ATTENTION" ? "border-amber-300/40" : "border-sky-300/30";
  return <GlassPanel className={`p-5 ${tone}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-accent">{item.level} · {item.category}</p><h2 className="mt-1 text-lg font-semibold">{item.title}</h2></div><div className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1 text-xs ${item.read ? "border-white/15 text-muted-foreground" : "border-accent/40 text-accent"}`}>{item.read ? "LUE" : "NON LUE"}</span><span className="rounded-full border border-white/15 px-3 py-1 text-xs">{item.agency}</span></div></div>{item.trackingCode ? <p className="mt-3 font-mono text-sm">Code colis : {item.trackingCode}</p> : null}<p className="mt-2 text-sm">{item.description}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Sources : {item.sources.join(" / ")} · {new Date(item.occurredAt).toLocaleString("fr-FR")}</p>{item.read ? <p className="text-xs text-muted-foreground">Lue {item.readAt ? new Date(item.readAt).toLocaleString("fr-FR") : ""}</p> : <Button size="sm" variant="outline" disabled={marking !== null} onClick={() => void onMark(item.id)}>{marking === item.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Marquer comme lue</Button>}</div></GlassPanel>;
}
