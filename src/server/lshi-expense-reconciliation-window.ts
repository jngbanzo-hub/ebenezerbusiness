export type LshiExpenseReconciliationKind = "INCREMENTAL" | "DAILY" | "DAILY_RETRY";

export type LshiExpenseReconciliationWindow = Readonly<{
  startInclusive: string;
  endExclusive: string;
  sheetDateStart: string;
  sheetDateEnd: string;
}>;

const INCREMENTAL_LOOKBACK_MS = 2 * 60 * 60 * 1000;
const PORTO_NOVO_UTC_OFFSET = "+01:00";

export function lshiExpenseReconciliationWindow(
  kind: LshiExpenseReconciliationKind,
  businessDate: string,
  now: Date
): LshiExpenseReconciliationWindow {
  const start = kind === "INCREMENTAL"
    ? new Date(now.getTime() - INCREMENTAL_LOOKBACK_MS)
    : startOfBusinessDateInPortoNovo(businessDate);
  const end = kind === "INCREMENTAL"
    ? new Date(now)
    : new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    startInclusive: start.toISOString(),
    endExclusive: end.toISOString(),
    sheetDateStart: businessDateInPortoNovo(start),
    sheetDateEnd: businessDateInPortoNovo(new Date(end.getTime() - 1))
  };
}

export function isTimestampInLshiExpenseWindow(
  value: string,
  window: LshiExpenseReconciliationWindow
) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && timestamp >= Date.parse(window.startInclusive)
    && timestamp < Date.parse(window.endExclusive);
}

function startOfBusinessDateInPortoNovo(businessDate: string) {
  return new Date(`${businessDate}T00:00:00${PORTO_NOVO_UTC_OFFSET}`);
}

function businessDateInPortoNovo(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Porto-Novo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}
