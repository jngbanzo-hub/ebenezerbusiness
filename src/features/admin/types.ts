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

export const MANIFEST_SITES = ["FIH", "LSHI", "KLZ"] as const;
export type ManifestSite = (typeof MANIFEST_SITES)[number];

export const MANIFEST_DESTINATIONS = ["Kinshasa", "Lubumbashi", "Kolwezi"] as const;
export type ManifestDestination = (typeof MANIFEST_DESTINATIONS)[number];

export type ManifestShipperRow = {
  sourceSite: ManifestSite;
  rowNumber: number;
  dateRaw: string;
  codeColisRaw: string;
  expediteurRaw: string;
  poidsRaw: string | number;
};

export type ShipperSuggestion = {
  name: string;
  normalizedName: string;
};

export type ShipperParcelDetail = {
  id: string;
  date: string;
  codeColis: string;
  expediteur: string;
  sourceSite: ManifestSite;
  destination: ManifestDestination;
  poidsKg: number | null;
};

export type ShipperBreakdown = {
  colis: number;
  kilogrammes: number;
};

export type ShipperAnomalyReport = {
  invalidDates: number;
  missingCodes: number;
  missingShippers: number;
  invalidWeights: number;
  duplicateRows: number;
  conflictingWeights: number;
  crossSiteCodes: number;
};

export type ShipperStatistics = {
  expediteur: string;
  normalizedExpediteur: string;
  startDate: string;
  endDate: string;
  nombreColis: number;
  totalKilogrammes: number;
  poidsMoyenKg: number | null;
  bySite: Record<ManifestSite, ShipperBreakdown>;
  byDestination: Record<ManifestDestination, ShipperBreakdown>;
  parcels: ShipperParcelDetail[];
  anomalies: ShipperAnomalyReport;
};

export type ShipperSuggestionsApiResponse = {
  shippers: ShipperSuggestion[];
};

export type ShipperStatisticsApiResponse = {
  statistics: ShipperStatistics;
};
