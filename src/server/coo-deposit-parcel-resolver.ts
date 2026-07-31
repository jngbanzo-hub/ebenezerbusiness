import "server-only";

import { createHash } from "node:crypto";

import type { AuthoritativeParcelResolver } from "@/app/api/agent/logistics/coo-deposit-command";
import { normalizeParcelCode } from "../../local-preparation/contracts/stock-event";
import { findPublicTrackingRecordByCode } from "@/server/google-sheets";

const DESTINATION_BY_LABEL = {
  kinshasa: "FIH",
  lubumbashi: "LSHI",
  kolwezi: "KLZ",
} as const;

export const googleSheetsCooDepositParcelResolver: AuthoritativeParcelResolver = {
  async resolveByTrackingCode(rawTrackingCode) {
    const trackingCode = normalizeParcelCode(rawTrackingCode);
    const record = await findPublicTrackingRecordByCode(trackingCode);
    if (record === null) return null;

    const status = normalizeLabel(record.status);
    if (!status.includes("enregistre") && !status.includes("attente")) {
      throw new Error("Le colis n’est pas admissible à une première entrée COO.");
    }

    const destination = resolveDestination(record.destination);
    const weightKg = parseWeightKg(record.weight);
    return Object.freeze({
      parcelId: `parcel-${createHash("sha256").update(trackingCode).digest("hex")}`,
      trackingCode,
      destination,
      weightKg,
      sourceId: `tracking-${createHash("sha256").update(trackingCode).digest("hex")}`,
    });
  },
};

function resolveDestination(value: string): "FIH" | "LSHI" | "KLZ" {
  const normalized = normalizeLabel(value);
  const entry = Object.entries(DESTINATION_BY_LABEL).find(([label]) =>
    normalized.includes(label),
  );
  if (!entry) throw new Error("Destination colis non reconnue.");
  return entry[1];
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseWeightKg(value: string): number {
  const normalized = value.replace(",", ".");
  const match = normalized.match(/\d+(?:\.\d+)?/);
  const weight = match ? Number(match[0]) : Number.NaN;
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new Error("Poids colis invalide.");
  }
  return weight;
}
