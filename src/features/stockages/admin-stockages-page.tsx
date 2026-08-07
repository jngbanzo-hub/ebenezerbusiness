"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  History,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck
} from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatWeight } from "@/lib/format-weight";
import { getAdminProfile, signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import {
  AdminStockagesApiError,
  loadAdminStockagesAudit,
  loadAdminStockagesMovements,
  loadAdminStockagesStatus
} from "@/features/stockages/admin-stockages-api";
import type {
  AdminStockagesAuditResponse,
  AdminStockagesMovementsResponse,
  AdminStockagesStatusResponse
} from "@/features/stockages/admin-stockages-types";

const UNAVAILABLE = "Non disponible avant l’activation";
const DISABLED_ACTION_MESSAGE =
  "Fonction disponible après autorisation de mise en service";
const SITE_LABELS = {
  COO: "COO — Cotonou",
  FIH: "FIH — Kinshasa",
  LSHI: "LSHI — Lubumbashi",
  KLZ: "KLZ — Kolwezi"
} as const;
const ADMIN_ACTIONS = [
  "Créer la photographie initiale",
  "Vérifier la photographie",
  "Lancer la simulation",
  "Activer le système",
  "Synchroniser les statuts",
  "Recalculer le stock journalier",
  "Désactiver le système",
  "Créer un ajustement administratif",
  "Exporter un rapport"
] as const;
const fieldClassName =
  "h-10 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-muted-foreground focus:border-accent";
type MovementFilters = {
  agency: string;
  date: string;
  parcelCode: string;
  movementType: string;
  triggerStatus: string;
  state: string;
};

export function AdminStockagesPage() {
  const router = useRouter();
  const tokenRef = useRef("");
  const [status, setStatus] = useState<AdminStockagesStatusResponse | null>(null);
  const [movements, setMovements] =
    useState<AdminStockagesMovementsResponse | null>(null);
  const [audit, setAudit] = useState<AdminStockagesAuditResponse | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    agency: "",
    date: "",
    parcelCode: "",
    movementType: "",
    triggerStatus: "",
    state: "ALL"
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function protectAndLoad() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (!session?.user || !session.access_token) {
          router.replace("/auth/sign-in");
          return;
        }

        await getAdminProfile(session.user);
        tokenRef.current = session.access_token;
        const [loadedStatus, loadedMovements, loadedAudit] = await Promise.all([
          loadAdminStockagesStatus(session.access_token, controller.signal),
          loadAdminStockagesMovements(session.access_token, {}, controller.signal),
          loadAdminStockagesAudit(session.access_token, {}, controller.signal)
        ]);
        if (active) {
          setStatus(loadedStatus);
          setMovements(loadedMovements);
          setAudit(loadedAudit);
        }
      } catch (caught) {
        if (!active || controller.signal.aborted) {
          return;
        }
        if (
          caught instanceof AdminStockagesApiError &&
          caught.status === 401
        ) {
          await signOutAgent().catch(() => undefined);
          router.replace("/auth/sign-in");
          return;
        }
        if (
          caught instanceof AdminStockagesApiError &&
          caught.status === 403
        ) {
          router.replace("/agent");
          return;
        }
        setError(caught instanceof Error ? caught.message : "Accès refusé.");
      }
    }

    void protectAndLoad();
    return () => {
      active = false;
      controller.abort();
    };
  }, [router]);

  async function applyMovementFilters() {
    if (!tokenRef.current) {
      return;
    }
    try {
      setMovements(
        await loadAdminStockagesMovements(tokenRef.current, filters)
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de filtrer les mouvements."
      );
    }
  }

  async function handleSignOut() {
    await signOutAgent();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12">
      <Container>
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="growth">ADMIN · BROUILLON</Badge>
            <h1 className="mt-3 text-3xl font-semibold">
              Administration des stockages
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Activation prévue le 03/08/2026 à 07:00 · Africa/Porto-Novo
            </p>
          </div>
          <div className="flex flex-wrap gap-3"><Button asChild type="button" variant="outline"><Link href="/admin">Retour au tableau de bord Admin</Link></Button><Button type="button" variant="outline" onClick={handleSignOut}><LogOut className="h-4 w-4" />Se déconnecter</Button></div>
        </header>

        {error ? (
          <GlassPanel className="mt-8 border-red-300/20 p-6">
            <p role="alert" className="text-sm text-red-100">{error}</p>
          </GlassPanel>
        ) : !status || !movements || !audit ? (
          <GlassPanel className="mt-8 p-8 text-center">
            <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-accent" />
            <p className="mt-3 text-sm text-muted-foreground">
              Vérification ADMIN et chargement sécurisé…
            </p>
          </GlassPanel>
        ) : (
          <>
            <OverviewSection status={status} />
            <InitialBalancesSection status={status} />
            <AgencyStocksSection status={status} />
            <MovementHistorySection
              response={movements}
              filters={filters}
              setFilters={setFilters}
              onApply={applyMovementFilters}
            />
            <AlertsAndAnomaliesSection status={status} />
            <AuditSection response={audit} />
            <DisabledAdminActionsSection />
          </>
        )}
      </Container>
    </main>
  );
}

