import type { AdminPeriodPreset } from "@/features/admin/types";

export type AdminDateRange = {
  startDate: string;
  endDate: string;
};

const BUSINESS_TIME_ZONE = "Africa/Porto-Novo";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getAdminPeriodRange(
  preset: Exclude<AdminPeriodPreset, "CUSTOM">,
  now = new Date()
): AdminDateRange {
  const today = getBusinessDateKey(now);

  switch (preset) {
    case "YESTERDAY": {
      const yesterday = addDays(today, -1);
      return { startDate: yesterday, endDate: yesterday };
    }
    case "THIS_WEEK": {
      const dayOfWeek = getIsoDayOfWeek(today);
      return {
        startDate: addDays(today, -(dayOfWeek - 1)),
        endDate: today
      };
    }
    case "THIS_MONTH":
      return {
        startDate: `${today.slice(0, 7)}-01`,
        endDate: today
      };
    case "TODAY":
    default:
      return { startDate: today, endDate: today };
  }
}

export function isValidAdminDateRange(range: AdminDateRange) {
  return (
    isValidDateKey(range.startDate) &&
    isValidDateKey(range.endDate) &&
    range.startDate <= range.endDate
  );
}

export function isValidDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getBusinessDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function getIsoDayOfWeek(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return dayOfWeek === 0 ? 7 : dayOfWeek;
}
