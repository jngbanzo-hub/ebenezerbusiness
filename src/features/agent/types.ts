export const AGENCIES = ["FIH", "LSHI", "KLZ", "COTONOU"] as const;
export const DESTINATIONS = ["FIH", "LSHI", "KLZ"] as const;
export const PAYMENT_MODES = ["ESPECES", "MOBILE_MONEY", "VIREMENT", "AUTRE"] as const;
export const ACCOUNT_ROLES = ["AGENT", "ADMIN"] as const;

export type Agency = (typeof AGENCIES)[number];
export type DestinationCode = (typeof DESTINATIONS)[number];
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export interface ProfessionalProfile {
  id: string;
  nom: string;
  role: AccountRole;
  actif: true;
}

export interface AgentProfile extends ProfessionalProfile {
  agence: Agency;
  role: "AGENT";
}

export interface AdminProfile extends ProfessionalProfile {
  role: "ADMIN";
}

export interface Parcel {
  parcelId?: string;
  forwardingId?: string | null;
  displayCode?: string;
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
  cashRecorded?: boolean;
  cashStatus?: "RECORDED" | "ACCOUNT_NOT_ACTIVE";
  replayed?: boolean;
}
