export const BILAN_ANOMALY_CODES = [
  "COHORTE_NON_RESOLUE",
  "GROUPAGE_NON_SEGMENTABLE",
  "POIDS_ABSENT",
  "POIDS_DIVERGENT",
  "IDENTITE_CONFLICTUELLE",
  "PAIEMENT_NON_RAPPROCHE",
  "CHARGE_DIRECTE_NON_IMPUTEE",
  "TARIF_HISTORIQUE_NON_DISPONIBLE"
] as const;

export type BilanAnomalyCode = (typeof BILAN_ANOMALY_CODES)[number];

export type BilanAnomaly = Readonly<{
  code: BilanAnomalyCode;
  source: string;
  identity: string;
  message: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export function bilanAnomaly(
  code: BilanAnomalyCode,
  input: Omit<BilanAnomaly, "code">
): BilanAnomaly {
  return Object.freeze({ code, ...input });
}
