export type AuditRow = Record<string, unknown>;

const ACTION_LABELS: Record<string, string> = {
  PHYSICAL_INVENTORY_RECONCILED: "Réconciliation inventaire physique",
  OPENING_STOCK_RECORDED: "Stock initial enregistré",
  ADMIN_STOCK_ADJUSTMENT_RECORDED: "Ajustement Admin Stockage",
  STOCK_CORRECTION_RECORDED: "Correction compensatoire Stockage",
  STOCKAGE_ANOMALY_RESOLVED: "Anomalie Stockage résolue",
  OPENING_BALANCE_RECORDED: "Solde initial enregistré",
  ADMIN_ADJUSTMENT: "Ajustement Admin",
  ADMIN_ADJUSTMENT_RECORDED: "Ajustement Admin",
  CASH_CORRECTION_RECORDED: "Correction compensatoire Caisse",
  CASH_DAY_CLOSED: "Journée de Caisse clôturée",
  CASH_DAY_REOPENED: "Journée de Caisse rouverte",
};

export type AuditPresentation = {
  action: string;
  actionCode: string;
  agency: string;
  admin: string;
  occurredAt: string;
  dateKey: string;
  reason: string;
  oldState: string;
  newState: string;
  adjustment: string | null;
  auditId: string;
};

export function buildAuditPresentation(row: AuditRow): AuditPresentation {
  const actionCode = text(row.action) || "UNKNOWN";
  const oldValue = objectValue(row.old_value);
  const newValue = objectValue(row.new_value);
  return {
    action: auditActionLabel(actionCode),
    actionCode,
    agency: text(row.agency) || "—",
    admin: text(row.admin_name ?? row.adminName) || "—",
    occurredAt: formatAuditDateTime(row.occurred_at ?? row.occurredAt),
    dateKey: auditDateKey(row.occurred_at ?? row.occurredAt),
    reason: text(row.reason) || "—",
    oldState: describeAuditState(oldValue),
    newState: describeAuditState(newValue),
    adjustment: describeAdjustment(oldValue, newValue),
    auditId: compactAuditId(row.audit_id ?? row.auditId),
  };
}

export function auditActionLabel(value: unknown): string {
  const code = text(value).toUpperCase();
  if (ACTION_LABELS[code]) return ACTION_LABELS[code];
  if (!code) return "Action non renseignée";
  const normalized = code.toLocaleLowerCase("fr-FR").replace(/_/g, " ");
  return normalized.charAt(0).toLocaleUpperCase("fr-FR") + normalized.slice(1);
}

export function compactAuditId(value: unknown): string {
  const id = text(value);
  if (!id) return "—";
  if (id.length <= 18) return id;
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

export function auditDateKey(value: unknown): string {
  const date = parseDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Porto-Novo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatAuditDateTime(value: unknown): string {
  const date = parseDate(value);
  if (!date) return "—";
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Porto-Novo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} à ${part("hour")}:${part("minute")}`;
}

function describeAuditState(value: Record<string, unknown> | null): string {
  if (!value) return "Aucun état antérieur";
  const parcelCount = numberValue(value, ["parcelCount", "parcel_count", "currentParcelCount", "current_parcel_count"]);
  const weightKg = numberValue(value, ["weightKg", "weight_kg", "currentWeightKg", "current_weight_kg"]);
  if (parcelCount !== null || weightKg !== null) {
    return `${parcelCount === null ? "—" : formatNumber(parcelCount)} colis / ${weightKg === null ? "—" : formatNumber(weightKg)} kg`;
  }
  const balance = numberValue(value, ["balance", "currentBalance", "current_balance", "closingBalance", "openingBalance"]);
  if (balance !== null) return `${formatNumber(balance)} ${text(value.currency) || "USD"}`;
  const amount = numberValue(value, ["amount"]);
  if (amount !== null) return `${formatNumber(amount)} ${text(value.currency) || "USD"}`;
  return "Valeur technique disponible dans les détails";
}

function describeAdjustment(oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null): string | null {
  if (!newValue) return null;
  const explicit = numberValue(newValue, ["difference", "adjustment", "amount"]);
  const direction = text(newValue.direction).toUpperCase();
  if (explicit !== null && direction) return `${direction === "DEBIT" ? "−" : "+"}${formatNumber(Math.abs(explicit))} USD`;
  const oldBalance = oldValue && numberValue(oldValue, ["balance", "currentBalance", "current_balance", "closingBalance", "openingBalance", "amount"]);
  const newBalance = numberValue(newValue, ["balance", "currentBalance", "current_balance", "closingBalance", "openingBalance", "amount"]);
  if (oldBalance !== null && newBalance !== null) {
    const difference = newBalance - oldBalance;
    return `${difference >= 0 ? "+" : "−"}${formatNumber(Math.abs(difference))} USD`;
  }
  return null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function numberValue(value: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim() !== "" && Number.isFinite(Number(candidate))) return Number(candidate);
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
