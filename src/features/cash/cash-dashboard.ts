export const CASH_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;
export type CashAgency = (typeof CASH_AGENCIES)[number];

export type CashAgentBreakdown = Readonly<{
  actorUserId: string;
  actorName: string;
  paymentCount: number;
  amountCollected: number;
}>;

export type CashHistoryEntry = Readonly<{
  businessDate: string;
  openingBalance: number;
  paymentsTotal: number;
  expensesTotal: number;
  correctionsNet: number;
  closingBalance: number;
  status: "CLOSED" | "REOPENED";
  version: number;
  closedAt: string;
  reopenedAt: string | null;
}>;

export type CashDashboard = Readonly<{
  agency: CashAgency;
  businessDate: string;
  currency: "USD";
  accountStatus: "ACTIVE" | "SUSPENDED" | "CLOSED";
  openingBalance: number;
  initialBalance: number | null;
  paymentCount: number;
  paymentsTotal: number;
  expensesTotal: number;
  correctionsNet: number;
  currentBalance: number;
  byAgent: readonly CashAgentBreakdown[];
  history: readonly CashHistoryEntry[];
  closures: readonly CashHistoryEntry[];
  anomalies: readonly Readonly<{ businessDate: string; type: string }>[];
}>;

export type CooOutsideCash = Readonly<{
  businessDate: string;
  paymentCount: number;
  paymentsTotal: number;
  expensesTotal: number;
  byAgent: readonly CashAgentBreakdown[];
}>;

export type AdminCashDashboard = Readonly<{
  businessDate: string;
  agencies: readonly CashDashboard[];
  cooOutsideCash: CooOutsideCash;
  audit: readonly Readonly<{
    auditId: string;
    agency: CashAgency;
    action: string;
    reason: string;
    adminName: string;
    occurredAt: string;
  }>[];
  actions: Readonly<{
    openingBalance: "AVAILABLE";
    adjustment: "UNAVAILABLE";
    correction: "UNAVAILABLE";
    closeDay: "UNAVAILABLE";
    reopenDay: "UNAVAILABLE";
  }>;
}>;

export function getPortoNovoBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Porto-Novo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
export function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
