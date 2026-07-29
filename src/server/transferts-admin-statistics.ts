import "server-only";

import {
  TRANSFER_AGENCIES,
  TRANSFER_CIRCUITS,
  TRANSFER_CURRENCIES,
  TRANSFER_STATUSES,
  type AdminTransferFilters,
  type AdminTransferStatistics,
  type CurrencyTotals,
  type StatusCounts,
  type TransferAgency,
  type TransferCircuit,
  type TransferCircuitStatistics,
  type TransferCurrency,
  type TransferPeriodStatistics,
  type TransferStatus,
  type TransferSummary
} from "@/features/transferts/types";

export const TRANSFERTS_TIMEZONE = "Africa/Porto-Novo" as const;

export class AdminTransferFilterError extends Error {}

export function parseAdminTransferFilters(
  search: URLSearchParams
): AdminTransferFilters {
  const period = readEnum(
    search.get("period") || "THIS_MONTH",
    ["TODAY", "THIS_WEEK", "THIS_MONTH", "CUSTOM"] as const,
    "period"
  );
  const from = readDate(search.get("from"), "from");
  const to = readDate(search.get("to"), "to");
  if (period === "CUSTOM" && (!from || !to)) {
    throw new AdminTransferFilterError("INVALID_DATE_RANGE");
  }
  if (from && to && from > to) {
    throw new AdminTransferFilterError("INVALID_DATE_RANGE");
  }
  return {
    period,
    from,
    to,
    agencyFrom: readOptionalEnum(
      search.get("agencyFrom"),
      TRANSFER_AGENCIES,
      "agencyFrom"
    ),
    agencyTo: readOptionalEnum(
      search.get("agencyTo"),
      TRANSFER_AGENCIES,
      "agencyTo"
    ),
    circuit: readOptionalEnum(
      search.get("circuit"),
      TRANSFER_CIRCUITS,
      "circuit"
    ),
    status: readOptionalEnum(
      search.get("status"),
      TRANSFER_STATUSES,
      "status"
    ),
    currency: readOptionalEnum(
      search.get("currency"),
      TRANSFER_CURRENCIES,
      "currency"
    ),
    transferId: readTransferId(search.get("transferId"))
  };
}

export function calculateAdminTransferStatistics(
  transfers: readonly TransferSummary[],
  now = new Date()
): AdminTransferStatistics {
  const todayKey = localDateKey(now);
  const monthKey = todayKey.slice(0, 7);
  const today = emptyPeriodStatistics();
  const currentMonth = {
    ...emptyPeriodStatistics(),
    byAgencyFrom: emptyAgencyCounts(),
    byAgencyTo: emptyAgencyCounts(),
    byCircuit: emptyCircuitStatistics(),
    byCurrency: emptyCurrencyTotals()
  };
  let invalidDateCount = 0;

  for (const transfer of transfers) {
    const key = safeLocalDateKey(transfer.sentAt);
    if (!key) {
      invalidDateCount += 1;
      continue;
    }
    if (key === todayKey) addToPeriod(today, transfer);
    if (key.slice(0, 7) === monthKey) {
      addToPeriod(currentMonth, transfer);
      currentMonth.byAgencyFrom[transfer.agencyFrom] += 1;
      currentMonth.byAgencyTo[transfer.agencyTo] += 1;
      currentMonth.byCurrency[transfer.currency] += 1;
      const circuit = `${transfer.agencyFrom}>${transfer.agencyTo}` as TransferCircuit;
      if (TRANSFER_CIRCUITS.includes(circuit)) {
        addToCircuit(currentMonth.byCircuit[circuit], transfer);
      }
    }
  }

  return {
    timezone: TRANSFERTS_TIMEZONE,
    todayKey,
    monthKey,
    invalidDateCount,
    today,
    currentMonth
  };
}

export function filterAdminTransfers(
  transfers: readonly TransferSummary[],
  filters: AdminTransferFilters,
  now = new Date()
) {
  const bounds = resolveAdminPeriodBounds(filters, now);
  return transfers.filter((transfer) => {
    const dateKey = safeLocalDateKey(transfer.sentAt);
    if (!dateKey || dateKey < bounds.from || dateKey > bounds.to) return false;
    if (filters.agencyFrom && transfer.agencyFrom !== filters.agencyFrom) return false;
    if (filters.agencyTo && transfer.agencyTo !== filters.agencyTo) return false;
    if (
      filters.circuit &&
      `${transfer.agencyFrom}>${transfer.agencyTo}` !== filters.circuit
    ) return false;
    if (filters.status && transfer.status !== filters.status) return false;
    if (filters.currency && transfer.currency !== filters.currency) return false;
    if (
      filters.transferId &&
      transfer.transferId.toUpperCase() !== filters.transferId.toUpperCase()
    ) return false;
    return true;
  });
}

export function parseAdminTransfers(value: unknown): TransferSummary[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseTransfer).filter((item): item is TransferSummary => item !== null);
}

