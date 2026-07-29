export const TRANSFER_AGENCIES = ["COO", "FIH", "LSHI", "KLZ"] as const;
export const TRANSFER_CURRENCIES = ["USD", "CDF", "XOF"] as const;
export const TRANSFER_STATUSES = [
  "ENVOYE",
  "CODE_RECU",
  "FONDS_RETIRES",
  "CONFIRME",
  "A_VERIFIER",
  "ANNULE"
] as const;

export type TransferAgency = (typeof TRANSFER_AGENCIES)[number];
export type TransferCurrency = (typeof TRANSFER_CURRENCIES)[number];
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export type TransfersModuleState =
  | "PREPARATION"
  | "EMPTY"
  | "SERVICE_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "FORBIDDEN"
  | "READY";

export type TransferSummary = {
  transferId: string;
  sentAt: string;
  agencyFrom: TransferAgency;
  agencyTo: TransferAgency;
  amount: number;
  currency: TransferCurrency;
  fees: number;
  netExpected: number;
  service: string;
  maskedCode: string;
  status: TransferStatus;
  codeReceivedBy: string;
  codeReceivedAt: string | null;
  fundsWithdrawnBy: string;
  fundsWithdrawnAt: string | null;
  confirmedBy: string;
  confirmedAt: string | null;
  observation: string;
  cancelled: boolean;
  cancelReason: string;
};

export type TransferAuditEntry = {
  dateTime: string;
  user: string;
  action: string;
  agencyFrom: TransferAgency;
  agencyTo: TransferAgency;
  transferId: string;
  oldValue: string;
  newValue: string;
  result: string;
  details: Record<string, unknown>;
  auditId: string;
};

export type TransfersPageResponse = {
  state: TransfersModuleState;
  moduleStatus: "PREPARATION";
  role: "AGENT" | "ADMIN";
  agency: TransferAgency | null;
  apiAvailable: boolean;
  writesEnabled: false;
  adminEnabled: false;
  transfers: TransferSummary[];
  message: string;
};

export type TransfersAuditResponse = {
  state: TransfersModuleState;
  entries: TransferAuditEntry[];
  message: string;
};
