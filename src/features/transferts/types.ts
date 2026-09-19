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
  agentFrom: string;
  agencyTo: TransferAgency;
  agentTo: string;
  amount: number;
  currency: TransferCurrency;
  fees: number;
  netExpected: number;
  service: string;
  maskedCode: string;
  senderName: string;
  beneficiaryName: string;
  beneficiaryPhone?: string;
  status: TransferStatus;
  codeReceivedBy: string;
  codeReceivedAt: string | null;
  fundsWithdrawnBy: string;
  fundsWithdrawnAt: string | null;
  confirmedBy: string;
  confirmedAt: string | null;
  observation: string;
  createdAt: string;
  updatedAt: string;
  cancelled: boolean;
  cancelReason: string;
  transferRequestId?: string;
  transferCode?: string;
};

export type TransferDetailResponse = {
  state: TransfersModuleState;
  transfer: TransferSummary;
  writesEnabled?: boolean;
  message?: string;
};

export type CorrectTransferCodeInput = {
  newTransferCode: string;
  confirmTransferCode: string;
  motif: string;
  correctionRequestId: string;
};

export type CorrectTransferAmountInput = {
  newAmount: number;
  correctionRequestId: string;
};

export type CorrectTransferBeneficiaryInput = {
  newBeneficiaryName: string;
  correctionRequestId: string;
};

export type CreateTransferInput = {
  agencyTo: TransferAgency;
  amount: number;
  currency: TransferCurrency;
  fees: number;
  service: string;
  transferCode: string;
  senderName: string;
  beneficiaryName: string;
  beneficiaryPhone: string;
  transferRequestId: string;
  observation?: string;
};

export type TransferWriteState =
  | "SUCCESS"
  | "INVALID_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "WRITES_DISABLED"
  | "RESULT_REQUIRES_VERIFICATION"
  | "SERVICE_UNAVAILABLE";

export type TransferWriteResponse = {
  state: TransferWriteState;
  message: string;
  transfer?: TransferSummary;
};

export const TRANSFER_CIRCUITS = [
  "FIH>COO",
  "LSHI>COO",
  "KLZ>COO",
  "COO>FIH",
  "COO>LSHI",
  "COO>KLZ"
] as const;
export type TransferCircuit = (typeof TRANSFER_CIRCUITS)[number];
export type TransferPeriod = "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "CUSTOM";
export type CurrencyTotals = Record<TransferCurrency, number>;
export type StatusCounts = Record<TransferStatus, number>;

export type TransferCircuitStatistics = {
  circuit: TransferCircuit;
  count: number;
  amountsByCurrency: CurrencyTotals;
  statuses: StatusCounts;
};

export type TransferPeriodStatistics = {
  count: number;
  amountsByCurrency: CurrencyTotals;
  statuses: StatusCounts;
};

export type AdminTransferStatistics = {
  timezone: "Africa/Porto-Novo";
  todayKey: string;
  monthKey: string;
  invalidDateCount: number;
  today: TransferPeriodStatistics;
  currentMonth: TransferPeriodStatistics & {
    byAgencyFrom: Record<TransferAgency, number>;
    byAgencyTo: Record<TransferAgency, number>;
    byCircuit: Record<TransferCircuit, TransferCircuitStatistics>;
    byCurrency: Record<TransferCurrency, number>;
  };
};

export type AdminTransferFilters = {
  period: TransferPeriod;
  from: string;
  to: string;
  agencyFrom: TransferAgency | "";
  agencyTo: TransferAgency | "";
  circuit: TransferCircuit | "";
  status: TransferStatus | "";
  currency: TransferCurrency | "";
  transferId: string;
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
  moduleStatus: "PREPARATION" | "OPERATIONAL";
  role: "AGENT" | "ADMIN";
  agency: TransferAgency | null;
  apiAvailable: boolean;
  writesEnabled: boolean;
  adminEnabled: boolean;
  transfers: TransferSummary[];
  statistics?: AdminTransferStatistics | null;
  filters?: AdminTransferFilters;
  message: string;
};

export type TransfersAuditResponse = {
  state: TransfersModuleState;
  entries: TransferAuditEntry[];
  message: string;
};
