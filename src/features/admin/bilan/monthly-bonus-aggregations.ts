export type BonusAgency = "COO" | "FIH" | "LSHI" | "KLZ";
export type MonthlyBonusDecisionStatus = "A_DEFINIR" | "CERTIFIEE" | "PAYEE";

export type MonthlyAgentBonus = Readonly<{
  id: string;
  monthOrigin: string;
  agentId: string;
  agentName: string;
  agency: BonusAgency;
  amountUsd: number | null;
  status: MonthlyBonusDecisionStatus;
  decidedAt: string | null;
  decidedBy: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type MonthlyBonusSummary = Readonly<{
  monthOrigin: string;
  status: "A_DEFINIR" | "PARTIELLEMENT_CERTIFIE" | "CERTIFIE";
  byAgency: Readonly<Record<BonusAgency, number>>;
  totalUsd: number;
  rows: readonly MonthlyAgentBonus[];
}>;

export function aggregateMonthlyAgentBonuses(monthOrigin: string, rows: readonly MonthlyAgentBonus[]): MonthlyBonusSummary {
  const relevant = rows.filter((row) => row.monthOrigin === monthOrigin);
  const byAgency: Record<BonusAgency, number> = { COO: 0, FIH: 0, LSHI: 0, KLZ: 0 };
  for (const row of relevant) {
    if (row.status === "A_DEFINIR" || row.amountUsd === null) continue;
    byAgency[row.agency] = money(byAgency[row.agency] + row.amountUsd);
  }
  const status = relevant.length === 0
    ? "A_DEFINIR" as const
    : relevant.some((row) => row.status === "A_DEFINIR" || row.amountUsd === null)
      ? "PARTIELLEMENT_CERTIFIE" as const
      : "CERTIFIE" as const;
  return Object.freeze({
    monthOrigin,
    status,
    byAgency: Object.freeze(byAgency),
    totalUsd: money(Object.values(byAgency).reduce((sum, amount) => sum + amount, 0)),
    rows: Object.freeze([...relevant])
  });
}

export function applyMonthlyBonuses(
  before: Readonly<{ byAgency: Readonly<Record<"FIH" | "LSHI" | "KLZ", { amountUsd: number }>>; centralCoo: { totalCostsUsd: number }; consolidated: { amountUsd: number } }>,
  bonuses: MonthlyBonusSummary
) {
  const byAgency = Object.freeze(Object.fromEntries((["FIH", "LSHI", "KLZ"] as const).map((agency) => [agency, Object.freeze({
    beforeBonusUsd: before.byAgency[agency].amountUsd,
    bonusUsd: bonuses.byAgency[agency],
    afterBonusUsd: money(before.byAgency[agency].amountUsd - bonuses.byAgency[agency])
  })])) as Record<"FIH" | "LSHI" | "KLZ", { beforeBonusUsd: number; bonusUsd: number; afterBonusUsd: number }>);
  const afterBonusUsd = money(before.consolidated.amountUsd - bonuses.totalUsd);
  return Object.freeze({
    status: bonuses.status === "CERTIFIE" ? "CERTIFIE" as const : "PROVISOIRE" as const,
    byAgency,
    centralCooBonusUsd: bonuses.byAgency.COO,
    beforeBonusUsd: before.consolidated.amountUsd,
    totalBonusUsd: bonuses.totalUsd,
    afterBonusUsd,
    reconciliationDifferenceUsd: money(afterBonusUsd - (Object.values(byAgency).reduce((sum, item) => sum + item.afterBonusUsd, 0) - before.centralCoo.totalCostsUsd - bonuses.byAgency.COO))
  });
}

function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
