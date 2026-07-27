export const AGENCIES = ["FIH", "LSHI", "KLZ", "COTONOU"] as const;
export const DESTINATIONS = ["FIH", "LSHI", "KLZ"] as const;
export const PAYMENT_MODES = ["ESPECES", "MOBILE_MONEY", "VIREMENT", "AUTRE"] as const;

export type Agency = (typeof AGENCIES)[number];
export type DestinationCode = (typeof DESTINATIONS)[number];
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface AgentProfile {
  id: string;
  nom: string;
  agence: Agency;
  role: string;
  actif: true;
}

export interface Parcel {
  codeColis: string;
  dateColis: string;
  destinationCode: DestinationCode;
  destinationNom: string;
  montantAttendu: number;
  montantDejaPaye: number;
  soldeRestant: number;
  poidsKg: number;
  statutColis: string;
}

export interface PaymentResult {
  codeColis: string;
  destinationCode: DestinationCode;
  destinationNom: string;
  montantPaye: number;
  nouveauTotalPaye: number;
  nouveauSolde: number;
  statutPaiement: "SOLDE" | "PARTIELLEMENT PAYE";
  datePaiement: string;
}