function OverviewSection({ status }: { status: AdminStockagesStatusResponse }) {
  const items = [
    ["Statut du système", status.overview.systemStatus],
    ["Date d’activation", status.overview.activationDate],
    ["Photographie initiale", status.overview.initialSnapshot],
    ["Dernière simulation", status.overview.lastSimulation],
    ["Dernière synchronisation", status.overview.lastSynchronization],
    ["Dernière mise à jour", status.overview.lastUpdatedAt],
    ["Anomalies bloquantes", status.overview.blockingAnomalies],
    ["Alertes de stock négatif", status.overview.negativeStockAlerts]
  ];
  return (
    <Section title="Vue générale" icon={ShieldCheck}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 font-semibold">{value ?? UNAVAILABLE}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function InitialBalancesSection({ status }: { status: AdminStockagesStatusResponse }) {
  return (
    <Section title="Soldes initiaux" icon={Boxes}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-muted-foreground"><tr>{["Agence", "Statut", "Activation", "Colis initiaux", "Kg initiaux", "Validé par", "Validation"].map((value) => <th key={value} className="pb-3 pr-4">{value}</th>)}</tr></thead>
          <tbody>{status.initialBalances.map((row) => <tr key={row.site} className="border-t border-white/10"><td className="py-3 pr-4 font-medium">{SITE_LABELS[row.site]}</td><td className="pr-4">{row.status ?? UNAVAILABLE}</td><td className="pr-4">{row.activationDate ?? UNAVAILABLE}</td><td className="pr-4">{row.initialParcels ?? UNAVAILABLE}</td><td className="pr-4">{row.initialKilograms === null ? UNAVAILABLE : formatWeight(row.initialKilograms)}</td><td className="pr-4">{row.validatedBy ?? "—"}</td><td>{row.validatedAt ?? "—"}</td></tr>)}</tbody>
        </table>
      </div>
    </Section>
  );
}

function AgencyStocksSection({ status }: { status: AdminStockagesStatusResponse }) {
  return (
    <Section title="Stocks par agence" icon={Boxes}>
      <div className="grid gap-3 lg:grid-cols-2">
        {status.agencyStocks.map((stock) => (
          <div key={stock.site} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="font-semibold">{SITE_LABELS[stock.site]}</h3>
            {!stock.available ? <p className="mt-3 text-sm text-muted-foreground">{UNAVAILABLE}</p> : <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><Metric label="Initial" value={`${stock.initialParcels ?? "—"} colis · ${weightOrDash(stock.initialKilograms)}`} /><Metric label="Entrées" value={`${stock.inboundParcels ?? "—"} colis · ${weightOrDash(stock.inboundKilograms)}`} /><Metric label="Sorties" value={`${stock.outboundParcels ?? "—"} colis · ${weightOrDash(stock.outboundKilograms)}`} /><Metric label="Ajustements" value={`${stock.adjustmentParcels ?? "—"} colis · ${weightOrDash(stock.adjustmentKilograms)}`} /><Metric label="Final" value={`${stock.finalParcels ?? "—"} colis · ${weightOrDash(stock.finalKilograms)}`} /><Metric label="Statut" value={stock.status ?? "—"} /></dl>}
          </div>
        ))}
      </div>
    </Section>
  );
}

function MovementHistorySection({ response, filters, setFilters, onApply }: { response: AdminStockagesMovementsResponse; filters: MovementFilters; setFilters: (value: MovementFilters) => void; onApply: () => void }) {
  const fields: Array<[keyof MovementFilters, string]> = [["agency", "Agence"], ["date", "Date"], ["parcelCode", "Code colis"], ["movementType", "Type de mouvement"], ["triggerStatus", "Statut déclencheur"]];
  return (
    <Section title="Historique des mouvements" icon={History}>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {fields.map(([key, label]) => <input key={key} aria-label={label} placeholder={label} className={fieldClassName} value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })} />)}
        <select aria-label="Annulé ou actif" className={fieldClassName} value={filters.state} onChange={(event) => setFilters({ ...filters, state: event.target.value })}><option value="ALL">Tous les états</option><option value="ACTIVE">Actif</option><option value="CANCELLED">Annulé</option></select>
      </div>
      <Button type="button" className="mt-3" variant="outline" onClick={onApply}>Appliquer les filtres</Button>
      {!response.available ? <p className="mt-4 text-sm text-muted-foreground">{UNAVAILABLE}</p> : <DataList rows={response.movements.map((row) => `${row.date || "—"} · ${row.site || "—"} · ${row.parcelCode || "—"} · ${row.movementType || "—"} · ${row.state}`)} empty="Aucun mouvement." />}
    </Section>
  );
}

