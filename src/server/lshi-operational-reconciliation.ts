import "server-only";

import { createClient } from "@supabase/supabase-js";

import { readAdminPaymentNextRow, readAdminPaymentWindow } from "@/server/admin-payments-sheets";
import { readAdminExpenses } from "@/server/agent-expenses-apps-script";
import {
  evaluatePaymentTelemetry,
  reconcileOperations,
  type CashClosure,
  type OperationalAnomaly,
  type PaymentPerformanceEvent,
  type ReconciliationCash,
  type ReconciliationExpense,
  type ReconciliationOrchestration,
  type ReconciliationPayment,
  type ReconciliationStorage
} from "@/server/operational-reconciliation";

export type LshiReconciliationKind = "INCREMENTAL" | "DAILY" | "DAILY_RETRY";

const LSHI_RECONCILIATION_ACTOR = Object.freeze({
  userId: "9f24783e-626a-4ec0-a7e3-38ad8f3480f8",
  email: "LSHI_RECONCILIATION_READER",
  agency: "LSHI" as const
});
const INCREMENTAL_LOOKBACK_MS = 2 * 60 * 60 * 1000;
const SHEET_TAIL_OVERLAP = 200;
const SHEET_WINDOW_LIMIT = 500;
const DATABASE_ROW_LIMIT = 500;

type Source<T> = { available: true; rows: T[]; paginationIncomplete?: boolean } | { available: false; rows: T[]; code: string };

export async function runLshiOperationalReconciliation(
  kind: LshiReconciliationKind,
  now = new Date()
) {
  const client = serviceClient();
  const runId = crypto.randomUUID();
  const businessDate = previousBusinessDatePortoNovo(now);
  const slotKey = slot(kind, now, businessDate);
  const { data: claim, error: claimError } = await client.rpc("claim_lshi_reconciliation_run", {
    p_business_date: kind === "INCREMENTAL" ? null : businessDate,
    p_lease_seconds: 480,
    p_run_id: runId,
    p_run_kind: kind,
    p_slot_key: slotKey
  });
  if (claimError) throw new Error("LSHI_RECONCILIATION_CLAIM_FAILED");
  const claimRecord = record(claim);
  if (claimRecord.acquired !== true) return { status: "SKIPPED" as const, reason: text(claimRecord.reason) ?? "NOT_ACQUIRED" };
  if (kind === "DAILY_RETRY" && claimRecord.lastDailyBusinessDate === businessDate) {
    await complete(client, runId, number(claimRecord.cursorStart, 2), [], [], { skipped: 1 }, { cashClosure: "AVAILABLE" });
    return { status: "SKIPPED" as const, reason: "CLOSURE_ALREADY_AVAILABLE" };
  }

  const persistedCursorStart = number(claimRecord.cursorStart, 2);
  try {
    const cursorStart = kind === "INCREMENTAL" && persistedCursorStart === 2
      ? await readAdminPaymentNextRow("LSHI")
      : persistedCursorStart;
    const result = await inspect(client, { businessDate, cursorStart, kind, now });
    await complete(client, runId, result.cursorEnd, result.anomalies, result.information, result.metrics, result.sources);
    return { status: "COMPLETED" as const, runId, ...result };
  } catch (cause) {
    await client.rpc("fail_lshi_reconciliation_run", {
      p_failure_code: cause instanceof Error ? cause.message : "UNKNOWN",
      p_run_id: runId
    });
    throw cause;
  }
}

export async function readLatestLshiReconciliationReport() {
  const { data, error } = await serviceClient()
    .from("lshi_reconciliation_runs")
    .select("run_id,finished_at,anomalies,information,metrics,sources")
    .eq("status", "COMPLETED")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("LSHI_RECONCILIATION_REPORT_UNAVAILABLE");
  const row = record(data);
  if (!text(row.run_id)) throw new Error("LSHI_RECONCILIATION_REPORT_EMPTY");
  return {
    generatedAt: text(row.finished_at),
    anomalies: Array.isArray(row.anomalies) ? row.anomalies as OperationalAnomaly[] : [],
    information: Array.isArray(row.information) ? row.information as OperationalAnomaly[] : [],
    metrics: record(row.metrics),
    sources: record(row.sources)
  };
}

