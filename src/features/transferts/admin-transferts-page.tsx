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

const fieldClassName =
  "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none";

export function AdminTransfertsPage() {
  const router = useRouter();
  const token = useRef("");
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState("");
  const [result, setResult] = useState<TransfersPageResponse | null>(null);
  const [audit, setAudit] = useState<TransfersAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
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
  const filters = useMemo(
    () => ({
      period,
      agencyFrom,
      agencyTo,
      circuit,
      status,
      currency,
      transferId,
      from: dateFrom,
      to: dateTo
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
    if (!authorized || !token.current) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const loaded = await loadAdminTransfers(token.current, filters, controller.signal);
        if (!active) return;
        setResult(loaded);
        if (loaded.adminEnabled) {
          setAudit(
            await loadAdminTransfersAudit(
              token.current,
              { period, from: dateFrom, to: dateTo, agencyFrom, agencyTo, circuit, status, currency, transferId },
              controller.signal
            )
          );
        } else {
          setAudit(null);
        }
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
  }, [agencyFrom, agencyTo, authorized, circuit, currency, dateFrom, dateTo, filters, period, reloadKey, router, status, transferId]);

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
          <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/admin">Retour au tableau de bord Admin</Link></Button><Button type="button" variant="outline" onClick={handleSignOut}><LogOut className="h-4 w-4" />Se déconnecter</Button></div>
        </header>

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

        <Filters
          values={{ period, agencyFrom, agencyTo, circuit, status, currency, transferId, dateFrom, dateTo }}
          setters={{ setPeriod, setAgencyFrom, setAgencyTo, setCircuit, setStatus, setCurrency, setTransferId, setDateFrom, setDateTo }}
        />

        {loading ? (
          <GlassPanel className="mt-6 p-6 text-center">
            <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-accent" />
          </GlassPanel>
        ) : result?.statistics ? (
          <Statistics statistics={result.statistics} />
        ) : null}

        {result?.adminEnabled ? (
          <>
            <TransferTable result={result} onSelect={setSelectedTransferId} />
            <AuditTable audit={audit} />
          </>
        ) : null}

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

function Statistics({ statistics }: { statistics: AdminTransferStatistics }) {
  return (
    <>
      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <PeriodCard title={`Aujourd’hui · ${statistics.todayKey}`} data={statistics.today} />
        <PeriodCard title={`Mois en cours · ${statistics.monthKey}`} data={statistics.currentMonth} />
      </section>
      <GlassPanel className="mt-6 overflow-x-auto p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Circuits du mois</h2>
        <table className="mt-5 min-w-full text-left text-sm">
          <thead className="text-muted-foreground"><tr><th className="p-2">Circuit</th><th>Codes</th><th>Montants</th><th>ENVOYE</th><th>CODE_RECU</th><th>FONDS_RETIRES</th><th>CONFIRME</th><th>A_VERIFIER</th><th>ANNULE</th></tr></thead>
          <tbody>
            {TRANSFER_CIRCUITS.map((key) => {
              const row = statistics.currentMonth.byCircuit[key];
              return <tr key={key} className="border-t border-white/10"><td className="p-2 font-medium">{key.replace(">", " → ")}</td><td>{row.count}</td><td><Amounts values={row.amountsByCurrency} /></td>{TRANSFER_STATUSES.map((item) => <td key={item}>{row.statuses[item]}</td>)}</tr>;
            })}
          </tbody>
        </table>
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

function TransferTable({
  result,
  onSelect
}: {
  result: TransfersPageResponse;
  onSelect: (transferId: string) => void;
}) {
  return (
    <GlassPanel className="mt-6 overflow-x-auto p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Transferts ({result.transfers.length})</h2>
      {result.transfers.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Aucun transfert ne correspond aux filtres.</p> : (
        <table className="mt-5 min-w-full text-left text-sm">
          <thead className="text-muted-foreground"><tr><th className="p-2">Transfer ID</th><th>Circuit</th><th>Expéditeur / bénéficiaire</th><th>Montant</th><th>Code</th><th>Statut</th><th>Agent</th><th>Envoi</th><th>Mise à jour</th><th>Détail</th></tr></thead>
          <tbody>{result.transfers.map((item) => <tr key={item.transferId} className="border-t border-white/10"><td className="p-2">{item.transferId}</td><td>{item.agencyFrom} → {item.agencyTo}</td><td>{item.senderName || "—"} / {item.beneficiaryName || "—"}</td><td>{item.amount} {item.currency}</td><td>{item.maskedCode || "—"}</td><td>{item.status}</td><td>{item.agentFrom || "—"}</td><td>{item.sentAt}</td><td>{item.updatedAt || "—"}</td><td><Button type="button" size="sm" variant="outline" onClick={() => onSelect(item.transferId)}>Voir</Button></td></tr>)}</tbody>
        </table>
      )}
    </GlassPanel>
  );
}

function AuditTable({ audit }: { audit: TransfersAuditResponse | null }) {
  return (
    <GlassPanel className="mt-6 overflow-x-auto p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Audit</h2>
      {!audit?.entries.length ? <p className="mt-4 text-sm text-muted-foreground">Aucun événement d’audit disponible.</p> : (
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
        <Select label="Période" value={values.period} onChange={setters.setPeriod} options={["TODAY", "THIS_WEEK", "THIS_MONTH", "CUSTOM"]} all={false} />
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
function Select({ label, value, onChange, options, all = true }: { label: string; value: string; onChange: (value: string) => void; options: string[]; all?: boolean }) { return <label className="text-sm">{label}<select className={fieldClassName} value={value} onChange={(event) => onChange(event.target.value)}>{all ? <option value="" className="bg-ebe-navy">Tous</option> : null}{options.map((option) => <option key={option} value={option} className="bg-ebe-navy">{option.replace(">", " → ")}</option>)}</select></label>; }
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-sm">{label}<input type={type} className={fieldClassName} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
