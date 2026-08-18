"use client";

import { CircleAlert, ClipboardList, LoaderCircle, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AdminExpensesApiError,
  loadActiveExpenseAgents,
  loadAdminExpenses,
  projectExpenseTotals,
  type ActiveExpenseAgent,
  type AdminExpense,
  type AdminExpenseAgency,
  type AdminExpenseCurrency,
  type AdminExpenseFilters,
  type AdminExpensesResponse,
  type AdminExpenseStatus
} from "@/features/admin/expenses";
import { EXPENSE_CATEGORIES } from "@/features/expenses/categories";

const agencies: AdminExpenseAgency[] = ["COO", "FIH", "LSHI", "KLZ"];
const currencies: AdminExpenseCurrency[] = ["USD", "FCFA", "CDF"];
const statuses: AdminExpenseStatus[] = ["ACTIVE", "CORRECTION_DEMANDEE", "CORRIGEE", "ANNULEE"];
const fieldClassName = "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/25";

type FilterForm = Omit<AdminExpenseFilters, "agency" | "currency" | "status"> & {
  agency: AdminExpenseAgency | "";
  currency: AdminExpenseCurrency | "";
  status: AdminExpenseStatus | "";
};

const initialFilters: FilterForm = { page: 1, pageSize: 50, agency: "", currency: "", status: "" };

