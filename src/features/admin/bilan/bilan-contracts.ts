export const BILAN_AGENCIES = ["FIH", "LSHI", "KLZ"] as const;

export type BilanAgency = (typeof BILAN_AGENCIES)[number];
export type CohortId = `${number}-${string}`;

export type CohortDefinition = Readonly<{
  prefix: string;
  year: number;
  month: number;
  id: CohortId;
  label: string;
}>;

export type ResolvedCohort = Readonly<{
  state: "RESOLVED";
  definition: CohortDefinition;
}>;

export type UnresolvedCohort = Readonly<{
  state: "UNRESOLVED";
  code: "COHORTE_NON_RESOLUE";
  prefix: string;
}>;

export type CohortResolution = ResolvedCohort | UnresolvedCohort;

export type ParcelIdentity = Readonly<{
  rawCode: string;
  canonicalCode: string;
  cohort: CohortResolution;
  agency: BilanAgency;
  sourceSheet: string;
  sourceRow: number;
}>;

export type ShipmentContext = Readonly<{
  company: string;
  destination: BilanAgency;
  shipmentDate: string;
  sourceSheet: string;
  sourceRow: number;
}>;

export type ShipmentParcel = Readonly<{
  identity: ParcelIdentity;
  weightKg: number;
}>;

export type ShipmentGroup = Readonly<{
  label: string;
  canonicalLabel: string;
  identityKey: string;
  context: ShipmentContext;
  parcels: readonly ShipmentParcel[];
}>;

export type DirectCostKind =
  | "DECLARANT_LSHI_GROUP"
  | "DECLARANT_LSHI_DHL_WEIGHT"
  | "DECLARANT_FIH_STANDARD_GROUP"
  | "DECLARANT_FIH_DHL_WEIGHT"
  | "EXPEDITION_KLZ"
  | "TRANSIT_FIH_LSHI";

export type AllocatedDirectCost = Readonly<{
  state: "ALLOCATED";
  kind: DirectCostKind;
  amountCents: number;
  currency: "USD";
  cohortId: CohortId;
}>;

export type UnallocatedDirectCost = Readonly<{
  state: "DIRECT_COST_UNALLOCATED";
  kind: DirectCostKind;
  amountCents: number;
  currency: "USD";
  reason: string;
  sourceIdentity: string;
}>;

export type DirectCost = AllocatedDirectCost | UnallocatedDirectCost;
