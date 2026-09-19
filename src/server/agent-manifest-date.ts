export function normalizeManifestDateFilter(value: unknown): string {
  const raw = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return "";
  return isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) ? raw : "";
}

export function normalizeManifestRowDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/.exec(raw);
  if (iso && isCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const french = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/.exec(raw);
  if (!french || !isCalendarDate(Number(french[3]), Number(french[2]), Number(french[1]))) return "";
  return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`;
}

export function isManifestDateWithinRange(date: string, from: string, to: string): boolean {
  if ((from || to) && !date) return false;
  return (!from || date >= from) && (!to || date <= to);
}

export function matchesManifestFilters(
  row: { trackingCode: string; status: string; date: string },
  filters: { code: string; status: string; from: string; to: string }
): boolean {
  return (!filters.code || row.trackingCode.includes(filters.code)) &&
    (!filters.status || row.status === filters.status) &&
    isManifestDateWithinRange(row.date, filters.from, filters.to);
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}