async function inspect(client: ReturnType<typeof serviceClient>, input: { businessDate: string; cursorStart: number; kind: LshiReconciliationKind; now: Date }) {
  const since = input.kind === "INCREMENTAL"
    ? new Date(input.now.getTime() - INCREMENTAL_LOOKBACK_MS).toISOString()
    : `${input.businessDate}T00:00:00.000Z`;
  const sheetStart = Math.max(2, input.cursorStart - (input.kind === "INCREMENTAL" ? SHEET_TAIL_OVERLAP : SHEET_WINDOW_LIMIT));

  const [sheet, cash, storage, orchestrations, closures, expenseCash, expenses, telemetry, dailyStorage, storageAccount, previousDaily] = await Promise.all([
    safe("PAYMENTS", async () => {
      const window = await readAdminPaymentWindow("LSHI", sheetStart, SHEET_WINDOW_LIMIT);
      return { rows: window.payments.flatMap((row): ReconciliationPayment[] => row.paymentRequestId && row.agenceEncaissement === "LSHI" && inWindow(row.dateTime, since, input.kind, input.businessDate) ? [{ requestId: row.paymentRequestId, trackingCode: row.codeColis, agency: "LSHI", amountUsd: row.montantPaye, weightKg: row.poidsKg, occurredAt: row.dateTime }] : []), cursorEnd: window.nextRow, paginationIncomplete: window.limitReached };
    }),
    safe("CASH", () => dbRows(client.from("cash_events").select("event_id,source_request_id,agency,amount,occurred_at,metadata").eq("agency", "LSHI").eq("source_type", "PAYMENT_ENGINE").gte("occurred_at", since).order("occurred_at", { ascending: true }).limit(DATABASE_ROW_LIMIT), decodeCash)),
    safe("STORAGE", () => dbRows(client.from("stockage_events").select("event_id,request_id,agency,tracking_code,weight_kg_delta,occurred_at,metadata,source_type,source_request_id").eq("agency", "LSHI").in("event_type", ["SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", "SORTIE_APRES_REMISE_ACHEMINEMENT"]).gte("occurred_at", since).order("occurred_at", { ascending: true }).limit(DATABASE_ROW_LIMIT), decodeStorage)),
    safe("ORCHESTRATIONS", () => dbRows(client.from("stockage_payment_orchestrations").select("request_id,tracking_code,agency,state,payment_created,cash_event_id,stockage_event_id,last_error,attempt_count,created_at,updated_at,completed_at,parcel_id,forwarding_id").eq("agency", "LSHI").or(`updated_at.gte.${since},state.neq.COMPLETED`).order("updated_at", { ascending: true }).limit(DATABASE_ROW_LIMIT), decodeOrchestration)),
    safe("CLOSURES", () => dbRows(client.from("cash_daily_closures").select("closure_id,agency,business_date,opening_balance,closing_balance,payments_total,expenses_total,status,version,closed_at").eq("agency", "LSHI").gte("business_date", addDays(input.businessDate, -1)).lte("business_date", input.businessDate).order("business_date", { ascending: true }).limit(10), decodeClosure)),
    safe("EXPENSE_CASH", () => dbRows(client.from("cash_events").select("event_id,source_request_id,agency,amount,occurred_at,metadata").eq("agency", "LSHI").eq("source_type", "EXPENSE_ENGINE").gte("occurred_at", since).order("occurred_at", { ascending: true }).limit(DATABASE_ROW_LIMIT), decodeCash)),
    safe("EXPENSES", async () => {
      const response = await readAdminExpenses(LSHI_RECONCILIATION_ACTOR, { agence: "LSHI", dateDebut: since.slice(0, 10), dateFin: businessDateInPortoNovo(input.now), page: 1, pageSize: 100 });
      return { rows: response.depenses.flatMap((row): ReconciliationExpense[] => row.devise === "USD" && row.statut === "ACTIVE" ? [{ requestId: row.expenseRequestId, agency: "LSHI", amountUsd: row.montant, occurredAt: row.dateHeure }] : []), paginationIncomplete: response.pagination.totalPages > 1 };
    }),
    safe("TELEMETRY", () => dbRows(client.from("payment_performance_events").select("event_id,agency,total_ms,http_status,timeout,retry,attempt_count,created_at").eq("agency", "LSHI").gte("created_at", new Date(input.now.getTime() - 60 * 60 * 1000).toISOString()).order("created_at", { ascending: true }).limit(1000), decodeTelemetry)),
    input.kind === "INCREMENTAL" ? Promise.resolve({ available: true as const, rows: [] as Array<{ countDelta: number; weightDelta: number }> }) : safe("DAILY_STORAGE_EVENTS", () => dbRows(client.from("stockage_events").select("parcel_count_delta,weight_kg_delta,business_date").eq("agency", "LSHI").eq("business_date", input.businessDate).order("event_id", { ascending: true }).limit(DATABASE_ROW_LIMIT), (row) => ({ countDelta: Number(row.parcel_count_delta), weightDelta: Number(row.weight_kg_delta) }))),
    input.kind === "INCREMENTAL" ? Promise.resolve({ available: true as const, rows: [] as Array<{ parcelCount: number; weightKg: number }> }) : safe("STORAGE_ACCOUNT", () => dbRows(client.from("stockage_accounts").select("current_parcel_count,current_weight_kg").eq("agency", "LSHI").limit(1), (row) => ({ parcelCount: Number(row.current_parcel_count), weightKg: Number(row.current_weight_kg) }))),
    input.kind === "INCREMENTAL" ? Promise.resolve({ available: true as const, rows: [] as Array<{ metrics: Record<string, unknown> }> }) : safe("PREVIOUS_DAILY", () => dbRows(client.from("lshi_reconciliation_runs").select("metrics").eq("status", "COMPLETED").in("run_kind", ["DAILY", "DAILY_RETRY"]).lt("business_date", input.businessDate).order("business_date", { ascending: false }).limit(1), (row) => ({ metrics: record(row.metrics) })))
  ]);

  const sources = {
    payments: state(sheet), cash: state(cash), storage: state(storage), orchestrations: state(orchestrations),
    cashClosure: input.kind === "INCREMENTAL"
      ? state(closures)
      : closures.available && closures.rows.some((row) => row.businessDate === input.businessDate && row.status === "CLOSED") ? "AVAILABLE" : "UNAVAILABLE",
    expenses: state(expenses), expenseCash: state(expenseCash), telemetry: state(telemetry),
    dailyStorage: state(dailyStorage), storageAccount: state(storageAccount)
  };
  const reconciliation = reconcileOperations({
    payments: sheet.rows,
    cash: cash.rows,
    storage: storage.rows,
    orchestrations: orchestrations.rows,
    closures: closures.rows,
    expenses: expenses.rows,
    expenseCash: expenseCash.rows,
    now: input.now,
    requireOrchestrationForPayments: true,
    availability: { payments: sheet.available, cash: cash.available, storage: storage.available, orchestrations: orchestrations.available, closures: closures.available, expenses: expenses.available, expenseCash: expenseCash.available }
  });
  const sourceAnomalies = Object.entries(sources).flatMap(([name, status]) => status === "AVAILABLE" ? [] : [technicalAnomaly(input.now, `SOURCE_${name.toUpperCase()}_INDISPONIBLE`, "PAGINATION", `${name}: source bornée indisponible ou incomplète.`)]);
  if (sheet.available && sheet.paginationIncomplete) sourceAnomalies.push(technicalAnomaly(input.now, "PAGINATION_PAIEMENTS_BORNE_ATTEINTE", "PAGINATION", "La fenêtre de 500 lignes est pleine; le curseur poursuivra au prochain passage."));
  if (expenses.available && expenses.paginationIncomplete) sourceAnomalies.push(technicalAnomaly(input.now, "PAGINATION_DEPENSES_BORNE_ATTEINTE", "PAGINATION", "La page bornée Dépenses est incomplète; aucune conclusion à zéro."));
  const telemetryResult = evaluatePaymentTelemetry({ events: telemetry.rows, now: input.now });
  const telemetryAnomalies = telemetryResult.anomalies.map((row) => technicalAnomaly(input.now, row.type, "PERFORMANCE", `Seuil observé: ${row.value}.`, row.severity));
  const dailyAnomalies: OperationalAnomaly[] = [];
  const closure = closures.rows.find((row) => row.businessDate === input.businessDate && row.status === "CLOSED");
  if (input.kind !== "INCREMENTAL" && closure) {
    const expectedCredits = money(sheet.rows.reduce((sum, row) => sum + row.amountUsd, 0));
    const expectedDebits = money(expenses.rows.reduce((sum, row) => sum + row.amountUsd, 0));
    if (closure.paymentsTotal !== undefined && money(closure.paymentsTotal) !== expectedCredits) dailyAnomalies.push(technicalAnomaly(input.now, "ECART_CAISSE_PAIEMENTS", "CONTINUITE", `Clôture crédits ${closure.paymentsTotal}; paiements canoniques ${expectedCredits}.`));
    if (closure.expensesTotal !== undefined && money(closure.expensesTotal) !== expectedDebits) dailyAnomalies.push(technicalAnomaly(input.now, "ECART_CAISSE_DEPENSES", "CONTINUITE", `Clôture débits ${closure.expensesTotal}; dépenses sources ${expectedDebits}.`));
  }
  const account = storageAccount.rows[0];
  const previousSnapshot = record(previousDaily.rows[0]?.metrics.storageSnapshot);
  if (input.kind !== "INCREMENTAL" && account && typeof previousSnapshot.parcelCount === "number" && typeof previousSnapshot.weightKg === "number") {
    const expectedParcels = previousSnapshot.parcelCount + dailyStorage.rows.reduce((sum, row) => sum + row.countDelta, 0);
    const expectedWeight = money(previousSnapshot.weightKg + dailyStorage.rows.reduce((sum, row) => sum + row.weightDelta, 0));
    if (account.parcelCount !== expectedParcels || money(account.weightKg) !== expectedWeight) dailyAnomalies.push(technicalAnomaly(input.now, "ECART_STOCKAGE_JOURNAL", "CONTINUITE", `Stock attendu ${expectedParcels} colis/${expectedWeight} kg; observé ${account.parcelCount} colis/${money(account.weightKg)} kg.`));
  }
  const cursorEnd = sheet.available ? Math.max(input.cursorStart, number((sheet as { cursorEnd?: number }).cursorEnd, input.cursorStart)) : input.cursorStart;
  return {
    cursorEnd,
    anomalies: [...sourceAnomalies, ...telemetryAnomalies, ...dailyAnomalies, ...reconciliation.anomalies],
    information: reconciliation.information,
    metrics: { ...reconciliation.metrics, ...telemetryResult.metrics, sheetRows: sheet.rows.length, boundedDatabaseRows: cash.rows.length + storage.rows.length + orchestrations.rows.length + expenseCash.rows.length, storageSnapshot: account ? { parcelCount: account.parcelCount, weightKg: money(account.weightKg) } : null },
    sources
  };
}

