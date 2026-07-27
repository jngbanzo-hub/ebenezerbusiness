import { DESTINATIONS, type DestinationCode, type Parcel } from "@/features/agent/types";

function isRequiredText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isDestinationCode(value: unknown): value is DestinationCode {
  return typeof value === "string" && DESTINATIONS.includes(value as DestinationCode);
}

export function parseParcelResponse(response: Record<string, unknown>): Parcel {
  if (
    !isRequiredText(response.codeColis) ||
    !isRequiredText(response.dateColis) ||
    !isDestinationCode(response.destinationCode) ||
    !isRequiredText(response.destinationNom) ||
    !isNonNegativeNumber(response.montantAttendu) ||
    !isNonNegativeNumber(response.montantDejaPaye) ||
    !isNonNegativeNumber(response.soldeRestant) ||
    !isNonNegativeNumber(response.poidsKg) ||
    !isRequiredText(response.statutColis)
  ) {
    throw new Error("La réponse de recherche est invalide ou incomplète.");
  }

  return {
    codeColis: response.codeColis.trim(),
    dateColis: response.dateColis.trim(),
    destinationCode: response.destinationCode,
    destinationNom: response.destinationNom.trim(),
    montantAttendu: response.montantAttendu,
    montantDejaPaye: response.montantDejaPaye,
    soldeRestant: response.soldeRestant,
    poidsKg: response.poidsKg,
    statutColis: response.statutColis.trim()
  };
}

export function formatAmount(value: number) {
  const formattedAmount = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);

  return `${formattedAmount} $`;
}
