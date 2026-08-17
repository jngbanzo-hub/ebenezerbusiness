export const MANIFEST_STATUS_OPTIONS = [
  { value: "EN_ATTENTE", label: "En Attente" },
  { value: "NON_RECU", label: "Non Reçu" },
  { value: "EN_VOL", label: "En Vol" },
  { value: "EN_TRANSIT_ADDIS", label: "En Transit à Addis" },
  { value: "EN_TRANSIT_LAGOS", label: "En Transit à Lagos" },
  { value: "EN_TRANSIT_LIBREVILLE", label: "En Transit à Libreville" },
  { value: "EN_TRANSIT_BRAZZAVILLE", label: "En Transit à Brazzaville" },
  { value: "EN_TRANSIT_LUBUMBASHI", label: "En Transit à Lubumbashi" },
  { value: "ARRIVE", label: "Arrivé" },
  { value: "ARRIVE_KLZ", label: "Arrivé à KLZ" }
] as const;

export type CanonicalManifestStatus = (typeof MANIFEST_STATUS_OPTIONS)[number]["value"] | "INCONNU";

export function normalizeManifestStatus(value: unknown): CanonicalManifestStatus {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/^[\s\u00a0\u200b-\u200d\ufe0e\ufe0f\u2600-\u27bf\ud83c-\ud83e]+/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const aliases: Record<string, CanonicalManifestStatus> = {
    "EN ATTENTE": "EN_ATTENTE",
    "NON RECU": "NON_RECU",
    "EN VOL": "EN_VOL",
    "EN TRANSIT A ADDIS": "EN_TRANSIT_ADDIS",
    "EN TRANSIT A LAGOS": "EN_TRANSIT_LAGOS",
    "EN TRANSIT A LIBREVILLE": "EN_TRANSIT_LIBREVILLE",
    "EN TRANSIT A BRAZZAVILLE": "EN_TRANSIT_BRAZZAVILLE",
    "EN TRANSIT A LUBUMBASHI": "EN_TRANSIT_LUBUMBASHI",
    ARRIVE: "ARRIVE",
    "ARRIVE A KLZ": "ARRIVE_KLZ"
  };
  return aliases[normalized] ?? "INCONNU";
}

export function normalizeManifestStatusFilter(value: unknown): string {
  if (!String(value ?? "").trim()) return "";
  return normalizeManifestStatus(value);
}

export function manifestStatusLabel(status: string): string {
  return MANIFEST_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "Inconnu";
}