export function localDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("INVALID_DATE");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRANSFERTS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function safeLocalDateKey(value: string) {
  try {
    return localDateKey(value);
  } catch {
    return null;
  }
}

export function resolveAdminPeriodBounds(
  filters: AdminTransferFilters,
  now = new Date()
) {
  const today = localDateKey(now);
  if (filters.period === "TODAY") return { from: today, to: today };
  if (filters.period === "THIS_MONTH") {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (filters.period === "THIS_WEEK") {
    const calendar = new Date(`${today}T12:00:00Z`);
    const mondayOffset = (calendar.getUTCDay() + 6) % 7;
    calendar.setUTCDate(calendar.getUTCDate() - mondayOffset);
    return { from: calendar.toISOString().slice(0, 10), to: today };
  }
  return { from: filters.from, to: filters.to };
}

function addToPeriod(target: TransferPeriodStatistics, transfer: TransferSummary) {
  target.count += 1;
  target.amountsByCurrency[transfer.currency] += transfer.amount;
  target.statuses[transfer.status] += 1;
}

function addToCircuit(
  target: TransferCircuitStatistics,
  transfer: TransferSummary
) {
  target.count += 1;
  target.amountsByCurrency[transfer.currency] += transfer.amount;
  target.statuses[transfer.status] += 1;
}

function emptyPeriodStatistics(): TransferPeriodStatistics {
  return {
    count: 0,
    amountsByCurrency: emptyCurrencyTotals(),
    statuses: emptyStatusCounts()
  };
}

function emptyCurrencyTotals(): CurrencyTotals {
  return { USD: 0, CDF: 0, XOF: 0 };
}

function emptyStatusCounts(): StatusCounts {
  return {
    ENVOYE: 0,
    CODE_RECU: 0,
    FONDS_RETIRES: 0,
    CONFIRME: 0,
    A_VERIFIER: 0,
    ANNULE: 0
  };
}

function emptyAgencyCounts(): Record<TransferAgency, number> {
  return { COO: 0, FIH: 0, LSHI: 0, KLZ: 0 };
}

function emptyCircuitStatistics() {
  return Object.fromEntries(
    TRANSFER_CIRCUITS.map((circuit) => [
      circuit,
      {
        circuit,
        count: 0,
        amountsByCurrency: emptyCurrencyTotals(),
        statuses: emptyStatusCounts()
      }
    ])
  ) as Record<TransferCircuit, TransferCircuitStatistics>;
}

function parseTransfer(value: unknown): TransferSummary | null {
  if (!isRecord(value)) return null;
  const agencyFrom = enumValue(value.agencyFrom, TRANSFER_AGENCIES);
  const agencyTo = enumValue(value.agencyTo, TRANSFER_AGENCIES);
  const currency = enumValue(value.currency, TRANSFER_CURRENCIES);
  const status = enumValue(value.status, TRANSFER_STATUSES);
  if (
    !agencyFrom ||
    !agencyTo ||
    !currency ||
    !status ||
    typeof value.transferId !== "string" ||
    typeof value.sentAt !== "string" ||
    typeof value.amount !== "number" ||
    !Number.isFinite(value.amount)
  ) return null;
  return {
    transferId: value.transferId,
    sentAt: value.sentAt,
    agencyFrom,
    agentFrom: text(value.agentFrom),
    agencyTo,
    agentTo: text(value.agentTo),
    amount: value.amount,
    currency,
    fees: number(value.fees),
    netExpected: number(value.netExpected),
    service: text(value.service),
    maskedCode: text(value.maskedCode),
    senderName: text(value.senderName),
    beneficiaryName: text(value.beneficiaryName),
    status,
    codeReceivedBy: text(value.codeReceivedBy),
    codeReceivedAt: nullableText(value.codeReceivedAt),
    fundsWithdrawnBy: text(value.fundsWithdrawnBy),
    fundsWithdrawnAt: nullableText(value.fundsWithdrawnAt),
    confirmedBy: text(value.confirmedBy),
    confirmedAt: nullableText(value.confirmedAt),
    observation: text(value.observation),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
    cancelled: value.cancelled === true,
    cancelReason: text(value.cancelReason)
  };
}

function readDate(value: string | null, field: string) {
  if (!value) return "";
  if (!isStrictDate(value)) throw new AdminTransferFilterError(`INVALID_${field.toUpperCase()}`);
  return value;
}

function isStrictDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function readTransferId(value: string | null) {
  const normalized = (value ?? "").trim();
  if (normalized && !/^[A-Za-z0-9-]{1,100}$/.test(normalized)) {
    throw new AdminTransferFilterError("INVALID_TRANSFER_ID");
  }
  return normalized;
}

function readOptionalEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  field: string
): T | "" {
  return value ? readEnum(value.toUpperCase(), allowed, field) : "";
}

function readEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string
): T {
  if (!allowed.includes(value as T)) {
    throw new AdminTransferFilterError(`INVALID_${field.toUpperCase()}`);
  }
  return value as T;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]) {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : null;
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown) { return typeof value === "string" && value ? value : null; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
