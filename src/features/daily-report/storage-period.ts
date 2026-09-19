export type StorageLedgerRow = Readonly<Record<string, unknown>>;

const ARRIVAL_EVENTS = new Set(["MANUAL_ARRIVAL_RECORDED", "ARRIVAGE_ACHEMINEMENT"]);
const DEPARTURE_EVENTS = new Set([
  "CONFIRMED_DELIVERY_RECORDED",
  "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION",
  "SORTIE_APRES_REMISE_COLIS_PAYE_COO",
  "SORTIE_APRES_REMISE_ACHEMINEMENT"
]);

export function buildStoragePeriodSummary(ledger: readonly StorageLedgerRow[], from: string, to: string) {
  const opening = ledger.filter((row) => String(row.business_date) < from);
  const period = ledger.filter((row) => String(row.business_date) >= from && String(row.business_date) <= to);
  const arrivals = period.filter((row) => ARRIVAL_EVENTS.has(String(row.event_type)));
  const departures = period.filter((row) => DEPARTURE_EVENTS.has(String(row.event_type)));
  const openingParcels = sum(opening, "parcel_count_delta");
  const openingWeightKg = sum(opening, "weight_kg_delta");

  return Object.freeze({
    openingParcels,
    openingWeightKg,
    arrivalsParcels: Math.abs(sum(arrivals, "parcel_count_delta")),
    arrivalsWeightKg: Math.abs(sum(arrivals, "weight_kg_delta")),
    departuresParcels: Math.abs(sum(departures, "parcel_count_delta")),
    departuresWeightKg: Math.abs(sum(departures, "weight_kg_delta")),
    closingParcels: openingParcels + sum(period, "parcel_count_delta"),
    closingWeightKg: round(openingWeightKg + sum(period, "weight_kg_delta"))
  });
}

function sum(rows: readonly StorageLedgerRow[], field: string) {
  return round(rows.reduce((total, row) => total + Number(row[field] ?? 0), 0));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