async function complete(client: ReturnType<typeof serviceClient>, runId: string, cursorEnd: number, anomalies: readonly OperationalAnomaly[], information: readonly OperationalAnomaly[], metrics: Record<string, unknown>, sources: Record<string, unknown>) {
  const { error } = await client.rpc("complete_lshi_reconciliation_run", { p_anomalies: anomalies, p_cursor_end: cursorEnd, p_information: information, p_metrics: metrics, p_run_id: runId, p_sources: sources });
  if (error) throw new Error("LSHI_RECONCILIATION_COMPLETE_FAILED");
}

async function safe<T>(name: string, reader: () => Promise<{ rows: T[]; cursorEnd?: number; paginationIncomplete?: boolean }>): Promise<Source<T> & { cursorEnd?: number }> {
  try { return { available: true, ...(await reader()) }; }
  catch (cause) { console.error("[lshi-reconciliation-source]", JSON.stringify({ source: name, code: cause instanceof Error ? cause.message : "UNKNOWN" })); return { available: false, rows: [], code: `${name}_UNAVAILABLE` }; }
}

async function dbRows<T>(query: PromiseLike<{ data: unknown; error: { message?: string } | null }>, decode: (row: Record<string, unknown>) => T) {
  const response = await query;
  if (response.error || !Array.isArray(response.data)) throw new Error("BOUNDED_DATABASE_READ_FAILED");
  return { rows: response.data.map((row) => decode(row as Record<string, unknown>)), paginationIncomplete: response.data.length >= DATABASE_ROW_LIMIT };
}

