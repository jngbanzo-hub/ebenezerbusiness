import "server-only";

import { createClient } from "@supabase/supabase-js";

import { MANIFEST_SITES, type ManifestSite } from "@/features/admin/types";
import { readCanonicalManifestRange } from "@/server/admin-manifest-sheets";
import {
  evaluateManifestQrCandidates,
  normalizeQrNumber,
  type ActiveParcelAssignment,
  type ManifestQrRegistryRow,
  type ManifestQrSourceRow
} from "@/server/qr-manifest-candidate-evaluator";

export async function readManifestQrCandidates() {
  const sourceRows = await readManifestQrSourceRows();
  const numbers = Array.from(new Set(
    sourceRows.map((row) => normalizeQrNumber(row.qrNumber)).filter((value) => /^[1-9][0-9]{0,14}$/.test(value))
  )).map(Number);
  const [registry, activeAssignments] = await Promise.all([
    readQrRegistry(numbers),
    readActiveParcelAssignments()
  ]);
  const candidates = evaluateManifestQrCandidates(sourceRows, registry, activeAssignments);
  return Object.freeze({
    candidates: Object.freeze(candidates),
    readyCount: candidates.filter((candidate) => candidate.ready).length
  });
}

async function readManifestQrSourceRows(): Promise<ManifestQrSourceRow[]> {
  const ranges = await Promise.all(MANIFEST_SITES.map(async (agency) => ({
    agency,
    values: await readCanonicalManifestRange(`${agency}!A:H`)
  })));
  return ranges.flatMap(({ agency, values }) => values.flatMap((row, index) => {
    if (isHeader(row) || row.every((cell) => String(cell ?? "").trim() === "")) return [];
    return [{
      agency,
      rowNumber: index + 1,
      date: cell(row, 0),
      trackingCode: cell(row, 1),
      qrNumber: cell(row, 7)
    }];
  }));
}

async function readQrRegistry(numbers: number[]): Promise<ManifestQrRegistryRow[]> {
  if (!numbers.length) return [];
  const client = serviceClient();
  const { data, error } = await client.rpc("read_qr_manifest_registry_server", {
    p_display_numbers: numbers
  });
  if (error || !data || typeof data !== "object") throw new Error("QR_SERVICE_UNAVAILABLE");
  const registry = Array.isArray(data.registry) ? data.registry : [];
  return registry.map((row: Record<string, unknown>) => ({
    qrId: String(row.qrId),
    displayNumber: Number(row.displayNumber),
    status: String(row.status) as ManifestQrRegistryRow["status"],
    version: Number(row.version)
  }));
}

async function readActiveParcelAssignments(): Promise<ActiveParcelAssignment[]> {
  const { data, error } = await serviceClient().rpc("read_qr_manifest_registry_server", {
    p_display_numbers: []
  });
  if (error || !data || typeof data !== "object") throw new Error("QR_SERVICE_UNAVAILABLE");
  const assignments = Array.isArray(data.activeAssignments) ? data.activeAssignments : [];
  return assignments.flatMap((row: Record<string, unknown>) => {
    const agency = String(row.agency) as ManifestSite;
    const trackingCode = String(row.trackingCode ?? "");
    return MANIFEST_SITES.includes(agency) && trackingCode
      ? [{ qrId: String(row.qrId), agency, trackingCode }]
      : [];
  });
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("QR_SERVICE_UNAVAILABLE");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}

function cell(row: unknown[], index: number) { return String(row[index] ?? "").trim(); }
function isHeader(row: unknown[]) { return cell(row, 0).toLocaleLowerCase("fr-FR") === "date" && cell(row, 1).toLocaleLowerCase("fr-FR") === "code colis"; }
