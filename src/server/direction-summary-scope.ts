export type DirectionCohort = Readonly<{ prefix: string; label: string; year: number; month: number }>;

export function resolveDirectionScope<T extends DirectionCohort>(businessDate: string, cohorts: readonly T[]) {
  const year = Number(businessDate.slice(0, 4));
  const month = Number(businessDate.slice(5, 7));
  const cohort = cohorts.find((item) => item.year === year && item.month === month) ?? null;
  return Object.freeze({
    businessDate,
    cohort,
    analysisPeriod: Object.freeze({
      from: `${year}-${String(month).padStart(2, "0")}-01`,
      to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    })
  });
}