function AlertsAndAnomaliesSection({ status }: { status: AdminStockagesStatusResponse }) {
  const categories = ["Anomalies bloquantes", "Doublons", "Exclusions invalides", "Exclusions non retrouvées", "Stocks négatifs", "Erreurs récentes de synchronisation"];
  return (
    <Section title="Alertes et anomalies" icon={AlertTriangle}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{categories.map((category) => <div key={category} className="rounded-xl border border-white/10 p-4"><p className="font-medium">{category}</p><p className="mt-2 text-sm text-muted-foreground">{status.anomalies.filter((item) => categoryForLabel(category) === item.category).length}</p></div>)}</div>
      <DataList rows={status.anomalies.map((row) => `${row.date || "—"} · ${row.category} · ${row.reference || row.details || "—"}`)} empty="Aucune anomalie disponible." />
    </Section>
  );
}

function AuditSection({ response }: { response: AdminStockagesAuditResponse }) {
  return (
    <Section title="Audit" icon={ClipboardList}>
      {!response.available ? <p className="text-sm text-muted-foreground">{UNAVAILABLE}</p> : <DataList rows={response.entries.map((row) => `${row.date || "—"} · ${row.user || "—"} · ${row.action || "—"} · ${row.site || "—"} · ${row.reference || "—"} · ${row.result || "—"} · ${row.details || "—"}`)} empty="Aucune entrée d’audit." />}
    </Section>
  );
}

function DisabledAdminActionsSection() {
  return (
    <Section title="Actions administratives futures" icon={LockKeyhole}>
      <p className="text-sm text-muted-foreground">{DISABLED_ACTION_MESSAGE}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_ACTIONS.map((action) => <Button key={action} type="button" variant="outline" disabled title={DISABLED_ACTION_MESSAGE} aria-describedby="disabled-actions-message">{action}</Button>)}
      </div>
      <p id="disabled-actions-message" className="mt-4 text-sm text-amber-100">{DISABLED_ACTION_MESSAGE}</p>
    </Section>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Boxes; children: React.ReactNode }) {
  return <GlassPanel className="mt-6 p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><Icon className="h-6 w-6 text-accent" /><h2 className="text-xl font-semibold">{title}</h2></div>{children}</GlassPanel>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}

function weightOrDash(value: number | null) {
  return value === null ? "—" : formatWeight(value);
}

function DataList({ rows, empty }: { rows: string[]; empty: string }) {
  return <div className="mt-4 space-y-2">{rows.length ? rows.map((row, index) => <p key={`${index}-${row}`} className="rounded-lg border border-white/10 p-3 text-sm text-muted-foreground">{row}</p>) : <p className="text-sm text-muted-foreground">{empty}</p>}</div>;
}

function categoryForLabel(label: string) {
  return ({
    "Anomalies bloquantes": "ANOMALIE_BLOQUANTE",
    Doublons: "DOUBLON",
    "Exclusions invalides": "EXCLUSION_INVALIDE",
    "Exclusions non retrouvées": "EXCLUSION_NON_RETROUVEE",
    "Stocks négatifs": "STOCK_NEGATIF",
    "Erreurs récentes de synchronisation": "ERREUR_SYNCHRONISATION"
  } as const)[label as "Anomalies bloquantes"] ?? "ANOMALIE_BLOQUANTE";
}
