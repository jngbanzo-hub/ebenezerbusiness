import type { CanonicalAgency } from "./agencies";

export type StockMovementType =
  | "ENTREE_COO"
  | "SORTIE_COO"
  | "ENTREE_DESTINATION"
  | "SORTIE_DESTINATION"
  | "AJUSTEMENT_ADMIN";

export type StockEvent = {
  statusEventId: string;
  movementId: string;
  parcelCode: string;
  agency: CanonicalAgency;
  weightKg: number;
  previousStatus: string | null;
  newStatus: string;
  movementType: StockMovementType;
  sourceObservedAt: string;
  businessDate: string;
  requestId: string;
  actorUserId: string;
  status: "ACTIVE" | "REVERSED";
  reversalOf: string | null;
  version: number;
};
