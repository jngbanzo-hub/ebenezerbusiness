import { TRANSFER_CIRCUITS, type TransferAgency, type TransferSummary } from "./types";

export type HistoryPeriod = "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "CUSTOM";
export type HistoryFilters = { period: HistoryPeriod; from: string; to: string; circuit: string; currency: string };

export function agencyCircuits(agency: TransferAgency, incomingOnly = false) {
  return TRANSFER_CIRCUITS.filter(circuit => {
    const [from, to] = circuit.split(">");
    return to === agency || (!incomingOnly && from === agency);
  });
}

export function dateKey(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Porto-Novo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

export function periodBounds(filters: HistoryFilters, now = new Date()) {
  const today = dateKey(now);
  if (filters.period === "TODAY") return { from: today, to: today };
  if (filters.period === "THIS_MONTH") return { from: today.slice(0, 7) + "-01", to: today };
  if (filters.period === "THIS_WEEK") {
    const monday = new Date(today + "T12:00:00Z");
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return { from: dateKey(monday), to: today };
  }
  return { from: filters.from, to: filters.to };
}

export function hasRecordedWithdrawalAndFinalization(row: TransferSummary) {
  const withdrawnAt = Date.parse(row.fundsWithdrawnAt || "");
  const confirmedAt = Date.parse(row.confirmedAt || "");
  return row.status === "CONFIRME" &&
    Boolean(row.fundsWithdrawnBy?.trim()) &&
    Boolean(row.confirmedBy?.trim()) &&
    Number.isFinite(withdrawnAt) && Number.isFinite(confirmedAt) &&
    withdrawnAt <= confirmedAt;
}

export function finalizedTransfers(rows: TransferSummary[], agency: TransferAgency, filters: HistoryFilters, now = new Date()) {
  const bounds = periodBounds(filters, now);
  const circuits = agencyCircuits(agency, true);
  const candidates = rows.filter(row => row.agencyTo === agency && hasRecordedWithdrawalAndFinalization(row) &&
    circuits.includes(`${row.agencyFrom}>${row.agencyTo}` as typeof circuits[number]) &&
    (!filters.currency || row.currency === filters.currency) &&
    (!filters.circuit || filters.circuit === `${row.agencyFrom}>${row.agencyTo}`));
  const dated = candidates.filter(row => {
    const day = dateKey(row.confirmedAt || "");
    return day && bounds.from && bounds.to && day >= bounds.from && day <= bounds.to;
  }).sort((a, b) => Date.parse(b.confirmedAt!) - Date.parse(a.confirmedAt!) ||
    (a.transferId < b.transferId ? -1 : Number(a.transferId > b.transferId)));
  return { dated };
}
