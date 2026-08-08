export const REPORT_PERIODS = ["TODAY", "YESTERDAY", "THIS_WEEK", "LAST_WEEK", "CUSTOM"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export function resolveReportPeriod(input: {
  preset: ReportPeriod;
  today: string;
  from?: string;
  to?: string;
}) {
  if (!isDate(input.today)) throw new Error("INVALID_REPORT_PERIOD");
  if (input.preset === "CUSTOM") {
    if (!input.from || !input.to || !isDate(input.from) || !isDate(input.to) || input.from > input.to) {
      throw new Error("INVALID_REPORT_PERIOD");
    }
    if (daysBetween(input.from, input.to) > 366) throw new Error("REPORT_PERIOD_TOO_LONG");
    return Object.freeze({ from: input.from, to: input.to, preset: input.preset });
  }
  const today = new Date(`${input.today}T12:00:00.000Z`);
  if (input.preset === "TODAY") return range(input.today, input.today, input.preset);
  if (input.preset === "YESTERDAY") {
    const value = shift(today, -1);
    return range(value, value, input.preset);
  }
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const monday = shift(today, -mondayOffset + (input.preset === "LAST_WEEK" ? -7 : 0));
  return range(monday, shift(new Date(`${monday}T12:00:00.000Z`), 6), input.preset);
}

export function enumerateReportDates(from: string, to: string) {
  if (!isDate(from) || !isDate(to) || from > to || daysBetween(from, to) > 366) {
    throw new Error("INVALID_REPORT_PERIOD");
  }
  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = shift(new Date(`${cursor}T12:00:00.000Z`), 1)) dates.push(cursor);
  return Object.freeze(dates);
}

function range(from: string, to: string, preset: ReportPeriod) { return Object.freeze({ from, to, preset }); }
function shift(date: Date, days: number) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); }
function daysBetween(from: string, to: string) { return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000); }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00.000Z`).toISOString().slice(0, 10) === value; }
