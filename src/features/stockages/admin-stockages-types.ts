import type { StockagesSite } from "@/features/stockages/types";

export const STOCKAGES_SHEET_NAMES = [
  "PARAMETRES",
  "SOLDE INITIAL",
  "HISTORIQUE STATUTS",
  "MOUVEMENTS STOCK",
  "STOCK JOURNALIER",
  "AUDIT",
  "ANOMALIES MANIFESTE",
  "PHOTOGRAPHIE STATUTS",
  "SIMULATION SYNCHRONISATION",
  "EXCLUSIONS PHOTOGRAPHIE"
] as const;

export type StockagesSheetName = (typeof STOCKAGES_SHEET_NAMES)[number];

export type StockagesSheetAvailability = Record<StockagesSheetName, boolean>;

export type AdminStockagesOverview = {
  systemStatus: string | null;
  activationDate: string | null;
  initialSnapshot: string | null;
  lastSimulation: string | null;
  lastSynchronization: string | null;
  lastUpdatedAt: string | null;
  blockingAnomalies: number | null;
  negativeStockAlerts: number | null;
};

export type AdminInitialBalance = {
  site: StockagesSite;
  status: "BROUILLON" | "VALIDÉ" | null;
  activationDate: string | null;
  initialParcels: number | null;
  initialKilograms: number | null;
  validatedBy: string | null;
  validatedAt: string | null;
};

export type AdminAgencyStock = {
  site: StockagesSite;
  available: boolean;
  initialParcels: number | null;
  initialKilograms: number | null;
  inboundParcels: number | null;
  inboundKilograms: number | null;
  outboundParcels: number | null;
  outboundKilograms: number | null;
  adjustmentParcels: number | null;
  adjustmentKilograms: number | null;
  finalParcels: number | null;
  finalKilograms: number | null;
  status: "OK" | "ALERTE_STOCK_NEGATIF" | null;
};

export type StockagesAnomalyCategory =
  | "ANOMALIE_BLOQUANTE"
  | "DOUBLON"
  | "EXCLUSION_INVALIDE"
  | "EXCLUSION_NON_RETROUVEE"
  | "STOCK_NEGATIF"
  | "ERREUR_SYNCHRONISATION";

export type AdminStockagesAnomaly = {
  id: string;
  date: string;
  category: StockagesAnomalyCategory;
  site: StockagesSite | null;
  reference: string;
  details: string;
};

export type AdminStockagesStatusResponse = {
  mode: "PREPARATION";
  unavailableMessage: "Non disponible avant l’activation";
  overview: AdminStockagesOverview;
  initialBalances: AdminInitialBalance[];
  agencyStocks: AdminAgencyStock[];
  anomalies: AdminStockagesAnomaly[];
  sheetAvailability: StockagesSheetAvailability;
  actionsEnabled: false;
  adjustmentsEnabled: false;
  exportsEnabled: false;
};

export type AdminStockMovement = {
  id: string;
  date: string;
  site: StockagesSite | null;
  parcelCode: string;
  movementType: string;
  triggerStatus: string;
  state: "ACTIVE" | "CANCELLED";
  parcels: number | null;
  kilograms: number | null;
  details: string;
};

export type AdminStockagesMovementsResponse = {
  available: boolean;
  unavailableMessage: "Non disponible avant l’activation";
  movements: AdminStockMovement[];
};

export type AdminStockagesAuditEntry = {
  id: string;
  date: string;
  user: string;
  action: string;
  site: StockagesSite | null;
  reference: string;
  result: string;
  details: string;
};

export type AdminStockagesAuditResponse = {
  available: boolean;
  unavailableMessage: "Non disponible avant l’activation";
  entries: AdminStockagesAuditEntry[];
};
