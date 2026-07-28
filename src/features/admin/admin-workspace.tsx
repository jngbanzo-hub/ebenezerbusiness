"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Building2,
  CalendarDays,
  CircleAlert,
  CreditCard,
  LoaderCircle,
  LogOut,
  PackageSearch,
  Scale,
  ShieldX
} from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AdminPaymentsApiError,
  calculateAdminPaymentsSummary,
  filterAdminPayments,
  formatAdminAmount,
  formatAdminDateTime,
  formatAdminWeight,
  loadAdminPayments
} from "@/features/admin/payments";
import {
  getAdminPeriodRange,
  isValidAdminDateRange,
  type AdminDateRange
} from "@/features/admin/period";
import {
  ADMIN_DESTINATIONS,
  ADMIN_SITES,
  type AdminDestination,
  type AdminPayment,
  type AdminPeriodPreset,
  type AdminSite
} from "@/features/admin/types";
import { getAdminProfile, signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import type { AdminProfile } from "@/features/agent/types";

const SITE_LABELS: Record<AdminSite, string> = {
  COO: "Cotonou",
  FIH: "Kinshasa",
  LSHI: "Lubumbashi",
  KLZ: "Kolwezi"
};

const PERIOD_OPTIONS: Array<{ value: AdminPeriodPreset; label: string }> = [
  { value: "TODAY", label: "Aujourd’hui" },
  { value: "YESTERDAY", label: "Hier" },
  { value: "THIS_WEEK", label: "Cette semaine" },
  { value: "THIS_MONTH", label: "Ce mois" },
  { value: "CUSTOM", label: "Période personnalisée" }
];

const fieldClassName =
  "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25";

export function AdminWorkspace() {
  const router = useRouter();
  const accessTokenRef = useRef("");
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [authError, setAuthError] = useState("");
  const [accessForbidden, setAccessForbidden] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<AdminPeriodPreset>("TODAY");
  const initialRange = useMemo(() => getAdminPeriodRange("TODAY"), []);
  const [customRange, setCustomRange] = useState<AdminDateRange>(initialRange);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isServerAuthorized, setIsServerAuthorized] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [siteFilter, setSiteFilter] = useState<AdminSite | "ALL">("ALL");
  const [destinationFilter, setDestinationFilter] = useState<
    AdminDestination | "ALL"
  >("ALL");
  const [codeFilter, setCodeFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");

  const selectedRange = useMemo(
    () =>
      periodPreset === "CUSTOM"
        ? customRange
        : getAdminPeriodRange(periodPreset),
    [customRange, periodPreset]
  );
  const isRangeValid = isValidAdminDateRange(selectedRange);
  const filteredPayments = useMemo(
    () =>
      filterAdminPayments(payments, {
        startDate: selectedRange.startDate,
        endDate: selectedRange.endDate,
        site: siteFilter,
        destination: destinationFilter,
        codeColis: codeFilter,
        agent: agentFilter
      }),
    [
      agentFilter,
      codeFilter,
      destinationFilter,
      payments,
      selectedRange.endDate,
      selectedRange.startDate,
      siteFilter
    ]
  );
  const summary = useMemo(
    () => calculateAdminPaymentsSummary(filteredPayments),
    [filteredPayments]
  );

  useEffect(() => {
    let active = true;

    async function protectRoute() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session?.user || !session.access_token) {
          router.replace("/auth/sign-in");
          return;
        }

        const adminProfile = await getAdminProfile(session.user);
        if (active) {
          accessTokenRef.current = session.access_token;
          setProfile(adminProfile);
        }
      } catch (error) {
        await signOutAgent().catch(() => undefined);
        if (active) {
          setAuthError(error instanceof Error ? error.message : "Accès refusé.");
        }
      }
    }

    void protectRoute();

    const supabase = getSupabaseBrowserClient();
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        accessTokenRef.current = "";
        setProfile(null);
        router.replace("/auth/sign-in");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!profile || !isRangeValid || !accessTokenRef.current) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function loadPayments() {
      setIsLoading(true);
      setLoadError("");
      setAccessForbidden(false);

      try {
        const loadedPayments = await loadAdminPayments(
          accessTokenRef.current,
          selectedRange.startDate,
          selectedRange.endDate,
          controller.signal
        );
        if (active) {
          setIsServerAuthorized(true);
          setPayments(loadedPayments);
        }
      } catch (error) {
        if (!active || controller.signal.aborted) {
          return;
        }

        if (
          error instanceof AdminPaymentsApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          setIsServerAuthorized(false);
          setAccessForbidden(true);
          setPayments([]);
          if (error.status === 401) {
            await signOutAgent().catch(() => undefined);
          }
        } else {
          setIsServerAuthorized(false);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Impossible de charger les encaissements."
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadPayments();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    isRangeValid,
    profile,
    selectedRange.endDate,
    selectedRange.startDate
  ]);

  async function handleSignOut() {
    await signOutAgent();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-ebe-night px-4 text-white">
        <GlassPanel className="w-full max-w-md p-6 text-center" glow="growth">
          {authError ? (
            <>
              <h1 className="text-xl font-semibold">Accès refusé</h1>
              <p role="alert" className="mt-3 text-sm text-red-200">
                {authError}
              </p>
              <Button className="mt-6" onClick={() => router.replace("/auth/sign-in")}>
                Retour à la connexion
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">Vérification de votre accès…</p>
          )}
        </GlassPanel>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12">
      <Container>
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="growth">Administration</Badge>
            <h1 className="mt-3 text-3xl font-semibold">Tableau de bord des encaissements</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Consultation en lecture seule — {profile.nom}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </Button>
        </header>

        <GlassPanel className="mt-8 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-primary/25 bg-primary/15 text-[#AFC7FF]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Période et filtres</h2>
              <p className="text-sm text-muted-foreground">
                Affinez les statistiques et les lignes affichées.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-sm font-medium">
              Période
              <select
                className={fieldClassName}
                value={periodPreset}
                onChange={(event) =>
                  setPeriodPreset(event.target.value as AdminPeriodPreset)
                }
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-ebe-navy">
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {periodPreset === "CUSTOM" ? (
              <>
                <label className="text-sm font-medium">
                  Date de début
                  <input
                    type="date"
                    className={fieldClassName}
                    value={customRange.startDate}
                    onChange={(event) =>
                      setCustomRange((range) => ({
                        ...range,
                        startDate: event.target.value
                      }))
                    }
                  />
                </label>
                <label className="text-sm font-medium">
                  Date de fin
                  <input
                    type="date"
                    className={fieldClassName}
                    value={customRange.endDate}
                    onChange={(event) =>
                      setCustomRange((range) => ({
                        ...range,
                        endDate: event.target.value
                      }))
                    }
                  />
                </label>
              </>
            ) : null}

            <label className="text-sm font-medium">
              Site d’encaissement
              <select
                className={fieldClassName}
                value={siteFilter}
                onChange={(event) =>
                  setSiteFilter(event.target.value as AdminSite | "ALL")
                }
              >
                <option value="ALL" className="bg-ebe-navy">
                  Tous les sites
                </option>
                {ADMIN_SITES.map((site) => (
                  <option key={site} value={site} className="bg-ebe-navy">
                    {site} — {SITE_LABELS[site]}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium">
              Destination
              <select
                className={fieldClassName}
                value={destinationFilter}
                onChange={(event) =>
                  setDestinationFilter(event.target.value as AdminDestination | "ALL")
                }
              >
                <option value="ALL" className="bg-ebe-navy">
                  Toutes les destinations
                </option>
                {ADMIN_DESTINATIONS.map((destination) => (
                  <option
                    key={destination}
                    value={destination}
                    className="bg-ebe-navy"
                  >
                    {destination} — {SITE_LABELS[destination]}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium">
              Code colis
              <input
                type="search"
                className={fieldClassName}
                value={codeFilter}
                onChange={(event) => setCodeFilter(event.target.value)}
                placeholder="Ex. JL45426"
              />
            </label>

            <label className="text-sm font-medium">
              Agent
              <input
                type="search"
                className={fieldClassName}
                value={agentFilter}
                onChange={(event) => setAgentFilter(event.target.value)}
                placeholder="Nom de l’agent"
              />
            </label>
          </div>

          {!isRangeValid ? (
            <p role="alert" className="mt-4 text-sm text-amber-200">
              La date de fin doit être postérieure ou égale à la date de début.
            </p>
          ) : null}
        </GlassPanel>

        {accessForbidden ? (
          <StatePanel
            icon={ShieldX}
            title="Accès interdit"
            description="Votre session ne possède pas l’autorisation ADMIN requise."
          />
        ) : loadError ? (
          <StatePanel
            icon={CircleAlert}
            title="Erreur de chargement"
            description={loadError}
          />
        ) : !isServerAuthorized ? (
          <StatePanel
            icon={LoaderCircle}
            title="Chargement sécurisé"
            description="Validation de votre accès et lecture des encaissements en cours…"
          />
        ) : (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {ADMIN_SITES.map((site) => (
                <StatsCard
                  key={site}
                  title={`${site} — ${SITE_LABELS[site]}`}
                  stats={summary.sites[site]}
                />
              ))}
            </section>

            <GlassPanel className="mt-4 p-5 sm:p-6" glow="growth">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg border border-accent/25 bg-accent/15 text-accent">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total général</p>
                  <p className="text-2xl font-semibold">
                    {formatAdminAmount(summary.total.montantTotal)}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Metric
                  icon={CreditCard}
                  label="Paiements"
                  value={String(summary.total.nombrePaiements)}
                />
                <Metric
                  icon={Scale}
                  label="Poids concerné"
                  value={formatAdminWeight(summary.total.poidsTotalKg)}
                />
              </div>
            </GlassPanel>

            <GlassPanel className="mt-8 overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <h2 className="text-xl font-semibold">Détail des encaissements</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {filteredPayments.length} paiement
                    {filteredPayments.length === 1 ? "" : "s"} affiché
                    {filteredPayments.length === 1 ? "" : "s"}
                  </p>
                </div>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Chargement…
                  </div>
                ) : null}
              </div>

              {isLoading && payments.length === 0 ? (
                <div className="grid min-h-64 place-items-center p-8 text-center">
                  <div>
                    <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      Lecture sécurisée des encaissements…
                    </p>
                  </div>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="grid min-h-64 place-items-center p-8 text-center">
                  <div>
                    <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" />
                    <h3 className="mt-3 font-semibold">Aucune donnée</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Aucun encaissement ne correspond à cette période et à ces filtres.
                    </p>
                  </div>
                </div>
              ) : (
                <PaymentsTable payments={filteredPayments} />
              )}
            </GlassPanel>
          </>
        )}
      </Container>
    </main>
  );
}

function StatsCard({
  title,
  stats
}: {
  title: string;
  stats: ReturnType<typeof calculateAdminPaymentsSummary>["total"];
}) {
  return (
    <GlassPanel className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        <Banknote className="h-5 w-5 text-primary" />
      </div>
      <p className="mt-4 text-2xl font-semibold">{formatAdminAmount(stats.montantTotal)}</p>
      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
        <p>{stats.nombrePaiements} paiement{stats.nombrePaiements === 1 ? "" : "s"}</p>
        <p>{formatAdminWeight(stats.poidsTotalKg)}</p>
      </div>
    </GlassPanel>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <Icon className="h-5 w-5 text-[#AFC7FF]" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-semibold">{value}</p>
      </div>
    </div>
  );
}

function StatePanel({
  icon: Icon,
  title,
  description
}: {
  icon: typeof CircleAlert;
  title: string;
  description: string;
}) {
  return (
    <GlassPanel className="mt-8 p-8 text-center">
      <Icon className="mx-auto h-9 w-9 text-red-200" />
      <h2 className="mt-4 text-xl font-semibold">{title}</h2>
      <p role="alert" className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        {description}
      </p>
    </GlassPanel>
  );
}

function PaymentsTable({ payments }: { payments: AdminPayment[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1600px] w-full text-left text-sm">
        <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {[
              "Date et heure",
              "Code colis",
              "Poids",
              "Montant attendu",
              "Montant payé",
              "Solde",
              "Site",
              "Destination",
              "Statut",
              "Agent",
              "Mode",
              "Référence",
              "Observation"
            ].map((heading) => (
              <th key={heading} className="whitespace-nowrap px-4 py-3 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {payments.map((payment) => (
            <tr key={payment.id} className="align-top transition hover:bg-white/[0.03]">
              <TableCell>{formatAdminDateTime(payment.dateTime)}</TableCell>
              <TableCell emphasized>{payment.codeColis}</TableCell>
              <TableCell>
                {payment.poidsKg === null ? "—" : formatAdminWeight(payment.poidsKg)}
              </TableCell>
              <TableCell>
                {payment.montantAttendu === null
                  ? "—"
                  : formatAdminAmount(payment.montantAttendu)}
              </TableCell>
              <TableCell emphasized>{formatAdminAmount(payment.montantPaye)}</TableCell>
              <TableCell>
                {payment.soldeRestant === null
                  ? "—"
                  : formatAdminAmount(payment.soldeRestant)}
              </TableCell>
              <TableCell>{payment.agenceEncaissement}</TableCell>
              <TableCell>{payment.destination}</TableCell>
              <TableCell>{payment.statutPaiement || "—"}</TableCell>
              <TableCell>{payment.agent || "—"}</TableCell>
              <TableCell>{payment.modePaiement || "—"}</TableCell>
              <TableCell>{payment.reference || "—"}</TableCell>
              <TableCell>{payment.observation || "—"}</TableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableCell({
  children,
  emphasized = false
}: {
  children: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <td
      className={`max-w-64 px-4 py-4 ${
        emphasized ? "font-semibold text-white" : "text-muted-foreground"
      }`}
    >
      <span className="line-clamp-3">{children}</span>
    </td>
  );
}
