const PAYMENT_SHEET_TIME_ZONE = "Africa/Porto-Novo";
const MS_PER_DAY = 86_400_000;

export function parsePaymentSheetDate(value: unknown): { dateTime: string; dateKey: string } | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    // Sheets SERIAL_NUMBER represents the spreadsheet's local wall time, not UTC.
    const wallTimeMs = Math.round((value - 25569) * MS_PER_DAY);
    return localWallTime(wallTimeMs);
  }

  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  const frenchDate = normalized.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (frenchDate) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = frenchDate;
    const wallTimeMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    const wallTime = new Date(wallTimeMs);
    if (wallTime.getUTCFullYear() !== Number(year) || wallTime.getUTCMonth() !== Number(month) - 1 || wallTime.getUTCDate() !== Number(day)) return null;
    return localWallTime(wallTimeMs);
  }

  const localIso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  if (localIso) {
    const [, year, month, day, hour = "0", minute = "0", second = "0", fraction = "0"] = localIso;
    const wallTimeMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(fraction.padEnd(3, "0")));
    const wallTime = new Date(wallTimeMs);
    if (!Number.isFinite(wallTimeMs) || wallTime.toISOString().slice(0, 10) !== `${year}-${month}-${day}` || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
    return localWallTime(wallTimeMs);
  }

  // Explicitly zoned ISO values already denote a canonical instant.
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return { dateTime: date.toISOString(), dateKey: date.toISOString().slice(0, 10) };
}

function localWallTime(wallTimeMs: number): { dateTime: string; dateKey: string } | null {
  const wallTime = new Date(wallTimeMs);
  if (Number.isNaN(wallTime.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PAYMENT_SHEET_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(wallTime);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const offsetMs = Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day), Number(fields.hour), Number(fields.minute), Number(fields.second))
    - Math.floor(wallTimeMs / 1000) * 1000;
  return {
    dateTime: new Date(wallTimeMs - offsetMs).toISOString(),
    // Keep the sheet's business date even when its UTC instant is the previous day.
    dateKey: wallTime.toISOString().slice(0, 10)
  };
}
