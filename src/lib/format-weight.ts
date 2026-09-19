export function formatWeight(value: number): string {
  if (!Number.isFinite(value)) return "Poids indisponible";

  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 3
  }).format(value)} kg`;
}
