"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Globe2, LoaderCircle, QrCode, Search, Users } from "lucide-react";

import { GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type {
  PublicSiteAnalyticsPayload,
  PublicSiteAnalyticsPeriod
} from "@/features/admin/public-site-analytics-types";
import { authenticatedRead, readJsonOrThrow } from "@/features/auth/authenticated-fetch";

const PERIODS: readonly Readonly<{ value: PublicSiteAnalyticsPeriod; label: string }>[] = [
  { value: "today", label: "Aujourd’hui" },
  { value: "7d", label: "7 jours" },
  { value: "30d", label: "30 jours" }
];

export function AdminPublicSiteAnalytics({ accessToken }: { accessToken: string }) {
  const [period, setPeriod] = useState<PublicSiteAnalyticsPeriod>("7d");
  const [payload, setPayload] = useState<PublicSiteAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    setLoading(true);
    setUnavailable(false);

    void authenticatedRead(
      getSupabaseBrowserClient().auth,
      `/api/admin/public-site-analytics?period=${period}`,
      { signal: controller.signal },
      fetch,
      accessToken
    )
      .then((response) =>
        readJsonOrThrow<PublicSiteAnalyticsPayload>(
          response,
          "Statistiques du site public temporairement indisponibles."
        )
      )
      .then(setPayload)
      .catch(() => {
        if (!controller.signal.aborted) {
          setPayload(null);
          setUnavailable(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [accessToken, period]);

  return (
    <section className="mt-10" aria-labelledby="public-site-analytics-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="public-site-analytics-title" className="text-2xl font-semibold">
            Statistiques du site public
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Données Vercel Analytics agrégées et anonymes. Les espaces Admin et Agents sont exclus.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Période des statistiques publiques">
          {PERIODS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={period === option.value ? "growth" : "outline"}
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {loading && !payload ? (
        <GlassPanel className="mt-6 grid min-h-40 place-items-center p-6">
          <div className="text-center text-sm text-muted-foreground">
            <LoaderCircle className="mx-auto mb-3 h-6 w-6 animate-spin text-accent" />
            Lecture des agrégats publics…
          </div>
        </GlassPanel>
      ) : unavailable || !payload ? (
        <GlassPanel className="mt-6 p-6">
          <p role="alert" className="text-sm text-amber-100">
            Statistiques temporairement indisponibles.
          </p>
        </GlassPanel>
      ) : (
        <AnalyticsContent payload={payload} loading={loading} />
      )}
    </section>
  );
}

function AnalyticsContent({
  payload,
  loading
}: {
  payload: PublicSiteAnalyticsPayload;
  loading: boolean;
}) {
  return (
    <div className={loading ? "mt-6 opacity-60" : "mt-6"} aria-busy={loading}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon={Users} label="Visiteurs aujourd’hui" value={payload.visitors.today} />
        <Kpi icon={Users} label="Visiteurs sur 7 jours" value={payload.visitors.sevenDays} />
        <Kpi icon={Users} label="Visiteurs sur 30 jours" value={payload.visitors.thirtyDays} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BreakdownPanel
          icon={Globe2}
          title="Pays"
          rows={[
            ["Bénin", payload.countries.benin],
            ["RDC", payload.countries.drc],
            ["Autres pays", payload.countries.other]
          ]}
        />
        <BreakdownPanel
          icon={BarChart3}
          title="Appareils"
          rows={[
            ["Mobile", payload.devices.mobile],
            ["Tablette", payload.devices.tablet],
            ["Desktop", payload.devices.desktop]
          ]}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BreakdownPanel
          icon={Search}
          title="Suivi de colis"
          rows={[
            ["Visites /suivi-de-colis", payload.tracking.pageViews],
            ["Recherches colis", payload.tracking.searches],
            ["Recherches réussies", payload.tracking.success],
            ["Recherches sans résultat", payload.tracking.notFound],
            ["Service indisponible", payload.tracking.unavailable]
          ]}
        />
        <BreakdownPanel
          icon={QrCode}
          title="QR"
          rows={[
            ["Ouvertures scanner", payload.qr.scannerOpens],
            ["QR résolus avec succès", payload.qr.resolved],
            ["QR invalides / inconnus", payload.qr.invalidOrUnknown],
            ["QR intégré", payload.qr.integrated],
            ["QR externe", payload.qr.external]
          ]}
        />
      </div>

      <TrendChart rows={payload.trend} />
      <p className="mt-3 text-right text-xs text-muted-foreground">
        Dernière lecture : {formatCheckedAt(payload.checkedAt)}
      </p>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <GlassPanel className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-5 w-5 text-accent" />
      </div>
      <p className="mt-4 text-3xl font-semibold tabular-nums">{formatNumber(value)}</p>
    </GlassPanel>
  );
}

function BreakdownPanel({
  icon: Icon,
  title,
  rows
}: {
  icon: typeof Globe2;
  title: string;
  rows: readonly (readonly [string, number])[];
}) {
  return (
    <GlassPanel className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-accent" />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 border-b border-white/10 pb-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </GlassPanel>
  );
}

function TrendChart({ rows }: { rows: PublicSiteAnalyticsPayload["trend"] }) {
  const max = useMemo(() => Math.max(1, ...rows.map((row) => row.pageViews)), [rows]);
  return (
    <GlassPanel className="mt-4 p-5 sm:p-6">
      <h3 className="text-lg font-semibold">Évolution des pages vues</h3>
      {rows.length ? (
        <div className="mt-6 flex h-32 items-end gap-1" aria-label="Graphique des pages vues">
          {rows.map((row) => (
            <div
              key={row.timestamp}
              className="min-w-1 flex-1 rounded-t bg-accent/70"
              style={{ height: `${Math.max(5, (row.pageViews / max) * 100)}%` }}
              title={`${formatTrendDate(row.timestamp)} : ${formatNumber(row.pageViews)} pages vues`}
              aria-label={`${formatTrendDate(row.timestamp)} : ${formatNumber(row.pageViews)} pages vues`}
            />
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">Aucune visite publique sur cette période.</p>
      )}
    </GlassPanel>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "indisponible"
    : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Africa/Porto-Novo"
      }).format(date);
}

function formatTrendDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date inconnue"
    : new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        timeZone: "Africa/Porto-Novo"
      }).format(date);
}
