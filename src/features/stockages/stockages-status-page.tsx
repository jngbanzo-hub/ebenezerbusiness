"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Camera,
  CircleCheck,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck
} from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import {
  loadStockagesStatus,
  StockagesStatusApiError
} from "@/features/stockages/api";
import type {
  StockagesInitialBalanceStatus,
  StockagesPreparationStatus
} from "@/features/stockages/types";

const UNAVAILABLE = "Non disponible avant l’activation";

const SITE_LABELS = {
  COO: "COO — Cotonou",
  FIH: "FIH — Kinshasa",
  LSHI: "LSHI — Lubumbashi",
  KLZ: "KLZ — Kolwezi"
} as const;

type StockagesStatusPageProps = {
  scope: "agent" | "admin";
  backHref: "/agent" | "/admin";
};

export function StockagesStatusPage({
  scope,
  backHref
}: StockagesStatusPageProps) {
  const router = useRouter();
  const [status, setStatus] = useState<StockagesPreparationStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.replace("/auth/sign-in");
          return;
        }

        const loaded = await loadStockagesStatus(
          session.access_token,
          scope,
          controller.signal
        );
        if (active) {
          setStatus(loaded);
        }
      } catch (caughtError) {
        if (!active || controller.signal.aborted) {
          return;
        }

        if (
          caughtError instanceof StockagesStatusApiError &&
          caughtError.status === 401
        ) {
          await signOutAgent().catch(() => undefined);
          router.replace("/auth/sign-in");
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Le statut Stockages est temporairement indisponible."
        );
      }
    }

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [router, scope]);

  return (
    <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12">
      <Container>
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="growth">EN PRÉPARATION</Badge>
            <h1 className="mt-3 text-3xl font-semibold">
              Gestion des stockages
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Le système de gestion des stockages est en cours de préparation.
              <br />
              Activation officielle prévue le 03/08/2026 à 07:00.
            </p>
          </div>
          <Button asChild type="button" variant="outline">
            <Link href={backHref}>Retour au tableau de bord</Link>
          </Button>
        </header>

        {error ? (
          <GlassPanel className="mt-8 border-red-300/20 p-6">
            <AlertTriangle className="h-7 w-7 text-red-200" />
            <p role="alert" className="mt-3 text-sm text-red-100">
              {error}
            </p>
          </GlassPanel>
        ) : !status ? (
          <GlassPanel className="mt-8 p-6 text-center" glow="growth">
            <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-accent" />
            <p className="mt-3 text-sm text-muted-foreground">
              Chargement sécurisé du statut…
            </p>
          </GlassPanel>
        ) : (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatusCard
                icon={ShieldCheck}
                label="Statut du système"
                value={status.systemStatus ?? UNAVAILABLE}
              />
              <StatusCard
                icon={CalendarClock}
                label="Date d’activation"
                value={status.activationDate ?? UNAVAILABLE}
              />
              <StatusCard
                icon={Camera}
                label="Photographie initiale"
                value={
                  status.snapshot.present
                    ? status.snapshot.status ?? "Présente"
                    : "Absente"
                }
              />
              <StatusCard
                icon={RefreshCcw}
                label="Dernière simulation"
                value={
                  status.lastSimulation
                    ? `${status.lastSimulation.result} — ${status.lastSimulation.date}`
                    : UNAVAILABLE
                }
              />
            </section>

            <section className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <GlassPanel className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <Boxes className="h-6 w-6 text-accent" />
                  <div>
                    <h2 className="text-xl font-semibold">Soldes initiaux</h2>
                    <p className="text-sm text-muted-foreground">
                      État administratif uniquement — aucun stock actuel affiché.
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {status.initialBalances.map((balance) => (
                    <InitialBalanceCard key={balance.site} balance={balance} />
                  ))}
                </div>
              </GlassPanel>

              <GlassPanel className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-6 w-6 text-amber-200" />
                  <h2 className="text-xl font-semibold">Alertes</h2>
                </div>
                <dl className="mt-5 space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Anomalies bloquantes</dt>
                    <dd className="mt-1 font-medium">
                      {status.anomalies.blocking ?? UNAVAILABLE}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Résultat de l’audit</dt>
                    <dd className="mt-1 font-medium">
                      {status.anomalies.result ?? UNAVAILABLE}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Dernière mise à jour</dt>
                    <dd className="mt-1 font-medium">
                      {status.lastUpdatedAt ?? UNAVAILABLE}
                    </dd>
                  </div>
                </dl>
              </GlassPanel>
            </section>

            <GlassPanel className="mt-6 border-accent/20 p-5 sm:p-6" glow="growth">
              <div className="flex items-start gap-3">
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <p className="text-sm leading-6 text-muted-foreground">
                  Ce module est strictement en lecture seule. Aucune activation,
                  photographie, simulation, synchronisation ou écriture de stock
                  n’est disponible depuis le site.
                </p>
              </div>
            </GlassPanel>
          </>
        )}
      </Container>
    </main>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
}) {
  return (
    <GlassPanel className="p-5">
      <Icon className="h-6 w-6 text-accent" />
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </GlassPanel>
  );
}

function InitialBalanceCard({
  balance
}: {
  balance: StockagesInitialBalanceStatus;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <p className="font-medium">{SITE_LABELS[balance.site]}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {balance.status ?? UNAVAILABLE}
      </p>
    </div>
  );
}
