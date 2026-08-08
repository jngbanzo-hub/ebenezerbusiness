import type { AdminPayment } from "@/features/admin/types";
import {
  calculateAdminPaymentsSummary,
  summarizeAdminPaymentsByAgent
} from "@/features/admin/payments";
import type { AdminExpenseListResponse } from "@/server/agent-expenses-apps-script";

export const REPORT_AGENCIES = ["COO", "FIH", "LSHI", "KLZ"] as const;
export type ReportAgency = (typeof REPORT_AGENCIES)[number];
export type StorageReportEvent = Record<string, unknown>;

export type DailyAgencyReport = Readonly<{
  agency: ReportAgency;
  paymentCount: number;
  paymentsTotal: number;
  paymentModes: readonly Readonly<{ name: string; count: number; amount: number }>[];
  byAgent: readonly Readonly<{ name: string; count: number; amount: number }>[];
  expenses: readonly Readonly<{ id: string; category: string; amount: number; currency: string; description: string; agent: string; reference: string }>[];
  expenseCount: number;
  expensesByCurrency: Readonly<Record<string, number>>;
  arrivals: readonly Readonly<{ code: string; weightKg: number; actor: string; occurredAt: string }>[];
  arrivalCount: number;
  arrivalWeightKg: number;
  departures: readonly Readonly<{ code: string; weightKg: number; actor: string; occurredAt: string }>[];
  departureCount: number;
  departureWeightKg: number;
  activeAgents: number;
  cash: null | Readonly<{ status: string; openingBalance: number; paymentsTotal: number; expensesTotal: number; correctionsNet: number; currentBalance: number }>;
  adjustments: readonly Readonly<{ eventId: string; amount: number; direction: "CREDIT" | "DEBIT"; reason: string; admin: string; occurredAt: string }>[];
  notes: readonly Readonly<{ auditId: string; content: string; admin: string; occurredAt: string; visibleToAgents: boolean }>[];
}>;

const ARRIVALS = new Set(["MANUAL_ARRIVAL_RECORDED", "ARRIVAGE_ACHEMINEMENT"]);
const DEPARTURES = new Set(["CONFIRMED_DELIVERY_RECORDED", "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION", "SORTIE_APRES_REMISE_COLIS_PAYE_COO", "SORTIE_APRES_REMISE_ACHEMINEMENT"]);

export function buildDailyAgencyReport(input: { agency: ReportAgency; payments: AdminPayment[]; expenses: AdminExpenseListResponse["depenses"]; storageEvents: StorageReportEvent[]; cash: DailyAgencyReport["cash"]; adjustments?: DailyAgencyReport["adjustments"]; notes?: DailyAgencyReport["notes"] }): DailyAgencyReport {
  const payments = input.payments.filter((row) => row.agenceEncaissement === input.agency);
  const expenses = input.expenses.filter((row) => row.agence === input.agency && !row.annulee);
  const events = input.storageEvents.filter((row) => row.agency === input.agency);
  const agents = summarizeAdminPaymentsByAgent(payments).map(
    ({ name, count, amount }) => ({ name, count, amount })
  );
  const modes = aggregate(payments, (row) => row.modePaiement || "Non renseigné");
  const paymentSummary = calculateAdminPaymentsSummary(payments).sites[input.agency];
  const arrivals = events.filter((row) => ARRIVALS.has(String(row.event_type))).flatMap(arrivalDetails);
  const departures = events.filter((row) => DEPARTURES.has(String(row.event_type))).map((row) => ({ code: String(row.tracking_code ?? "—"), weightKg: Math.abs(Number(row.weight_kg_delta ?? 0)), actor: String(row.actor_name ?? "—"), occurredAt: String(row.occurred_at ?? "") }));
  const expensesByCurrency: Record<string, number> = {};
  for (const row of expenses) expensesByCurrency[row.devise] = cents((expensesByCurrency[row.devise] ?? 0) + row.montant);
  const operationAgents = new Set([...agents.map((row) => row.name), ...arrivals.map((row) => row.actor), ...departures.map((row) => row.actor)].filter((name) => name && name !== "—"));
  return Object.freeze({
    agency: input.agency,
    paymentCount: paymentSummary.nombrePaiements,
    paymentsTotal: paymentSummary.montantTotal,
    paymentModes: Object.freeze(modes),
    byAgent: Object.freeze(agents),
    expenses: Object.freeze(expenses.map((row) => Object.freeze({ id: row.id, category: row.categorie, amount: row.montant, currency: row.devise, description: row.description || row.observation, agent: row.agent, reference: row.reference }))),
    expenseCount: expenses.length,
    expensesByCurrency: Object.freeze(expensesByCurrency),
    arrivals: Object.freeze(arrivals), arrivalCount: arrivals.length, arrivalWeightKg: cents(arrivals.reduce((sum, row) => sum + row.weightKg, 0)),
    departures: Object.freeze(departures), departureCount: departures.length, departureWeightKg: cents(departures.reduce((sum, row) => sum + row.weightKg, 0)),
    activeAgents: operationAgents.size,
    cash: input.cash,
    adjustments: Object.freeze(input.adjustments ?? []),
    notes: Object.freeze(input.notes ?? [])
  });
}

function aggregate(payments: AdminPayment[], keyFor: (row: AdminPayment) => string) {
  const values = new Map<string, { name: string; count: number; amount: number }>();
  for (const payment of payments) { const name = keyFor(payment); const row = values.get(name) ?? { name, count: 0, amount: 0 }; row.count += 1; row.amount = cents(row.amount + payment.montantPaye); values.set(name, row); }
  return Array.from(values.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function arrivalDetails(row: StorageReportEvent) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  const parcels = Array.isArray(metadata.parcels) ? metadata.parcels : [];
  if (parcels.length) return parcels.map((value) => { const parcel = value as Record<string, unknown>; return Object.freeze({ code: String(parcel.trackingCode ?? "—"), weightKg: Number(parcel.weightKg ?? 0), actor: String(row.actor_name ?? "—"), occurredAt: String(row.occurred_at ?? "") }); });
  return [Object.freeze({ code: String(row.tracking_code ?? "—"), weightKg: Math.abs(Number(row.weight_kg_delta ?? 0)), actor: String(row.actor_name ?? "—"), occurredAt: String(row.occurred_at ?? "") })];
}
function cents(value: number) { return Math.round(value * 100) / 100; }
