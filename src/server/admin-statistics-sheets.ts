import "server-only";

import { MANIFEST_STATISTICS_SHEET, parseManifestStatistics } from "@/features/admin/manifest-statistics";
import { parseShipmentStatistics, SHIPMENT_STATISTICS_SHEET } from "@/features/admin/shipment-statistics";
import { readAdminManifestRange } from "@/server/admin-manifest-sheets";

export async function readManifestStatistics() {
  return parseManifestStatistics(await readAdminManifestRange(`'${MANIFEST_STATISTICS_SHEET}'!A1:I86`));
}

export async function readShipmentStatistics() {
  return parseShipmentStatistics(await readAdminManifestRange(`'${SHIPMENT_STATISTICS_SHEET}'!A1:N1035`));
}
