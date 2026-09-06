import type { BilanAnomaly } from "./data-quality";
import { bilanAnomaly } from "./data-quality";
import type { ShipmentContext, ShipmentGroup, ShipmentParcel } from "./bilan-contracts";
import { createParcelIdentity, parcelIdentityKey } from "./parcel-identity";

const GROUP_HEADING = /(?:^|\s)((?:GROU?PAGE|GRP)\s*[- ]?\s*\d+)\b/gi;
const PARCEL_WITH_WEIGHT = /\b([A-Z]{1,10}[ \t]*-?[ \t]*\d{2,}(?:[ \t]*[A-Z]{1,5})?)\s*:\s*(-?\d+(?:[.,]\d+)?)\s*(?:KGS?|KILOGRAMMES?)\b/gi;

export type ShipmentGroupParseResult = Readonly<{
  groups: readonly ShipmentGroup[];
  anomalies: readonly BilanAnomaly[];
}>;

export function parseShipmentGroups(details: string, context: ShipmentContext): ShipmentGroupParseResult {
  const normalizedDetails = String(details ?? "").replace(/\r\n?/g, "\n");
  const headings = Array.from(normalizedDetails.matchAll(GROUP_HEADING));
  if (!headings.length) {
    return {
      groups: [],
      anomalies: [bilanAnomaly("GROUPAGE_NON_SEGMENTABLE", {
        source: `${context.sourceSheet}!${context.sourceRow}`,
        identity: shipmentRowIdentity(context),
        message: "Aucun en-tête GROUPAGE exploitable n’a été trouvé."
      })]
    };
  }

  const anomalies: BilanAnomaly[] = [];
  const groups = headings.flatMap((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? normalizedDetails.length;
    const label = heading[1].trim();
    const block = normalizedDetails.slice(start, end);
    const parcels = parseParcels(block, context, label, anomalies);
    if (!parcels.length) {
      anomalies.push(bilanAnomaly("GROUPAGE_NON_SEGMENTABLE", {
        source: `${context.sourceSheet}!${context.sourceRow}`,
        identity: groupIdentityKey(context, label),
        message: "Le groupage ne contient aucun code avec un poids positif exploitable."
      }));
      return [];
    }
    return [Object.freeze({
      label,
      canonicalLabel: canonicalGroupLabel(label),
      identityKey: groupIdentityKey(context, label),
      context,
      parcels: Object.freeze(parcels)
    })];
  });

  return { groups: Object.freeze(groups), anomalies: Object.freeze(anomalies) };
}

export function deduplicateShipmentParcels(group: ShipmentGroup) {
  const byIdentity = new Map<string, ShipmentParcel>();
  const conflicted = new Set<string>();
  const anomalies: BilanAnomaly[] = [];
  for (const parcel of group.parcels) {
    const key = `${group.identityKey}|${parcelIdentityKey(parcel.identity)}`;
    const previous = byIdentity.get(key);
    if (!previous) {
      byIdentity.set(key, parcel);
      continue;
    }
    if (previous.weightKg === parcel.weightKg) {
      anomalies.push(bilanAnomaly("IDENTITE_CONFLICTUELLE", {
        source: `${parcel.identity.sourceSheet}!${parcel.identity.sourceRow}`,
        identity: key,
        message: "Occurrence strictement répétée : une seule occurrence est conservée.",
        details: { repeated: true, weightKg: parcel.weightKg }
      }));
      continue;
    }
    conflicted.add(key);
    anomalies.push(bilanAnomaly("POIDS_DIVERGENT", {
      source: `${parcel.identity.sourceSheet}!${parcel.identity.sourceRow}`,
      identity: key,
      message: "La même identité possède plusieurs poids : aucune version n’est sélectionnée.",
      details: { firstWeightKg: previous.weightKg, secondWeightKg: parcel.weightKg }
    }));
  }
  return {
    parcels: Object.freeze(Array.from(byIdentity.entries()).flatMap(([key, parcel]) => conflicted.has(key) ? [] : [parcel])),
    anomalies: Object.freeze(anomalies)
  };
}

function parseParcels(block: string, context: ShipmentContext, label: string, anomalies: BilanAnomaly[]) {
  const parcels: ShipmentParcel[] = [];
  for (const match of Array.from(block.matchAll(PARCEL_WITH_WEIGHT))) {
    const rawCode = match[1].trim();
    const weightKg = Number(match[2].replace(",", "."));
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      anomalies.push(bilanAnomaly("POIDS_ABSENT", {
        source: `${context.sourceSheet}!${context.sourceRow}`,
        identity: `${groupIdentityKey(context, label)}|${rawCode}`,
        message: "Le poids individuel est absent ou non positif."
      }));
      continue;
    }
    parcels.push(Object.freeze({
      identity: createParcelIdentity({
        rawCode,
        structuredAgency: context.destination,
        sourceSheet: context.sourceSheet,
        sourceRow: context.sourceRow
      }),
      weightKg
    }));
  }
  return parcels;
}

function canonicalGroupLabel(label: string) {
  return label.trim().toUpperCase().replace(/\s+/g, " ").replace(/GROU?PAGE/, "GROUPAGE");
}

function shipmentRowIdentity(context: ShipmentContext) {
  return `${context.shipmentDate}|${context.company.trim().toUpperCase()}|${context.destination}|${context.sourceSheet}|${context.sourceRow}`;
}

function groupIdentityKey(context: ShipmentContext, label: string) {
  return `${context.shipmentDate}|${context.company.trim().toUpperCase()}|${context.destination}|${canonicalGroupLabel(label)}|${context.sourceSheet}|${context.sourceRow}`;
}