export function AdminExpensesModule({ accessToken }: { accessToken: string }) {
  const [draft, setDraft] = useState<FilterForm>(() => filtersFromLocation());
  const [filters, setFilters] = useState<FilterForm>(() => filtersFromLocation());
  const [response, setResponse] = useState<AdminExpensesResponse | null>(null);
  const [agents, setAgents] = useState<ActiveExpenseAgent[]>([]);
  const [agentsError, setAgentsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    return loadAdminExpenses(accessToken, cleanFilters(filters), signal)
      .then(setResponse)
      .catch((cause: unknown) => {
        if (signal?.aborted) return;
        setError(cause instanceof AdminExpensesApiError ? cause.message : "Lecture des dépenses indisponible.");
      })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [accessToken, filters]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    setAgentsError("");
    void loadActiveExpenseAgents(accessToken, controller.signal)
      .then(setAgents)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setAgentsError(cause instanceof AdminExpensesApiError ? cause.message : "Lecture des Agents indisponible.");
        }
      });
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => updateLocation(filters), [filters]);

  const totals = useMemo(() => projectExpenseTotals(response), [response]);
  const availableAgents = useMemo(
    () => agents.filter((agent) => !draft.agency || agent.agency === draft.agency),
    [agents, draft.agency]
  );

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    setFilters({ ...draft, page: 1 });
  }

  function changePage(page: number) {
    setDraft((current) => ({ ...current, page }));
    setFilters((current) => ({ ...current, page }));
  }

  return <section className="mt-8 space-y-6">
    <GlassPanel className="p-5 sm:p-6">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-lg border border-accent/25 bg-accent/15 text-accent"><ClipboardList className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold">Consultation des dépenses</h2><p className="text-sm text-muted-foreground">Lecture sécurisée de DEPENSES PUBLIC, sans modification.</p></div></div>
      <form className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={applyFilters}>
        <Field label="Date de début"><input type="date" className={fieldClassName} value={draft.from ?? ""} onChange={(event) => setDraft({ ...draft, from: event.target.value || undefined })} /></Field>
        <Field label="Date de fin"><input type="date" className={fieldClassName} value={draft.to ?? ""} onChange={(event) => setDraft({ ...draft, to: event.target.value || undefined })} /></Field>
        <Field label="Agence"><select className={fieldClassName} value={draft.agency} onChange={(event) => { const agency = event.target.value as FilterForm["agency"]; const agentStillAvailable = !draft.agent || agents.some((agent) => agent.name === draft.agent && (!agency || agent.agency === agency)); setDraft({ ...draft, agency, agent: agentStillAvailable ? draft.agent : undefined }); }}><option className="bg-ebe-navy" value="">Toutes</option>{agencies.map((agency) => <option className="bg-ebe-navy" key={agency}>{agency}</option>)}</select></Field>
        <Field label="Catégorie"><select className={fieldClassName} value={draft.category ?? ""} onChange={(event) => setDraft({ ...draft, category: event.target.value || undefined })}><option className="bg-ebe-navy" value="">Toutes les catégories</option>{EXPENSE_CATEGORIES.map((category) => <option className="bg-ebe-navy" key={category} value={category}>{category}</option>)}</select></Field>
        <Field label="Devise"><select className={fieldClassName} value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as FilterForm["currency"] })}><option className="bg-ebe-navy" value="">Toutes</option>{currencies.map((currency) => <option className="bg-ebe-navy" key={currency}>{currency}</option>)}</select></Field>
        <Field label="Agent"><select className={fieldClassName} value={availableAgents.some((agent) => agent.name === draft.agent) ? draft.agent : ""} onChange={(event) => setDraft({ ...draft, agent: event.target.value || undefined })}><option className="bg-ebe-navy" value="">Tous les Agents</option>{availableAgents.map((agent) => <option className="bg-ebe-navy" key={agent.id} value={agent.name}>{agent.name} · {agent.agency}</option>)}</select>{agentsError ? <span className="mt-1 block text-xs text-red-200">{agentsError}</span> : null}</Field>
        <Field label="Statut"><select className={fieldClassName} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as FilterForm["status"] })}><option className="bg-ebe-navy" value="">Tous</option>{statuses.map((status) => <option className="bg-ebe-navy" key={status} value={status}>{statusLabel(status)}</option>)}</select></Field>
        <Field label="Référence"><input className={fieldClassName} value={draft.reference ?? ""} onChange={(event) => setDraft({ ...draft, reference: event.target.value || undefined })} placeholder="Référence disponible" /></Field>
        <div className="md:col-span-2 xl:col-span-4 flex flex-wrap gap-3"><Button variant="growth" type="submit">Appliquer les filtres</Button><Button variant="outline" type="button" onClick={() => { setDraft(initialFilters); setFilters(initialFilters); }}>Réinitialiser</Button></div>
      </form>
    </GlassPanel>

    {response ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><TotalCard label="Nombre de dépenses" value={String(response.totaux.nombreDepenses)} />{currencies.map((currency) => <CurrencyTotalCard key={currency} currency={currency} general={totals[currency].general} withoutTfBenin={totals[currency].withoutTfBenin} />)}</div> : null}

    <GlassPanel className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><h2 className="text-xl font-semibold">Dépenses enregistrées</h2><p className="mt-1 text-sm text-muted-foreground">{response ? `${response.pagination.total} résultat(s)` : "Lecture en cours"}</p></div>{loading ? <span className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin text-accent" />Chargement…</span> : null}</div>
      {error ? <State icon={CircleAlert} title="Lecture impossible" description={error}><Button variant="growth" type="button" onClick={() => void load()}>Réessayer</Button></State> : loading && !response ? <State icon={LoaderCircle} title="Chargement sécurisé" description="Lecture des dépenses en cours…" /> : !response?.depenses.length ? <State icon={SearchX} title="Aucune dépense" description="Aucune dépense ne correspond aux filtres sélectionnés." /> : <ExpensesTable expenses={response.depenses} />}
      {response && !error ? <div className="flex flex-col gap-3 border-t border-white/10 p-5 text-sm sm:flex-row sm:items-center sm:justify-between"><p>Page {response.pagination.page} sur {Math.max(response.pagination.totalPages, 1)} · {response.pagination.pageSize} éléments maximum par page</p><div className="flex gap-2"><Button variant="growth" size="sm" disabled={loading || response.pagination.page <= 1} onClick={() => changePage(response.pagination.page - 1)}>Précédente</Button><Button variant="growth" size="sm" disabled={loading || response.pagination.page >= response.pagination.totalPages} onClick={() => changePage(response.pagination.page + 1)}>Suivante</Button></div></div> : null}
    </GlassPanel>
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-medium">{label}{children}</label>; }
function TotalCard({ label, value }: { label: string; value: string }) { return <GlassPanel className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></GlassPanel>; }
function CurrencyTotalCard({ currency, general, withoutTfBenin }: { currency: AdminExpenseCurrency; general: number; withoutTfBenin: number }) { return <GlassPanel className="p-5"><p className="text-sm font-semibold text-accent">{currency}</p><div className="mt-3 grid gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Total général</p><p className="mt-1 text-xl font-semibold">{formatAmount(general, currency)}</p></div><div className="border-t border-white/10 pt-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Total hors TF Bénin</p><p className="mt-1 text-lg font-semibold text-white">{formatAmount(withoutTfBenin, currency)}</p></div></div></GlassPanel>; }
function State({ icon: Icon, title, description, children }: { icon: typeof CircleAlert; title: string; description: string; children?: React.ReactNode }) { return <div className="grid min-h-64 place-items-center p-8 text-center"><div><Icon className="mx-auto h-8 w-8 text-accent" /><h3 className="mt-3 font-semibold">{title}</h3><p role={title === "Lecture impossible" ? "alert" : undefined} className="mt-2 text-sm text-muted-foreground">{description}</p>{children ? <div className="mt-5">{children}</div> : null}</div></div>; }

function ExpensesTable({ expenses }: { expenses: AdminExpense[] }) { return <div className="overflow-x-auto"><table className="w-full min-w-[1320px] text-left text-sm"><thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Date", "Agence", "Catégorie", "Montant", "Description / motif", "Agent", "Statut", "Référence", "Indicateur"].map((heading) => <th className="whitespace-nowrap px-4 py-3" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{expenses.map((expense) => <tr className="align-top hover:bg-white/[0.03]" key={expense.id}><Cell>{formatDate(expense.dateHeure)}</Cell><Cell strong>{expense.agence}</Cell><Cell>{expense.categorie || "—"}</Cell><Cell strong>{formatAmount(expense.montant, expense.devise)}</Cell><Cell>{expense.description || expense.observation || "—"}</Cell><Cell>{expense.agent || "—"}</Cell><Cell><Badge variant={expense.annulee ? "muted" : "growth"} className={expense.annulee ? "border-red-300/30 bg-red-300/10 text-red-100" : undefined}>{statusLabel(expense.statut)}</Badge></Cell><Cell>{expense.reference || "—"}</Cell><Cell>{expense.annulee ? "Annulée" : expense.corrigee ? "Corrigée" : "—"}</Cell></tr>)}</tbody></table></div>; }
function Cell({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) { return <td className={`max-w-72 px-4 py-4 ${strong ? "font-semibold text-white" : "text-muted-foreground"}`}><span className="line-clamp-3">{children}</span></td>; }
function formatAmount(amount: number, currency: AdminExpenseCurrency) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount) + ` ${currency}`; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Porto-Novo" }).format(date); }
function statusLabel(status: AdminExpenseStatus) { return ({ ACTIVE: "Active", CORRECTION_DEMANDEE: "Correction demandée", CORRIGEE: "Corrigée", ANNULEE: "Annulée" })[status]; }

function cleanFilters(filters: FilterForm): AdminExpenseFilters { return { ...filters, agency: filters.agency || undefined, currency: filters.currency || undefined, status: filters.status || undefined }; }
function filtersFromLocation(): FilterForm { if (typeof window === "undefined") return initialFilters; const query = new URLSearchParams(window.location.search); const page = positive(query.get("page"), 1); return { from: text(query.get("from")), to: text(query.get("to")), agency: enumValue(query.get("agency"), agencies), category: text(query.get("category")), currency: enumValue(query.get("currency"), currencies), agent: text(query.get("agent")), status: enumValue(query.get("status"), statuses), reference: text(query.get("reference")), page, pageSize: 50 }; }
function updateLocation(filters: FilterForm) { if (typeof window === "undefined") return; const query = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "" && !(key === "page" && value === 1) && key !== "pageSize") query.set(key, String(value)); const next = `${window.location.pathname}${query.size ? `?${query}` : ""}`; window.history.replaceState(window.history.state, "", next); }
function text(value: string | null) { return value?.trim() || undefined; }
function positive(value: string | null, fallback: number) { return value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : fallback; }
function enumValue<T extends string>(value: string | null, values: readonly T[]): T | "" { return value && values.includes(value as T) ? value as T : ""; }
