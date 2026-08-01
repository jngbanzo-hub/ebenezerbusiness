export const STOCKAGE_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;
export type StockageAgency = (typeof STOCKAGE_AGENCIES)[number];
export type StockageAccountStatus = "SUSPENDED" | "ACTIVE";
export type StockageEventType =
  | "OPENING_STOCK_RECORDED"
  | "MANUAL_ARRIVAL_RECORDED"
  | "CONFIRMED_DELIVERY_RECORDED"
  | "ADMIN_STOCK_ADJUSTMENT_RECORDED"
  | "STOCK_CORRECTION_RECORDED";

export type StockageAccount = Readonly<{
  agency: StockageAgency;
  status: StockageAccountStatus;
  currentParcelCount: number;
  currentWeightKg: number;
  version: number;
}>;

export type StockageCommand = Readonly<{
  requestId: string;
  commandHash: string;
  eventType: StockageEventType;
  agency: StockageAgency;
  parcelCount: number;
  weightKg: number;
  actorUserId: string;
  businessDate: string;
  trackingCode: string | null;
  reason: string | null;
}>;

export type ExistingRequest = Readonly<{
  requestId: string;
  commandHash: string;
}>;

export class StockageContractError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "StockageContractError";
  }
}

export function normalizeStockageAgency(value: unknown): StockageAgency {
  if (typeof value !== "string") {
    throw new StockageContractError("INVALID_AGENCY", "Agence invalide.");
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "COO" || normalized === "COTONOU") {
    throw new StockageContractError("COO_HAS_NO_STORAGE", "COO ne possède aucun Stockage.");
  }
  if (!STOCKAGE_AGENCIES.includes(normalized as StockageAgency)) {
    throw new StockageContractError("INVALID_AGENCY", "Agence invalide.");
  }
  return normalized as StockageAgency;
}

export function classifyIdempotency(
  existing: ExistingRequest | null,
  requestId: string,
  commandHash: string,
): "NEW" | "REPLAY" {
  requireIdentifier(requestId, "INVALID_REQUEST_ID");
  requireIdentifier(commandHash, "INVALID_COMMAND_HASH");
  if (existing === null) return "NEW";
  if (existing.requestId !== requestId || existing.commandHash !== commandHash) {
    throw new StockageContractError("IDEMPOTENCY_CONFLICT", "Conflit d’idempotence.");
  }
  return "REPLAY";
}

export function applyStockageCommand(
  account: StockageAccount,
  command: StockageCommand,
): StockageAccount {
  if (account.agency !== command.agency) {
    throw new StockageContractError("AGENCY_MISMATCH", "Agence incohérente.");
  }
  if (!Number.isInteger(command.parcelCount) || command.parcelCount <= 0) {
    throw new StockageContractError("INVALID_PARCEL_COUNT", "Nombre de colis invalide.");
  }
  if (!Number.isFinite(command.weightKg) || command.weightKg <= 0) {
    throw new StockageContractError("INVALID_WEIGHT", "Poids invalide.");
  }
  requireIdentifier(command.actorUserId, "INVALID_ACTOR");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(command.businessDate)) {
    throw new StockageContractError("INVALID_BUSINESS_DATE", "Date métier invalide.");
  }
  const opening = command.eventType === "OPENING_STOCK_RECORDED";
  if (opening ? account.status !== "SUSPENDED" || account.version !== 0 : account.status !== "ACTIVE") {
    throw new StockageContractError("ACCOUNT_NOT_ACTIVE", "État du compte incompatible.");
  }

  const delivery = command.eventType === "CONFIRMED_DELIVERY_RECORDED";
  if (delivery && !command.trackingCode) {
    throw new StockageContractError("INVALID_TRACKING_CODE", "Code colis obligatoire.");
  }
  if (delivery && (account.currentParcelCount < command.parcelCount || account.currentWeightKg < command.weightKg)) {
    throw new StockageContractError("INSUFFICIENT_STOCK", "Stock insuffisant.");
  }

  const direction = delivery ? -1 : 1;
  return Object.freeze({
    agency: account.agency,
    status: opening ? "ACTIVE" : account.status,
    currentParcelCount: account.currentParcelCount + direction * command.parcelCount,
    currentWeightKg: account.currentWeightKg + direction * command.weightKg,
    version: account.version + 1,
  });
}

function requireIdentifier(value: string, code: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(value)) {
    throw new StockageContractError(code, "Identifiant invalide.");
  }
}
