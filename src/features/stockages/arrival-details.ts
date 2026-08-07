export type ParsedArrival = Readonly<{ trackingCode: string; weightKg: number }>;

export function parseArrivalDetails(value: string): readonly ParsedArrival[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return Object.freeze([]);
  const parcels = lines.map((line) => {
    const match = line.match(/^([A-Z0-9][A-Z0-9._/-]{1,63})\s*:\s*(\d+(?:[.,]\d+)?)\s*KGS?$/i);
    if (!match) throw new Error(`Ligne invalide : ${line}`);
    const weightKg = Number(match[2].replace(",", "."));
    if (!Number.isFinite(weightKg) || weightKg <= 0) throw new Error(`Poids invalide : ${line}`);
    return Object.freeze({ trackingCode: match[1].toUpperCase(), weightKg });
  });
  if (new Set(parcels.map((parcel) => parcel.trackingCode)).size !== parcels.length) {
    throw new Error("Un code colis est présent plusieurs fois.");
  }
  return Object.freeze(parcels);
}

export function summarizeArrivalDetails(value: string) {
  try {
    const parcels = parseArrivalDetails(value);
    return Object.freeze({ parcels, count: parcels.length, totalWeightKg: round(parcels.reduce((sum, parcel) => sum + parcel.weightKg, 0)), error: "" });
  } catch (cause) {
    return Object.freeze({ parcels: Object.freeze([]) as readonly ParsedArrival[], count: 0, totalWeightKg: 0, error: cause instanceof Error ? cause.message : "Saisie invalide." });
  }
}

function round(value: number) { return Math.round((value + Number.EPSILON) * 1000) / 1000; }