function decodeCash(row: Record<string, unknown>): ReconciliationCash { const metadata = record(row.metadata); return { eventId: String(row.event_id), requestId: String(row.source_request_id).toLowerCase(), agency: "LSHI", amountUsd: Number(row.amount), occurredAt: String(row.occurred_at), parcelId: nullable(metadata.parcelId), forwardingId: nullable(metadata.forwardingId) }; }
function decodeStorage(row: Record<string, unknown>): ReconciliationStorage { const metadata = record(row.metadata); return { eventId: String(row.event_id), requestId: String(row.request_id).toLowerCase(), agency: "LSHI", trackingCode: nullable(row.tracking_code), weightKg: row.weight_kg_delta == null ? null : Math.abs(Number(row.weight_kg_delta)), occurredAt: String(row.occurred_at), parcelId: nullable(metadata.parcelId), forwardingId: nullable(metadata.forwardingId) ?? (row.source_type === "INTER_AGENCY_FORWARDING" ? nullable(row.source_request_id) : null) }; }
function decodeOrchestration(row: Record<string, unknown>): ReconciliationOrchestration { return { requestId: String(row.request_id).toLowerCase(), trackingCode: String(row.tracking_code), agency: "LSHI", state: String(row.state), paymentCreated: row.payment_created === true, cashEventId: nullable(row.cash_event_id), storageEventId: nullable(row.stockage_event_id), lastError: nullable(row.last_error), attemptCount: Number(row.attempt_count), createdAt: String(row.created_at), updatedAt: String(row.updated_at), completedAt: nullable(row.completed_at), parcelId: nullable(row.parcel_id), forwardingId: nullable(row.forwarding_id) }; }
function decodeClosure(row: Record<string, unknown>): CashClosure { return { closureId: String(row.closure_id), agency: "LSHI", businessDate: String(row.business_date), openingBalance: Number(row.opening_balance), closingBalance: Number(row.closing_balance), paymentsTotal: Number(row.payments_total), expensesTotal: Number(row.expenses_total), status: String(row.status), version: Number(row.version), occurredAt: String(row.closed_at) }; }
function decodeTelemetry(row: Record<string, unknown>): PaymentPerformanceEvent { return { eventId: String(row.event_id), agency: "LSHI", totalMs: Number(row.total_ms), httpStatus: Number(row.http_status), timeout: row.timeout === true, retry: row.retry === true, attemptCount: Number(row.attempt_count), occurredAt: String(row.created_at) }; }

