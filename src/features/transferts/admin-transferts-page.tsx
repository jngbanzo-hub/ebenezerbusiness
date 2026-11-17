"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, LoaderCircle, LogOut, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminProfile, signOutAgent } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import {
  loadAdminTransfers,
  loadAdminTransfersAudit,
  TransfertsApiError
} from "@/features/transferts/api";
import {
  TRANSFER_AGENCIES,
  TRANSFER_CIRCUITS,
  TRANSFER_CURRENCIES,
  TRANSFER_STATUSES,
  type AdminTransferStatistics,
  type CurrencyTotals,
  type TransfersAuditResponse,
  type TransfersPageResponse
} from "@/features/transferts/types";
import { AdminTransferDetails } from "@/features/transferts/admin-transfer-details";
import { AdminOidcProbeTrigger } from "@/features/transferts/admin-oidc-probe-panel";
import { AdminDeploymentAttestationTrigger } from "@/features/transferts/admin-deployment-attestation-panel";

const fieldClassName =
  "mt-2 h-11 min-w-0 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none";
const periodLabels: Record<string, string> = {
  TODAY: "Aujourd’hui",
  THIS_WEEK: "Cette semaine",
  THIS_MONTH: "Ce mois",
  CUSTOM: "Période personnalisée"
};

export function AdminTransfertsPage({
  oidcProbeEnabled = false,
  oidcProbeExpiresAt,
  deploymentAttestationEnabled = false,
  deploymentAttestationExpiresAt
}: { oidcProbeEnabled?: boolean; oidcProbeExpiresAt?: string;
     deploymentAttestationEnabled?: boolean; deploymentAttestationExpiresAt?: string }) {
  const [view, setView] = useState<"Envoyés" | "Reçus" | "Statistiques" | "Audit">("Envoyés");
  const router = useRouter();
  const token = useRef("");
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState("");
  const [result, setResult] = useState<TransfersPageResponse | null>(null);
  const [audit, setAudit] = useState<TransfersAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [period, setPeriod] = useState("THIS_MONTH");
  const [agencyFrom, setAgencyFrom] = useState("");
  const [agencyTo, setAgencyTo] = useState("");
  const [circuit, setCircuit] = useState("");
  const [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("");
  const [transferId, setTransferId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTransferId, setSelectedTransferId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const customPeriodInvalid = period === "CUSTOM" && (!dateFrom || !dateTo || dateFrom > dateTo);
  const filters = useMemo(
    () => ({
      period,
      agencyFrom,
      agencyTo,
      circuit,
      status,
      currency,
      transferId,
      from: period === "CUSTOM" ? dateFrom : "",
      to: period === "CUSTOM" ? dateTo : ""
    }),
    [agencyFrom, agencyTo, circuit, currency, dateFrom, dateTo, period, status, transferId]
  );

  useEffect(() => {
    let active = true;
    async function protect() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || !session.access_token) {
          router.replace("/auth/sign-in");
          return;
        }
        await getAdminProfile(session.user);
        if (active) {
          token.current = session.access_token;
          setAuthorized(true);
        }
      } catch (error) {
        await signOutAgent().catch(() => undefined);
        if (active) setAuthError(error instanceof Error ? error.message : "Accès interdit.");
      }
    }
    void protect();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!authorized || !token.current || customPeriodInvalid) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setResult(null);
      setAudit(null);
      setAuditError("");
      try {
        const loaded = await loadAdminTransfers(token.current, filters, controller.signal);
        if (!active) return;
        setResult(loaded);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof TransfertsApiError && error.status === 401) {
          await signOutAgent().catch(() => undefined);
          router.replace("/auth/sign-in");
          return;
        }
        setResult({
          state: error instanceof TransfertsApiError && error.status === 403 ? "FORBIDDEN" : "SERVICE_UNAVAILABLE",
          moduleStatus: "PREPARATION",
          role: "ADMIN",
          agency: null,
          apiAvailable: false,
          writesEnabled: false,
          adminEnabled: false,
          transfers: [],
          statistics: null,
          message: error instanceof Error ? error.message : "Service indisponible."
        });
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [agencyFrom, agencyTo, authorized, circuit, currency, customPeriodInvalid, dateFrom, dateTo, filters, period, reloadKey, router, status, transferId]);

  useEffect(() => {
    if (!authorized || !token.current || !result?.adminEnabled || customPeriodInvalid) return;
    const controller = new AbortController();
    let active = true;
    async function loadAudit() {
      setAuditLoading(true);
      setAuditError("");
      setAudit(null);
      try {
        const loadedAudit = await loadAdminTransfersAudit(
          token.current,
          filters,
          controller.signal
        );
        if (active) setAudit(loadedAudit);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof TransfertsApiError && error.status === 401) {
          await signOutAgent().catch(() => undefined);
          router.replace("/auth/sign-in");
          return;
        }
        setAuditError(error instanceof Error ? error.message : "Audit temporairement indisponible.");
      } finally {
        if (active) setAuditLoading(false);
      }
    }
    void loadAudit();
    return () => { active = false; controller.abort(); };
  }, [agencyFrom, agencyTo, authorized, circuit, currency, customPeriodInvalid, dateFrom, dateTo, filters, period, reloadKey, result?.adminEnabled, router, status, transferId]);

  async function handleSignOut() {
    await signOutAgent();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  if (!authorized) {
    return (
      <main className="grid min-h-screen place-items-center bg-ebe-night px-4 text-white">
        <GlassPanel className="w-full max-w-md p-6 text-center">
          {authError ? <p role="alert" className="text-sm text-red-200">{authError}</p> : (
            <p className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin text-accent" /> Vérification de l’accès Admin…
            </p>
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
            <Badge variant="growth">ADMIN · LECTURE SEULE</Badge>
            <h1 className="mt-3 text-3xl font-semibold">Supervision des transferts</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Statistiques calculées côté serveur — fuseau Africa/Porto-Novo.
            </p>
          </div>
          <div className="flex flex-wrap gap-3"><Button asChild variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-center"><Link href="/admin">Retour au tableau de bord Admin</Link></Button><Button type="button" variant="outline" onClick={handleSignOut}><LogOut className="h-4 w-4" />Se déconnecter</Button></div>
        </header>

        {oidcProbeEnabled ? (
          <AdminOidcProbeTrigger enabled expiresAt={oidcProbeExpiresAt} />
        ) : null}
        {deploymentAttestationEnabled ? (
          <AdminDeploymentAttestationTrigger enabled expiresAt={deploymentAttestationExpiresAt} />
        ) : null}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Status label="État" value={result?.state ?? "CHARGEMENT"} />
          <Status label="Agence de traçabilité" value={result?.agency ?? "NON CONFIGURÉE"} />
          <Status label="API" value={result?.apiAvailable ? "DISPONIBLE" : "INDISPONIBLE"} />
          <Status label="Écritures" value={result?.writesEnabled ? "ACTIVÉES" : "DÉSACTIVÉES"} />
          <Status label="Accès Admin" value={result?.adminEnabled ? "ACTIVÉ" : "DÉSACTIVÉ"} />
        </section>

        {result && !result.adminEnabled ? (
          <GlassPanel className="mt-6 border-amber-200/20 p-6">
            <p className="text-sm text-amber-100">{result.message}</p>
          </GlassPanel>
        ) : null}

        <nav aria-label="Vues de supervision" className="mt-6 grid grid-cols-1 min-[320px]:grid-cols-2 gap-1 rounded-xl border border-white/15 bg-white/[0.03] p-1 sm:grid-cols-4">
          {(["Envoyés", "Reçus", "Statistiques", "Audit"] as const).map((tab) => (
            <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)}
              className={`min-h-11 rounded-lg px-3 text-sm font-semibold uppercase tracking-wide focus-visible:outline-accent ${view === tab ? "bg-accent text-ebe-night" : "text-muted-foreground hover:bg-white/10 hover:text-white"}`}>
              {tab}
            </button>
          ))}
        </nav>

        <Filters
          values={{ period, agencyFrom, agencyTo, circuit, status, currency, transferId, dateFrom, dateTo }}
          setters={{ setPeriod, setAgencyFrom, setAgencyTo, setCircuit, setStatus, setCurrency, setTransferId, setDateFrom, setDateTo }}
        />

        {customPeriodInvalid ? (
          <p role="status" className="mt-6">{dateFrom && dateTo ? "La fin ne peut pas précéder le début." : "Choisissez une date de début et une date de fin."}</p>
        ) : loading ? (
          <GlassPanel className="mt-6 p-6 text-center">
            <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-accent" />
          </GlassPanel>
        ) : view === "Statistiques" && result?.statistics ? (
          <Statistics statistics={result.statistics} transfers={result.transfers} periodLabel={period === "CUSTOM" ? `${dateFrom} au ${dateTo}` : periodLabels[period]} />
        ) : null}

        {!customPeriodInvalid && result?.adminEnabled && (view === "Envoyés" || view === "Reçus") && (
          <TransferTable result={result} view={view} onSelect={setSelectedTransferId} />
        )}
        {!customPeriodInvalid && result?.adminEnabled && view === "Audit" && (
          <AuditTable audit={audit} loading={auditLoading} error={auditError} />
        )}

        <GlassPanel className="mt-6 border-accent/20 p-5">
          <p className="flex gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="h-5 w-5 shrink-0 text-accent" />
            Les codes restent masqués par défaut. Leur consultation ponctuelle est réservée à l’Admin authentifié depuis le détail.
          </p>
        </GlassPanel>
        {selectedTransferId && token.current ? (
          <AdminTransferDetails
            token={token.current}
            transferId={selectedTransferId}
            onClose={() => setSelectedTransferId("")}
            onSuccess={() => setReloadKey((value) => value + 1)}
          />
        ) : null}
      </Container>
    </main>
  );
}

function Statistics({ statistics, transfers, periodLabel }: {
  statistics: AdminTransferStatistics; transfers: TransfersPageResponse["transfers"]; periodLabel: string;
}) {
  const [circuitsOpen, setCircuitsOpen] = useState(false);
  const selected = useMemo(() => {
    const totals: AdminTransferStatistics["today"] = {
      count: transfers.length, amountsByCurrency: { USD: 0, CDF: 0, XOF: 0 },
      statuses: { ENVOYE: 0, CODE_RECU: 0, FONDS_RETIRES: 0, CONFIRME: 0, A_VERIFIER: 0, ANNULE: 0 }
    };
    for (const transfer of transfers) {
      totals.amountsByCurrency[transfer.currency] += transfer.amount;
      totals.statuses[transfer.status]++;
    }
    return totals;
  }, [transfers]);
  return (
    <>
      <p className="my-4 text-sm text-muted-foreground">Chiffres établis sur les transferts renvoyés par le serveur. La période porte sur la date d’envoi à Porto-Novo.</p>
      <PeriodCard title={`Période sélectionnée · ${periodLabel}`} data={selected} />
      <p className="mt-6 text-sm text-muted-foreground">Repères fixes : le jour, le mois et les circuits du mois suivent les autres filtres, indépendamment de la période sélectionnée.</p>
      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <PeriodCard title={`Aujourd’hui · ${statistics.todayKey}`} data={statistics.today} />
        <PeriodCard title={`Mois en cours · ${statistics.monthKey}`} data={statistics.currentMonth} />
      </section>
      <GlassPanel className="mt-6 overflow-x-auto p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Circuits du mois</h2>
        <button type="button" aria-expanded={circuitsOpen} aria-controls="monthly-circuits" onClick={() => setCircuitsOpen(open => !open)} className="mt-3 min-h-11 rounded-md border border-white/20 px-4 text-sm font-semibold">
          {circuitsOpen ? "MASQUER LES CIRCUITS" : "VOIR LES CIRCUITS"}
        </button>
        <div id="monthly-circuits" hidden={!circuitsOpen}>
        <table className="mt-5 min-w-full text-left text-sm">
          <thead className="text-muted-foreground"><tr><th className="p-2">Circuit</th><th>Codes</th><th>Montants</th><th>ENVOYE</th><th>CODE_RECU</th><th>FONDS_RETIRES</th><th>CONFIRME</th><th>A_VERIFIER</th><th>ANNULE</th></tr></thead>
          <tbody>
            {TRANSFER_CIRCUITS.map((key) => {
              const row = statistics.currentMonth.byCircuit[key];
              return <tr key={key} className="border-t border-white/10"><td className="p-2 font-medium">{key.replace(">", " → ")}</td><td>{row.count}</td><td><Amounts values={row.amountsByCurrency} /></td>{TRANSFER_STATUSES.map((item) => <td key={item}>{row.statuses[item]}</td>)}</tr>;
            })}
          </tbody>
        </table>
        </div>
      </GlassPanel>
    </>
  );
}

function PeriodCard({ title, data }: { title: string; data: AdminTransferStatistics["today"] }) {
  return (
    <GlassPanel className="p-5 sm:p-6">
      <h2 className="flex items-center gap-3 text-xl font-semibold"><BarChart3 className="h-5 w-5 text-accent" />{title}</h2>
      <p className="mt-4 text-3xl font-semibold">{data.count} codes</p>
      <div className="mt-4"><Amounts values={data.amountsByCurrency} /></div>
      <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
        {TRANSFER_STATUSES.map((status) => <p key={status}><span className="text-muted-foreground">{status}</span> · {data.statuses[status]}</p>)}
      </div>
      <p className="mt-3 text-sm">En cours · {data.statuses.CODE_RECU + data.statuses.FONDS_RETIRES}</p>
    </GlassPanel>
  );
}

function Amounts({ values }: { values: CurrencyTotals }) {
  return <div className="space-y-1">{TRANSFER_CURRENCIES.map((currency) => <p key={currency}>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(values[currency])} {currency}</p>)}</div>;
}

const creationDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Porto-Novo", dateStyle: "short", timeStyle: "short"
});

function TransferTable({ result, view, onSelect }: {
  result: TransfersPageResponse;
  view: "Envoyés" | "Reçus";
  onSelect: (transferId: string) => void;
}) {
  const sent = view === "Envoyés";
  const agencyField = sent ? "agencyFrom" : "agencyTo";
  const columns = ["Création", "Circuit", "Code masqué", "Expéditeur / bénéficiaire", "Montant", "Statut", "Détail"];
  const groups = useMemo(() => TRANSFER_AGENCIES.map(agency => ({
    agency,
    rows: result.transfers.filter(item => item[agencyField] === agency)
      .map(item => ({item, time: Date.parse(item.createdAt)}))
      .sort((a, b) => {
        const difference = (Number.isFinite(b.time) ? b.time : -Infinity) -
          (Number.isFinite(a.time) ? a.time : -Infinity);
        return difference || (a.item.transferId < b.item.transferId ? -1 : Number(a.item.transferId > b.item.transferId));
      })
  })), [result.transfers, agencyField]);

  return (
    <section className="mt-6 space-y-4">
      <h2 className="text-xl font-semibold">{sent ? "Par agence d’origine" : "Par agence de destination"}</h2>
      {!result.transfers.length && <p className="text-sm text-muted-foreground">Aucun transfert ne correspond aux filtres.</p>}
      {groups.filter(group => group.rows.length > 0).map(({ agency, rows }) => (
        <GlassPanel key={agency} className="min-w-0 p-4 sm:p-5">
          <h3 className="flex items-baseline gap-3 text-lg font-semibold">{agency}
            <span className="text-sm font-normal text-muted-foreground">{rows.length} transfert{rows.length > 1 ? "s" : ""}</span>
          </h3>
          <table aria-label={`${view} · ${agency}`} className="mt-3 block w-full text-left text-sm lg:table">
            <thead className="hidden text-xs text-muted-foreground lg:table-header-group">
              <tr>{columns.map(column => <th key={column} scope="col" className="px-2 py-3">{column}</th>)}</tr>
            </thead>
            <tbody className="grid gap-3 sm:grid-cols-2 lg:table-row-group">
              {rows.map(({ item, time }) => {
                const fields = [
                  Number.isFinite(time) ? creationDate.format(time) : "—",
                  `${item.agencyFrom} → ${item.agencyTo}`,
                  item.maskedCode || "—",
                  <span key="names">{item.senderName || "—"}<br />{item.beneficiaryName || "—"}</span>,
                  `${item.amount} ${item.currency}`,
                  item.status
                ];
                return <tr key={item.transferId} className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 p-3 lg:table-row lg:border-x-0 lg:border-b-0">
                  {fields.map((field, index) => <td key={columns[index]} className="min-w-0 break-words lg:px-2 lg:py-3">
                    <span className="block text-xs text-muted-foreground lg:hidden">{columns[index]}</span>{field}
                  </td>)}
                  <td className="col-span-2 lg:px-2"><Button type="button" size="sm" variant="outline" onClick={() => onSelect(item.transferId)}>Voir les détails</Button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </GlassPanel>
      ))}
    </section>
  );
}

function AuditTable({ audit, loading, error }: { audit: TransfersAuditResponse | null; loading: boolean; error: string }) {
  return (
    <GlassPanel className="mt-6 overflow-x-auto p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Audit</h2>
      {loading ? <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin text-accent" />Chargement de l’Audit…</p> : error ? <p role="alert" className="mt-4 text-sm text-amber-100">Audit temporairement indisponible.</p> : !audit?.entries.length ? <p className="mt-4 text-sm text-muted-foreground">Aucun événement d’audit disponible.</p> : (
        <table className="mt-5 min-w-full text-left text-sm"><thead className="text-muted-foreground"><tr><th className="p-2">Date</th><th>Action</th><th>Transfer ID</th><th>Acteur</th><th>Agence</th><th>Résultat</th></tr></thead><tbody>{audit.entries.map((entry) => <tr key={entry.auditId} className="border-t border-white/10"><td className="p-2">{entry.dateTime}</td><td>{entry.action}</td><td>{entry.transferId}</td><td>{entry.user || "Non disponible"}</td><td>{entry.agencyFrom} → {entry.agencyTo}</td><td>{entry.result}</td></tr>)}</tbody></table>
      )}
    </GlassPanel>
  );
}

type FilterValues = { period: string; agencyFrom: string; agencyTo: string; circuit: string; status: string; currency: string; transferId: string; dateFrom: string; dateTo: string };
type FilterSetters = Record<`set${Capitalize<keyof FilterValues>}`, (value: string) => void>;
function Filters({ values, setters }: { values: FilterValues; setters: FilterSetters }) {
  return (
    <GlassPanel className="mt-6 p-5 sm:p-6">
      <h2 className="flex items-center gap-3 text-xl font-semibold"><SlidersHorizontal className="h-5 w-5 text-accent" />Filtres</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Select label="Période" value={values.period} onChange={setters.setPeriod} options={["TODAY", "THIS_WEEK", "THIS_MONTH", "CUSTOM"]} labels={periodLabels} all={false} />
        <Select label="Agence expéditrice" value={values.agencyFrom} onChange={setters.setAgencyFrom} options={[...TRANSFER_AGENCIES]} />
        <Select label="Agence bénéficiaire" value={values.agencyTo} onChange={setters.setAgencyTo} options={[...TRANSFER_AGENCIES]} />
        <Select label="Circuit" value={values.circuit} onChange={setters.setCircuit} options={[...TRANSFER_CIRCUITS]} />
        <Select label="Statut" value={values.status} onChange={setters.setStatus} options={[...TRANSFER_STATUSES]} />
        <Select label="Devise" value={values.currency} onChange={setters.setCurrency} options={[...TRANSFER_CURRENCIES]} />
        {values.period === "CUSTOM" ? <><Input label="Date de début" type="date" value={values.dateFrom} onChange={setters.setDateFrom} /><Input label="Date de fin" type="date" value={values.dateTo} onChange={setters.setDateTo} /></> : null}
        <Input label="Transfer ID" value={values.transferId} onChange={setters.setTransferId} />
      </div>
    </GlassPanel>
  );
}
function Status({ label, value }: { label: string; value: string }) { return <GlassPanel className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-semibold">{value}</p></GlassPanel>; }
function Select({ label, value, onChange, options, labels, all = true }: { label: string; value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string>; all?: boolean }) { return <label className="min-w-0 text-sm">{label}<select className={fieldClassName} value={value} onChange={(event) => onChange(event.target.value)}>{all ? <option value="" className="bg-ebe-navy">Tous</option> : null}{options.map((option) => <option key={option} value={option} className="bg-ebe-navy">{labels?.[option] ?? option.replace(">", " → ")}</option>)}</select></label>; }
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="min-w-0 text-sm">{label}<input type={type} className={fieldClassName} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
