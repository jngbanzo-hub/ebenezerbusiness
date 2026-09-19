import type { BilanAgency, ShipmentGroup } from "./bilan-contracts";

export type BilanReadAnomalyCode =
  | "SOURCE_INDISPONIBLE"
  | "CHAMP_MANQUANT"
  | "POIDS_INVALIDE"
  | "CODE_ABSENT"
  | "GROUPAGE_NON_SEGMENTABLE"
  | "PAIEMENT_SANS_IDENTITE"
  | "DEVISE_ABSENTE"
  | "DEPENSE_AMBIGUE";

export type BilanReadAnomaly = Readonly<{
  code: BilanReadAnomalyCode;
  source: string;
  rowNumber?: number;
  message: string;
}>;

export type BilanRangeRead = Readonly<{
  spreadsheet: "MANIFESTE_EXPEDITION_COO" | "MANIFESTE_PUBLIC";
  range: string;
}>;

export interface BilanRangeReader {
  readonly mode: "READ_ONLY";
  read(request: BilanRangeRead): Promise<readonly (readonly unknown[])[]>;
}

export type BilanManifestParcel = Readonly<{
  date: string;
  rawCode: string;
  code: string;
  weightKg: number;
  expectedAmount: number | null;
  agency: BilanAgency;
  sourceSheet: BilanAgency;
  sourceRow: number;
}>;

export type BilanShipment = Readonly<{
  date: string;
  company: string;
  destination: BilanAgency;
  sourceSheet: "EXPÉDITION";
  sourceRow: number;
  groups: readonly ShipmentGroup[];
}>;

export type BilanOfficialTransitRow = Readonly<{
  date: string;
  company: "DHL";
  destination: "LSHI";
  groupIdentifiers: readonly string[];
  officialWeightKg: number;
  parcelCodes: readonly string[];
  sourceSheet: "STATISTIQUES DES EXPÉDITIONS";
  sourceRow: number;
}>;

export type BilanAirFreightRow = Readonly<{
  date: string;
  company: string;
  destination: "FIH" | "LSHI";
  declaredGroupCount: number;
  officialWeightKg: number;
  details: string;
  rateUsdPerKg: number;
  amountUsd: number;
  sourceSheet: "STATISTIQUES DES EXPÉDITIONS";
  sourceRow: number;
}>;

export type BilanPayment = Readonly<{
  paymentDate: string;
  code: string;
  expectedAmount: number | null;
  paidAmount: number;
  destination: string;
  collectingAgency: string;
  status: string;
  paymentRequestId: string;
  sourceReference: string;
}>;

export type BilanExpense = Readonly<{
  date: string;
  agency: string;
  category: string;
  amount: number;
  currency: string;
  description: string;
  reference: string;
  status: string;
  cancelled: boolean;
  corrected: boolean;
  sourceReference: string;
}>;

export type BilanReadResult<T> = Readonly<{
  rows: readonly T[];
  anomalies: readonly BilanReadAnomaly[];
}>;
