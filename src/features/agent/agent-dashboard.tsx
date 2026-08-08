"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  ArrowRightLeft,
  Boxes,
  FileSearch,
  LoaderCircle,
  LogOut,
  ReceiptText,
  ShieldX
} from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { Agency } from "@/features/agent/types";

type AgentDashboardProfile = {
  nom: string;
  role: "AGENT";
  agence: Agency;
  site: "COO" | "FIH" | "LSHI" | "KLZ";
};

const AGENCY_LABELS: Record<Agency, string> = {
  COTONOU: "COO — Cotonou",
  FIH: "FIH — Kinshasa",
  LSHI: "LSHI — Lubumbashi",
  KLZ: "KLZ — Kolwezi"
};

const OPERATIONS = [
  {
    key: "rapport-journalier",
    title: "Rapport synthèse du jour",
    description: "Consulter les opérations quotidiennes consolidées de votre agence",
    icon: ReceiptText,
    available: true,
    href: "/agent/rapport-journalier",
    actionLabel: "Ouvrir le rapport"
  },
  {
    key: "encaissement",
    title: "Encaissement",
    description: "Rechercher les colis et enregistrer leurs paiements",
    icon: Banknote,
    available: true,
    href: "/agent/encaissement",
    actionLabel: "Ouvrir les encaissements"
  },
  {
    key: "depenses",
    title: "Dépenses",
    description: "Enregistrement des dépenses de l’agence",
    icon: ReceiptText,
    available: true,
    href: "/agent/depenses",
    actionLabel: "Enregistrer une dépense"
  },
  {
    key: "stockage",
    title: "Stockages",
    description: "Gérer les arrivages, les sorties et les statistiques physiques",
    icon: Boxes,
    available: true,
    href: "/agent/stockages",
    actionLabel: "Ouvrir les Stockages"
  },
  {
    key: "transferts",
    title: "Transferts",
    description: "Consultation préparatoire des transferts de votre agence",
    icon: ArrowRightLeft,
    available: true,
    href: "/agent/transferts",
    actionLabel: "Consulter les transferts"
  },
  {
    key: "caisse",
    title: "Caisse",
    description: "Consulter le solde et les mouvements financiers de votre agence",
    icon: Banknote,
    available: true,
    href: "/agent/caisse",
    actionLabel: "Ouvrir la caisse"
  }
] as const;

export function AgentDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<AgentDashboardProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadProfile() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.replace("/auth/sign-in");
          return;
        }

        const response = await fetch("/api/agent/profile", {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          cache: "no-store",
          signal: controller.signal
        });
        const payload: unknown = await response.json().catch(() => null);

        if (response.status === 401) {
          await signOutAgent().catch(() => undefined);
          router.replace("/auth/sign-in");
          return;
        }

        if (!response.ok || !isAgentDashboardProfile(payload)) {
          throw new Error(
            response.status === 403
              ? "Cet espace est réservé aux agents actifs."
              : "Impossible de vérifier votre profil Agent."
          );
        }

        if (active) {
          setProfile(payload);
        }
      } catch (caughtError) {
        if (!active || controller.signal.aborted) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Accès refusé."
        );
      }
    }

    void loadProfile();

    const supabase = getSupabaseBrowserClient();
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setProfile(null);
        router.replace("/auth/sign-in");
      }
    });

    return () => {
      active = false;
      controller.abort();
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    await signOutAgent();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-ebe-night px-4 text-white">
        <GlassPanel className="w-full max-w-md p-6 text-center" glow="growth">
          {error ? (
            <>
              <ShieldX className="mx-auto h-9 w-9 text-red-200" />
              <h1 className="mt-4 text-xl font-semibold">Accès refusé</h1>
              <p role="alert" className="mt-3 text-sm text-red-200">
                {error}
              </p>
              <Button
                className="mt-6"
                onClick={() => router.replace("/auth/sign-in")}
              >
                Retour à la connexion
              </Button>
            </>
          ) : (
            <>
              <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-accent" />
              <p className="mt-3 text-muted-foreground">
                Vérification sécurisée de votre profil…
              </p>
            </>
          )}
        </GlassPanel>
      </main>
    );
  }

  const operations = OPERATIONS
    .filter((operation) => !(profile.agence === "COTONOU" && ["caisse", "rapport-journalier"].includes(operation.key)))
    .map((operation) => profile.agence === "COTONOU" && operation.key === "stockage"
      ? {
          ...operation,
          title: "Manifeste",
          description: "Consulter les manifestes FIH, LSHI et KLZ en lecture seule",
          icon: FileSearch,
          href: "/agent/manifeste",
          actionLabel: "Consulter le Manifeste"
        }
      : operation);

  return (
    <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12">
      <Container>
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="growth">Espace Agent</Badge>
            <h1 className="mt-3 text-3xl font-semibold">{profile.nom}</h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span>Agence : {AGENCY_LABELS[profile.agence]}</span>
              <span>Rôle : Agent</span>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </Button>
        </header>

        <section className="mt-8">
          <div>
            <h2 className="text-2xl font-semibold">Choisissez une opération</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Les opérations disponibles sont limitées à votre agence.
            </p>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {operations.map((operation) => {
              const Icon = operation.icon;

              if (operation.available) {
                return (
                  <GlassPanel
                    key={operation.key}
                    className="flex min-h-64 flex-col border-accent/25 p-5 sm:p-6"
                    glow="growth"
                  >
                    <div className="grid h-12 w-12 place-items-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold text-accent">
                      {operation.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                      {operation.description}
                    </p>
                    <Button asChild variant="growth" className="mt-6 w-full">
                      <Link href={operation.href}>
                        {"actionLabel" in operation
                          ? operation.actionLabel
                          : "Ouvrir la caisse"}
                      </Link>
                    </Button>
                  </GlassPanel>
                );
              }

              return (
                <GlassPanel
                  key={operation.key}
                  className="flex min-h-64 flex-col border-white/10 p-5 opacity-60 sm:p-6"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">{operation.title}</h3>
                    <Badge>Bientôt disponible</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {operation.description}
                  </p>
                </GlassPanel>
              );
            })}
          </div>
        </section>
      </Container>
    </main>
  );
}

function isAgentDashboardProfile(
  value: unknown
): value is AgentDashboardProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const profile = value as Record<string, unknown>;
  return (
    typeof profile.nom === "string" &&
    profile.nom.trim().length > 0 &&
    profile.role === "AGENT" &&
    typeof profile.agence === "string" &&
    ["COTONOU", "FIH", "LSHI", "KLZ"].includes(profile.agence) &&
    typeof profile.site === "string" &&
    ["COO", "FIH", "LSHI", "KLZ"].includes(profile.site)
  );
}
