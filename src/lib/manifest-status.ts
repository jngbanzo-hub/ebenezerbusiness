export const MANIFEST_STATUS_OPTIONS = [
  { value: "EN_ATTENTE", label: "En attente" },
  { value: "EN_VOL", label: "En vol" },
  { value: "EN_TRANSIT", label: "En transit" },
  { value: "ARRIVE", label: "Arrivé" },
  { value: "LIVRE", label: "Livré" }
] as const;

export type CanonicalManifestStatus = (typeof MANIFEST_STATUS_OPTIONS)[number]["value"] | "INCONNU";

export function normalizeManifestStatus(value: unknown): CanonicalManifestStatus {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const aliases: Record<string, CanonicalManifestStatus> = {
    "EN ATTENTE": "EN_ATTENTE",
    "EN VOL": "EN_VOL",
    "EN TRANSIT": "EN_TRANSIT",
    ARRIVE: "ARRIVE",
    LIVRE: "LIVRE"
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
