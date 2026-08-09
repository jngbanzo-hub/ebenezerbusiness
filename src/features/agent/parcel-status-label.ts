const PARCEL_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  AVAILABLE: "DISPONIBLE",
  PRESENT: "PRÉSENT",
  PAID: "PAYÉ",
  DELIVERED: "LIVRÉ",
  RELEASED: "REMIS",
  WAITING: "EN ATTENTE",
  REGISTERED: "ENREGISTRÉ",
  IN_FLIGHT: "EN VOL",
  IN_TRANSIT: "EN TRANSIT",
  ARRIVED: "ARRIVÉ",
  CANCELLED: "ANNULÉ",
  PARTIALLY_PAID: "PARTIELLEMENT PAYÉ",
  PAID_AWAITING_ARRIVAL: "PAYÉ — EN ATTENTE D’ARRIVÉE",
  READY_FOR_DELIVERY: "PRÊT À REMETTRE"
});

export function parcelStatusLabel(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (!normalized) return "STATUT INCONNU";
  return PARCEL_STATUS_LABELS[normalized] ?? normalized.replace(/[_-]+/g, " ");
}
