const ANOMALY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  EXPECTED_AMOUNT_MISSING: "Montant attendu indisponible",
  EXPECTED_AMOUNT_CONFLICT: "Montants attendus incohérents",
  SOURCE_STATUS_INELIGIBLE: "Statut du colis non admissible pour l’encaissement",
  DESTINATION_CONFLICT: "Destination incohérente",
  WEIGHT_MISSING: "Poids indisponible",
  WEIGHT_CONFLICT: "Poids incohérent",
  PAYMENT_DATA_CONFLICT: "Données de paiement incohérentes",
  PAYMENT_EXPECTED_AMOUNT_CONFLICT: "Données de paiement incohérentes",
  OVERPAYMENT_DETECTED: "Montant payé supérieur au montant attendu",
  PAYMENT_OVERPAID: "Montant payé supérieur au montant attendu"
});

export function formatStockageWeight(value: number): string {
  return formatWeight(value);
}

export function formatStockageAnomalies(codes: readonly string[]): string[] {
  return codes.map((code) => ANOMALY_LABELS[code] ?? "Vérification métier nécessaire");
}
import { formatWeight } from "@/lib/format-weight";
