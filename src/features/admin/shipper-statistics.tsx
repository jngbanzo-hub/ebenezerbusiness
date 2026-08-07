"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  LoaderCircle,
  PackageSearch,
  Scale,
  Search,
  UserRoundSearch
} from "lucide-react";

import { GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatWeight } from "@/lib/format-weight";
import {
  AdminShippersApiError,
  hasVisibleShipperAnomalies,
  loadShipperStatistics,
  loadShipperSuggestions
} from "@/features/admin/shippers";
import {
  getAdminPeriodRange,
  isValidAdminDateRange,
  type AdminDateRange
} from "@/features/admin/period";
import {
  MANIFEST_DESTINATIONS,
  MANIFEST_SITES,
  type AdminPeriodPreset,
  type ManifestDestination,
  type ManifestSite,
  type ShipperAnomalyReport,
  type ShipperStatistics,
  type ShipperSuggestion
} from "@/features/admin/types";

const SITE_LABELS: Record<ManifestSite, string> = {
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
  "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20";

export function ShipperStatisticsSection({
  accessToken
}: {
  accessToken: string;
}) {
  const initialRange = useMemo(() => getAdminPeriodRange("TODAY"), []);
  const [shipper, setShipper] = useState("");
  const [suggestions, setSuggestions] = useState<ShipperSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [periodPreset, setPeriodPreset] =
    useState<AdminPeriodPreset>("TODAY");
  const [customRange, setCustomRange] = useState<AdminDateRange>(initialRange);
  const [site, setSite] = useState<ManifestSite | "ALL">("ALL");
  const [destination, setDestination] = useState<
    ManifestDestination | "ALL"
  >("ALL");
  const [statistics, setStatistics] = useState<ShipperStatistics | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const selectedRange = useMemo(
    () =>
      periodPreset === "CUSTOM"
        ? customRange
        : getAdminPeriodRange(periodPreset),
    [customRange, periodPreset]
  );
  const isRangeValid = isValidAdminDateRange(selectedRange);
  const canSearch =
    Boolean(accessToken) &&
    shipper.trim().length >= 2 &&
    isRangeValid &&
    !isSearching;

  useEffect(() => {
    const query = shipper.trim();
    if (!accessToken || query.length < 2) {
      setSuggestions([]);
      setSuggestionError("");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoadingSuggestions(true);
      setSuggestionError("");

      try {
        setSuggestions(
          await loadShipperSuggestions(accessToken, query, controller.signal)
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSuggestionError(
            error instanceof Error
              ? error.message
              : "Suggestions temporairement indisponibles."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSuggestions(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [accessToken, shipper]);

  async function handleSearch() {
    if (!canSearch) {
      return;
    }

    setIsSearching(true);
    setSearchError("");

    try {
      const result = await loadShipperStatistics(accessToken, {
        shipper: shipper.trim(),
        startDate: selectedRange.startDate,
        endDate: selectedRange.endDate,
        site,
        destination
      });
      setStatistics(result);
      setSuggestions([]);
    } catch (error) {
      setStatistics(null);
      setSearchError(
        error instanceof AdminShippersApiError
          ? error.message
          : "Impossible de charger les statistiques."
      );
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className="mt-12 border-t border-white/10 pt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="growth">Lecture seule</Badge>
          <h2 className="mt-3 text-2xl font-semibold text-accent">
            Statistiques par expéditeur
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Consultez les colis du Manifeste Public sans modifier les données
            sources.
          </p>
        </div>
      </div>

      <GlassPanel className="mt-6 p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative text-sm font-medium xl:col-span-2">
            Expéditeur
            <div className="relative">
              <input
                type="search"
                className={`${fieldClassName} pr-10`}
                value={shipper}
                onChange={(event) => {
                  setShipper(event.target.value);
                  setStatistics(null);
                }}
                placeholder="Saisir au moins 2 caractères"
                autoComplete="off"
              />
              {isLoadingSuggestions ? (
                <LoaderCircle className="absolute right-3 top-1/2 mt-1 h-4 w-4 animate-spin text-accent" />
              ) : (
                <UserRoundSearch className="absolute right-3 top-1/2 mt-1 h-4 w-4 text-muted-foreground" />
              )}
            </div>
            {suggestions.length > 0 ? (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-white/15 bg-ebe-navy p-1 shadow-2xl">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.normalizedName}>
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-left text-sm text-white hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                      onClick={() => {
                        setShipper(suggestion.name);
                        setSuggestions([]);
                      }}
                    >
                      {suggestion.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>

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
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-ebe-navy"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Site
            <select
              className={fieldClassName}
              value={site}
              onChange={(event) =>
                setSite(event.target.value as ManifestSite | "ALL")
              }
            >
              <option value="ALL" className="bg-ebe-navy">
                Tous
              </option>
              {MANIFEST_SITES.map((item) => (
                <option key={item} value={item} className="bg-ebe-navy">
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Destination
            <select
              className={fieldClassName}
              value={destination}
              onChange={(event) =>
                setDestination(
                  event.target.value as ManifestDestination | "ALL"
                )
              }
            >
              <option value="ALL" className="bg-ebe-navy">
                Toutes
              </option>
              {MANIFEST_DESTINATIONS.map((item) => (
                <option key={item} value={item} className="bg-ebe-navy">
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        {periodPreset === "CUSTOM" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {!isRangeValid ? (
              <p role="alert" className="text-sm text-amber-200">
                La période sélectionnée est invalide.
              </p>
            ) : suggestionError ? (
              <p role="alert" className="text-sm text-amber-200">
                {suggestionError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Correspondance exacte après normalisation de la casse et des
                espaces. Aucun rapprochement approximatif.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="growth"
            disabled={!canSearch}
            onClick={handleSearch}
          >
            {isSearching ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Rechercher
          </Button>
        </div>
      </GlassPanel>

      {searchError ? (
        <ShipperStatePanel
          icon={AlertTriangle}
          title="Recherche indisponible"
          description={searchError}
        />
      ) : statistics ? (
        <ShipperResults statistics={statistics} />
      ) : (
        <ShipperStatePanel
          icon={PackageSearch}
          title="Aucune recherche lancée"
          description="Sélectionnez un expéditeur et une période pour afficher ses statistiques."
        />
      )}
    </section>
  );
}

function ShipperResults({ statistics }: { statistics: ShipperStatistics }) {
  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <HighlightCard
          icon={PackageSearch}
          label="Colis enregistrés"
          value={String(statistics.nombreColis)}
        />
        <HighlightCard
          icon={Scale}
          label="Kilogrammes enregistrés"
          value={formatWeight(statistics.totalKilogrammes)}
        />
        <HighlightCard
          icon={CalendarDays}
          label="Poids moyen"
          value={
            statistics.poidsMoyenKg === null
              ? "—"
              : formatWeight(statistics.poidsMoyenKg)
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BreakdownPanel
          title="Répartition par site"
          entries={MANIFEST_SITES.map((site) => ({
            label: `${site} — ${SITE_LABELS[site]}`,
            ...statistics.bySite[site]
          }))}
        />
        <BreakdownPanel
          title="Répartition par destination"
          entries={MANIFEST_DESTINATIONS.map((destination) => ({
            label: destination,
            ...statistics.byDestination[destination]
          }))}
        />
      </div>

      {hasVisibleShipperAnomalies(statistics.anomalies) ? (
        <AnomalyPanel anomalies={statistics.anomalies} />
      ) : null}

      <GlassPanel className="mt-6 overflow-hidden">
        <div className="border-b border-white/10 p-5 sm:p-6">
          <h3 className="text-xl font-semibold">Détail des colis</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {statistics.expediteur || "Expéditeur"} —{" "}
            {statistics.startDate} au {statistics.endDate}
          </p>
        </div>

        {statistics.parcels.length === 0 ? (
          <div className="grid min-h-52 place-items-center p-8 text-center">
            <div>
              <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" />
              <h4 className="mt-3 font-semibold">Aucun colis trouvé</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Aucun colis ne correspond exactement à cet expéditeur et aux
                filtres sélectionnés.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {[
                    "Date",
                    "Code colis",
                    "Expéditeur",
                    "Site source",
                    "Destination",
                    "Poids"
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="whitespace-nowrap px-4 py-3 font-semibold"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {statistics.parcels.map((parcel) => (
                  <tr
                    key={parcel.id}
                    className="transition hover:bg-white/[0.03]"
                  >
                    <ShipperTableCell>
                      {formatDateKey(parcel.date)}
                    </ShipperTableCell>
                    <ShipperTableCell emphasized>
                      {parcel.codeColis}
                    </ShipperTableCell>
                    <ShipperTableCell>{parcel.expediteur}</ShipperTableCell>
                    <ShipperTableCell>{parcel.sourceSite}</ShipperTableCell>
                    <ShipperTableCell>{parcel.destination}</ShipperTableCell>
                    <ShipperTableCell emphasized>
                      {parcel.poidsKg === null
                        ? "Poids invalide"
                        : formatWeight(parcel.poidsKg)}
                    </ShipperTableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </>
  );
}

function HighlightCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof PackageSearch;
  label: string;
  value: string;
}) {
  return (
    <GlassPanel className="p-5" glow="growth">
      <Icon className="h-5 w-5 text-accent" />
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-accent">{value}</p>
    </GlassPanel>
  );
}

function BreakdownPanel({
  title,
  entries
}: {
  title: string;
  entries: Array<{ label: string; colis: number; kilogrammes: number }>;
}) {
  return (
    <GlassPanel className="p-5 sm:p-6">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.label}
            className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <span className="text-sm text-muted-foreground">{entry.label}</span>
            <span className="text-right text-sm">
              <strong className="text-accent">{entry.colis}</strong> colis ·{" "}
              <strong className="text-accent">
                {formatWeight(entry.kilogrammes)}
              </strong>
            </span>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function AnomalyPanel({ anomalies }: { anomalies: ShipperAnomalyReport }) {
  const entries = [
    ["Dates invalides exclues", anomalies.invalidDates],
    ["Codes colis manquants", anomalies.missingCodes],
    ["Poids invalides exclus", anomalies.invalidWeights],
    ["Lignes dupliquées", anomalies.duplicateRows],
    ["Conflits de poids", anomalies.conflictingWeights],
    ["Codes présents dans plusieurs sites", anomalies.crossSiteCodes]
  ].filter(([, count]) => Number(count) > 0);

  return (
    <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
      <div className="flex items-center gap-2 text-amber-100">
        <AlertTriangle className="h-5 w-5" />
        <h3 className="font-semibold">Rapport d’anomalies</h3>
      </div>
      <ul className="mt-3 grid gap-2 text-sm text-amber-100/80 sm:grid-cols-2">
        {entries.map(([label, count]) => (
          <li key={String(label)}>
            {label} : <strong>{count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShipperStatePanel({
  icon: Icon,
  title,
  description
}: {
  icon: typeof PackageSearch;
  title: string;
  description: string;
}) {
  return (
    <GlassPanel className="mt-6 p-8 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        {description}
      </p>
    </GlassPanel>
  );
}

function ShipperTableCell({
  children,
  emphasized = false
}: {
  children: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <td
      className={`px-4 py-4 ${
        emphasized ? "font-semibold text-white" : "text-muted-foreground"
      }`}
    >
      {children}
    </td>
  );
}

function formatDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}
