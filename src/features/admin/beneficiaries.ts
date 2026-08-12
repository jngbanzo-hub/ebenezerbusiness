import type { ManifestShipperRow, ManifestSite } from "@/features/admin/types";

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const PHONE_PATTERN = /(\+?\d(?:[\d\s()./-]*\d))\s*$/;
const DESTINATION: Record<ManifestSite, string> = { FIH: "Kinshasa", LSHI: "Lubumbashi", KLZ: "Kolwezi" };

export type BeneficiaryParcel = { id: string; date: string; code: string; agency: ManifestSite; weightKg: number; destination: string; status: string };
export type BeneficiaryRanking = { key: string; name: string; phone: string; agency: ManifestSite; parcelCount: number; totalWeightKg: number; averageWeightKg: number; lastReceiptDate: string; parcels: BeneficiaryParcel[] };
export type BeneficiaryStatistics = { startDate: string; endDate: string; byAgency: Record<ManifestSite, { byParcels: BeneficiaryRanking[]; byWeight: BeneficiaryRanking[] }> };

export function normalizeBeneficiary(value: string) {
  const cleaned = value.normalize("NFC").replace(/\u00a0/g, " ").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  const match = cleaned.match(PHONE_PATTERN);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  const name = cleaned.slice(0, match.index).replace(/[()|/\\-]+/g, " ").replace(/\s+/g, " ").trim() || "Nom non renseigné";
  return { name, phone: digits };
}

export function calculateBeneficiaryStatistics(rows: ManifestShipperRow[], startDate: string, endDate: string): BeneficiaryStatistics {
  const uniqueParcels = new Map<string, { row: ManifestShipperRow; date: string; code: string; beneficiary: NonNullable<ReturnType<typeof normalizeBeneficiary>>; weight: number }>();
  for (const row of rows) {
    const date = parseDate(row.dateRaw);
    const beneficiary = normalizeBeneficiary(row.beneficiaireRaw ?? "");
    const code = row.codeColisRaw.normalize("NFC").replace(/\s+/g, "").toUpperCase();
    const weight = parseWeight(row.poidsRaw);
    if (!date || date < startDate || date > endDate || !beneficiary || !code || weight === null) continue;
    const key = `${row.sourceSite}:${code}`;
    const current = uniqueParcels.get(key);
    if (!current || `${date}:${row.rowNumber}` < `${current.date}:${current.row.rowNumber}`) uniqueParcels.set(key, { row, date, code, beneficiary, weight });
  }

  const groups = new Map<string, BeneficiaryRanking>();
  for (const item of Array.from(uniqueParcels.values())) {
    const key = `${item.row.sourceSite}:${item.beneficiary.phone}`;
    const agency: ManifestSite = item.row.sourceSite;
    const parcel: BeneficiaryParcel = { id: `${agency}-${item.code}`, date: item.date, code: item.code, agency, weightKg: item.weight, destination: DESTINATION[agency], status: String(item.row.statutRaw ?? "").trim() || "—" };
    const existing = groups.get(key);
    if (!existing) groups.set(key, { key, name: item.beneficiary.name, phone: item.beneficiary.phone, agency: item.row.sourceSite, parcelCount: 1, totalWeightKg: item.weight, averageWeightKg: item.weight, lastReceiptDate: item.date, parcels: [parcel] });
    else {
      existing.parcelCount += 1; existing.totalWeightKg += item.weight; existing.averageWeightKg = existing.totalWeightKg / existing.parcelCount; existing.parcels.push(parcel);
      if (item.date >= existing.lastReceiptDate) { existing.lastReceiptDate = item.date; existing.name = item.beneficiary.name; }
    }
  }
  const byAgency = Object.fromEntries((["FIH", "LSHI", "KLZ"] as ManifestSite[]).map((agency) => {
    const values: BeneficiaryRanking[] = Array.from(groups.values()).filter((x) => x.agency === agency).map((x) => ({ ...x, totalWeightKg: round(x.totalWeightKg), averageWeightKg: round(x.averageWeightKg), parcels: x.parcels.sort((a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code)) }));
    return [agency, { byParcels: [...values].sort((a,b) => b.parcelCount-a.parcelCount || b.totalWeightKg-a.totalWeightKg || a.name.localeCompare(b.name,"fr")).slice(0,10), byWeight: [...values].sort((a,b) => b.totalWeightKg-a.totalWeightKg || b.parcelCount-a.parcelCount || a.name.localeCompare(b.name,"fr")).slice(0,10) }];
  })) as BeneficiaryStatistics["byAgency"];
  return { startDate, endDate, byAgency };
}

function parseDate(value: string) { const m = value.trim().match(DATE_PATTERN); if (!m) return null; const d = `${m[3]}-${m[2]}-${m[1]}`; const date = new Date(`${d}T00:00:00Z`); return date.getUTCFullYear() === +m[3] && date.getUTCMonth()+1 === +m[2] && date.getUTCDate() === +m[1] ? d : null; }
function parseWeight(value: string | number) { const n = typeof value === "number" ? value : Number(value.trim().replace(/\s*(?:kg|kgs)\s*$/i, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; }
function round(value: number) { return Math.round(value * 100) / 100; }
