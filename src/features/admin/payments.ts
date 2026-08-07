import {
  ADMIN_SITES,
  type AdminDestination,
  type AdminPayment,
  type AdminPaymentFilters,
  type AdminPaymentsApiResponse,
  type AdminPaymentsSummary,
  type AdminPaymentStats,
  type AdminSite
} from "@/features/admin/types";

const EMPTY_STATS: AdminPaymentStats = {
  montantTotal: 0,
  nombrePaiements: 0,
  poidsTotalKg: 0
};

export class AdminPaymentsApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AdminPaymentsApiError";
  }
}

export async function loadAdminPayments(
  accessToken: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal
) {
  const searchParams = new URLSearchParams({ from: startDate, to: endDate });
  const response = await fetch(`/api/admin/payments?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store",
    signal
  });
  const payload = (await response.json().catch(() => null)) as
    | AdminPaymentsApiResponse
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Impossible de charger les encaissements.";
    throw new AdminPaymentsApiError(message, response.status);
  }

  if (!payload || !("payments" in payload) || !Array.isArray(payload.payments)) {
    throw new AdminPaymentsApiError("Réponse du serveur invalide.", 503);
  }

  return payload.payments;
}

export function filterAdminPayments(
  payments: AdminPayment[],
  filters: AdminPaymentFilters
) {
  const normalizedCode = normalizeSearch(filters.codeColis);
  const normalizedAgent = normalizeSearch(filters.agent);

  return payments
    .filter(
      (payment) =>
        payment.dateKey >= filters.startDate &&
        payment.dateKey <= filters.endDate &&
        (filters.site === "ALL" || payment.agenceEncaissement === filters.site) &&
        (filters.destination === "ALL" ||
          payment.destinationCode === filters.destination) &&
        (!normalizedCode || normalizeSearch(payment.codeColis).includes(normalizedCode)) &&
        (!normalizedAgent || normalizeSearch(payment.agent).includes(normalizedAgent))
    )
    .sort((first, second) => second.dateTime.localeCompare(first.dateTime));
}

export function calculateAdminPaymentsSummary(
  payments: AdminPayment[]
): AdminPaymentsSummary {
  const sites = Object.fromEntries(
    ADMIN_SITES.map((site) => [site, { ...EMPTY_STATS }])
  ) as Record<AdminSite, AdminPaymentStats>;
  const countedWeights = new Set<string>();

  for (const payment of payments) {
    const siteStats = sites[payment.agenceEncaissement];

    siteStats.montantTotal += payment.montantPaye;
    siteStats.nombrePaiements += 1;

    const weightKey = `${payment.agenceEncaissement}:${payment.codeColis}`;
    if (
      payment.poidsKg !== null &&
      payment.poidsKg > 0 &&
      !countedWeights.has(weightKey)
    ) {
      siteStats.poidsTotalKg += payment.poidsKg;
      countedWeights.add(weightKey);
    }
  }

  for (const stats of Object.values(sites)) {
    stats.montantTotal = roundAmount(stats.montantTotal);
    stats.poidsTotalKg = roundWeight(stats.poidsTotalKg);
  }

  return {
    sites,
    total: {
      montantTotal: roundAmount(
        Object.values(sites).reduce((total, stats) => total + stats.montantTotal, 0)
      ),
      nombrePaiements: Object.values(sites).reduce(
        (total, stats) => total + stats.nombrePaiements,
        0
      ),
      poidsTotalKg: roundWeight(
        Object.values(sites).reduce((total, stats) => total + stats.poidsTotalKg, 0)
      )
    }
  };
}

export function parseAdminPaymentRow(
  row: unknown[],
  sourceSite: AdminSite,
  rowNumber: number
): AdminPayment | null {
  if (row.every((cell) => String(cell ?? "").trim() === "")) {
    return null;
  }

  const parsedDate = parseSheetDate(row[0]);
  const codeColis = normalizeText(row[1]).toUpperCase();
  const montantPaye = parseNumber(row[4]);
  const agenceEncaissement = normalizeSite(row[6]);
  const destination = normalizeDestination(row[7]);

  if (
    !parsedDate ||
    !codeColis ||
    montantPaye === null ||
    montantPaye <= 0 ||
    agenceEncaissement !== sourceSite ||
    !destination
  ) {
    return null;
  }

  return {
    id: `${sourceSite}:${rowNumber}`,
    dateTime: parsedDate.dateTime,
    dateKey: parsedDate.dateKey,
    codeColis,
    poidsKg: parseNonNegativeNumber(row[2]),
    montantAttendu: parseNonNegativeNumber(row[3]),
    montantPaye,
    soldeRestant: parseNonNegativeNumber(row[5]),
    agenceEncaissement,
    destinationCode: destination.code,
    destination: destination.label,
    statutPaiement: normalizeText(row[8]),
    agent: normalizeText(row[9]),
    modePaiement: normalizeText(row[10]),
    reference: normalizeText(row[11]),
    observation: normalizeText(row[14]),
    paymentRequestId: normalizeText(row[15]).toLowerCase()
  };
}

export function formatAdminAmount(value: number) {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2
  }).format(value)} $`;
}

export function formatAdminWeight(value: number) {
  return formatWeight(value);
}

export function formatAdminDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function parseSheetDate(value: unknown): { dateTime: string; dateKey: string } | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const milliseconds = Math.round((value - 25569) * 86_400_000);
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return {
      dateTime: date.toISOString(),
      dateKey: date.toISOString().slice(0, 10)
    };
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim();
  const frenchDate = normalized.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (frenchDate) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = frenchDate;
    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      )
    );

    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }

    return {
      dateTime: date.toISOString(),
      dateKey: date.toISOString().slice(0, 10)
    };
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    dateTime: date.toISOString(),
    dateKey: date.toISOString().slice(0, 10)
  };
}

function normalizeSite(value: unknown): AdminSite | null {
  const normalized = normalizeText(value).toUpperCase();
  return ADMIN_SITES.includes(normalized as AdminSite) ? (normalized as AdminSite) : null;
}

function normalizeDestination(
  value: unknown
): { code: AdminDestination; label: string } | null {
  const normalized = normalizeSearch(value);
  const mappings: Array<[AdminDestination, string[]]> = [
    ["FIH", ["FIH", "KINSHASA"]],
    ["LSHI", ["LSHI", "LUBUMBASHI"]],
    ["KLZ", ["KLZ", "KOLWEZI"]]
  ];

  for (const [code, aliases] of mappings) {
    if (aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} /`))) {
      return {
        code,
        label:
          code === "FIH"
            ? "FIH / Kinshasa"
            : code === "LSHI"
              ? "LSHI / Lubumbashi"
              : "KLZ / Kolwezi"
      };
    }
  }

  return null;
}

function parseNonNegativeNumber(value: unknown) {
  const parsed = parseNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const compact = value
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/\$/g, "")
    .replace(",", ".");
  const parsed = Number(compact);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSearch(value: unknown) {
  return normalizeText(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function roundAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundWeight(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
import { formatWeight } from "@/lib/format-weight";
