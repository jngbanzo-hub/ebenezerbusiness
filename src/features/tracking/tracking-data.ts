import {
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  MapPin,
  MapPinned,
  Package,
  PackageCheck,
  Plane,
  Scale,
  Truck,
  UserRound
} from "lucide-react";

export type TrackingVisualStatus = "pending" | "inFlight" | "arrived" | "delivered";

export type PublicTrackingRecord = {
  trackingId: string;
  customerName: string;
  site: string;
  weight: string;
  amount: string;
  status: string;
  destination: string;
  expectedDeliveryDate: string;
};

export type TrackingResult = PublicTrackingRecord & {
  statusVisual: TrackingVisualStatus;
};

export const statusConfig = {
  pending: {
    label: "En attente",
    className: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    dotClassName: "bg-amber-300",
    icon: Clock3
  },
  inFlight: {
    label: "En vol",
    className: "border-primary/30 bg-primary/15 text-[#AFC7FF]",
    dotClassName: "bg-[#38BDF8]",
    icon: Plane
  },
  arrived: {
    label: "Arrivé",
    className: "border-accent/30 bg-accent/15 text-[#D9FF83]",
    dotClassName: "bg-accent",
    icon: MapPinned
  },
  delivered: {
    label: "Livré",
    className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
    dotClassName: "bg-emerald-300",
    icon: CheckCircle2
  }
} as const;

export const trackingDetailItems = [
  { key: "trackingId", label: "Tracking ID", icon: Package },
  { key: "customerName", label: "Nom du client", icon: UserRound },
  { key: "site", label: "Site d'origine", icon: Building2 },
  { key: "destination", label: "Destination", icon: MapPin },
  { key: "weight", label: "Poids", icon: Scale },
  { key: "amount", label: "Montant", icon: Banknote },
  { key: "status", label: "Statut", icon: Truck },
  { key: "expectedDeliveryDate", label: "Date prévue / commentaire", icon: CalendarDays }
] as const;

export function createTrackingResultFromPublicRecord(
  record: PublicTrackingRecord
): TrackingResult {
  return {
    ...record,
    statusVisual: inferTrackingVisualStatus(record.status)
  };
}

export function createMockTrackingResult(trackingId: string): TrackingResult {
  return createTrackingResultFromPublicRecord({
    trackingId,
    customerName: "Client de démonstration",
    site: "FIH",
    weight: "12,8 kg",
    amount: "115 $",
    status: "En vol",
    destination: "Kinshasa",
    expectedDeliveryDate: "12 juillet 2026"
  });
}

export const trackingHighlights = [
  { label: "Validation instantanée", icon: ClipboardCheck },
  { label: "Transit sécurisé", icon: PackageCheck },
  { label: "Mises à jour claires", icon: Plane }
] as const;

function inferTrackingVisualStatus(status: string): TrackingVisualStatus {
  const normalizedStatus = status
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalizedStatus.includes("livre")) {
    return "delivered";
  }

  if (normalizedStatus.includes("arrive")) {
    return "arrived";
  }

  if (
    normalizedStatus.includes("vol") ||
    normalizedStatus.includes("transit") ||
    normalizedStatus.includes("expedie")
  ) {
    return "inFlight";
  }

  return "pending";
}
