export type QrStockAlert = {
  level: "LOW" | "VERY_LOW";
  title: string;
  message: string;
} | null;

export function getQrStockAlert(unassigned: number): QrStockAlert {
  if (unassigned <= 100) {
    return {
      level: "VERY_LOW",
      title: "IMPORTANT — STOCK QR TRÈS FAIBLE",
      message: `Il ne reste que ${unassigned} QR libres. Une nouvelle série QR doit être réservée rapidement.`
    };
  }
  if (unassigned <= 200) {
    return {
      level: "LOW",
      title: "ATTENTION — STOCK QR FAIBLE",
      message: `Il reste ${unassigned} QR libres. Préparer une nouvelle réservation.`
    };
  }
  return null;
}
