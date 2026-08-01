import "server-only";

import { MANIFEST_STATISTICS_SHEET, parseManifestStatistics } from "@/features/admin/manifest-statistics";
import { parseShipmentStatistics, SHIPMENT_STATISTICS_SHEET } from "@/features/admin/shipment-statistics";
import { type ParcelDestination, type RawParcelStatusRow } from "@/features/admin/parcel-status-statistics";
import { readAdminManifestRange } from "@/server/admin-manifest-sheets";

export async function readManifestStatistics() {
  return parseManifestStatistics(await readAdminManifestRange(`'${MANIFEST_STATISTICS_SHEET}'!A1:I86`));
}

export async function readShipmentStatistics() {
  return parseShipmentStatistics(await readAdminManifestRange(`'${SHIPMENT_STATISTICS_SHEET}'!A1:N1035`));
}

export async function readParcelStatusRows(): Promise<RawParcelStatusRow[]> {
  const destinations: ParcelDestination[] = ["FIH", "LSHI", "KLZ"];
  const ranges = await Promise.all(destinations.map(async (destination) => ({ destination, values: await readAdminManifestRange(`${destination}!A2:H11000`) })));
  return ranges.flatMap(({ destination, values }) => values.map((row, index) => ({ destination, rowNumber: index + 2, dateRaw: row[0], codeRaw: row[1], weightRaw: row[4], statusRaw: row[7] })));
}
