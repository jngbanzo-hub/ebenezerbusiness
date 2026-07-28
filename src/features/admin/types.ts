export const ADMIN_SITES = ["COO", "FIH", "LSHI", "KLZ"] as const;
export const ADMIN_DESTINATIONS = ["FIH", "LSHI", "KLZ"] as const;
export const ADMIN_PERIOD_PRESETS = [
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "CUSTOM"
] as const;

export type AdminSite = (typeof ADMIN_SITES)[number];
export type AdminDestination = (typeof ADMIN_DESTINATIONS)[number];
export type AdminPeriodPreset = (typeof ADMIN_PERIOD_PRESETS)[number];

export type AdminPayment = {
  id: string;
  dateTime: string;
  dateKey: string;
  codeColis: string;
  poidsKg: number | null;
  montantAttendu: number | null;
  montantPaye: number;
  soldeRestant: number | null;
  agenceEncaissement: AdminSite;
  destinationCode: AdminDestination;
  destination: string;
  statutPaiement: string;
  agent: string;
  modePaiement: string;
  reference: string;
  observation: string;
};

export type AdminPaymentFilters = {
  startDate: string;
  endDate: string;
  site: AdminSite | "ALL";
  destination: AdminDestination | "ALL";
  codeColis: string;
  agent: string;
};

export type AdminPaymentStats = {
  montantTotal: number;
  nombrePaiements: number;
  poidsTotalKg: number;
};

export type AdminPaymentsSummary = {
  sites: Record<AdminSite, AdminPaymentStats>;
  total: AdminPaymentStats;
};

export type AdminPaymentsApiResponse = {
  payments: AdminPayment[];
};