function technicalAnomaly(now: Date, type: string, category: "PAGINATION" | "PERFORMANCE" | "CONTINUITE", cause: string, severity: "INFO" | "ATTENTION" | "CRITICAL" = "CRITICAL"): OperationalAnomaly { return { id: `lshi:${type}`, category, agency: "LSHI", trackingCode: null, paymentRequestId: null, type, occurredAt: now.toISOString(), ageMinutes: 0, interruptedStep: "LECTURE", severity, status: "A_VERIFIER", cause, recommendation: "Auditer uniquement; aucune réparation automatique.", amountUsd: null, weightKg: null, parcelId: null, forwardingId: null, originAgency: null, destinationAgency: null, nature: "INDETERMINE", dossierKey: `LSHI:${type}`, temporalClass: "NOUVELLE_APRES_PROTECTIONS" }; }
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(); if (!url || !key) throw new Error("SERVICE_NOT_CONFIGURED"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } }).schema("public"); }
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function nullable(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function number(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function state(value: Source<unknown>) { return value.available && !value.paginationIncomplete ? "AVAILABLE" : "UNAVAILABLE"; }
function inWindow(value: string, since: string, kind: LshiReconciliationKind, businessDate: string) { return kind === "INCREMENTAL" ? value >= since : value.slice(0, 10) === businessDate; }
function businessDateInPortoNovo(now: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Porto-Novo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
function previousBusinessDatePortoNovo(now: Date) { const today = businessDateInPortoNovo(now); return addDays(today, -1); }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function slot(kind: LshiReconciliationKind, now: Date, businessDate: string) { if (kind !== "INCREMENTAL") return `${kind}:${businessDate}`; const value = new Date(now); value.setUTCMinutes(Math.floor(value.getUTCMinutes() / 10) * 10, 0, 0); return `INCREMENTAL:${value.toISOString()}`; }
function money(value: number) { return Math.round(value * 100) / 100; }
