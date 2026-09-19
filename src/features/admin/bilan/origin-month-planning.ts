import { monthPeriod, type OriginMonth } from "./cohort-catalog";

const MONTH_LABELS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// Calendar slots are presentation only, never new registry identities.
export function planOriginYear(year: number, months: readonly OriginMonth[]) {
  if (!Number.isInteger(year) || year < 2000 || year > 2199) throw new Error("INVALID_ORIGIN_YEAR");
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return {
      year, month, label: `${MONTH_LABELS[index]} ${year}`,
      period: monthPeriod(year, month),
      configured: months.find(row => row.year === year && row.month === month) ?? null,
    };
  });
}

export function originMonthDraft(slot: ReturnType<typeof planOriginYear>[number]) {
  return { prefix: "", year: String(slot.year), month: String(slot.month), label: slot.label };
}

export function draftMonthPeriod(year: string, month: string) {
  const y = Number(year), m = Number(month);
  return Number.isInteger(y) && y >= 2000 && y <= 2199 && Number.isInteger(m) && m >= 1 && m <= 12
    ? monthPeriod(y, m) : null;
}
