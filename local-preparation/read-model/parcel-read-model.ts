import type { CanonicalAgency } from "../contracts/agencies";
import { deepFreeze } from "../contracts/common";
import type { LocationState } from "../contracts/parcel-position";
import type { StockEvent } from "../contracts/stock-event";
import {
  projectArrivalAnomalies,
  rebuildParcelPosition,
} from "../logistics-engine/logistics-engine";

export const AGENT_PARCEL_STATUSES = [
  "EN_ATTENTE",
  "EN_TRANSIT",
  "EN_AGENCE",
  "LIVRE",
  "POSITION_INCONNUE",
] as const;

export type AgentParcelStatus = (typeof AGENT_PARCEL_STATUSES)[number];

export type ActiveArrivalAnomalyReadModel = Readonly<{
  mismatchEventId: string;
  expectedAgency: CanonicalAgency;
  actualAgency: CanonicalAgency;
  occurredAt: string;
  reason: string;
  evidenceReference: string;
}>;

export type ParcelReadModel = Readonly<{
  parcelId: string;
  trackingCode: string;
  destinationInitiale: CanonicalAgency;
  destinationCourante: CanonicalAgency;
  locationState: LocationState;
  currentAgency: CanonicalAgency | null;
  transitFrom: CanonicalAgency | null;
  transitTo: CanonicalAgency | null;
  deliveredAt: string | null;
  version: number;
  updatedAt: string;
  activeArrivalAnomaly: ActiveArrivalAnomalyReadModel | null;
  agentStatus: AgentParcelStatus;
}>;

export type GroupedParcelEvents = Readonly<
  Record<string, readonly StockEvent[]>
>;

export function buildParcelReadModel(
  orderedEvents: readonly StockEvent[],
): ParcelReadModel {
  const position = rebuildParcelPosition(orderedEvents);
  const activeAnomaly = projectArrivalAnomalies(orderedEvents).find(
    (anomaly) => anomaly.status === "ACTIVE",
  );
  const deliveryEvent =
    position.locationState === "DELIVERED"
      ? orderedEvents.find((event) => event.eventId === position.lastEventId)
      : undefined;

  if (
    position.locationState === "DELIVERED" &&
    (deliveryEvent === undefined ||
      (deliveryEvent.eventType !== "SORTIE_LIVRAISON" &&
        deliveryEvent.eventType !== "SORTIE_DESTINATION"))
  ) {
    throw new ParcelReadModelError(
      "DELIVERY_EVENT_MISSING",
      "Événement de livraison final introuvable.",
    );
  }

  return deepFreeze({
    parcelId: position.parcelId,
    trackingCode: position.trackingCode,
    destinationInitiale: position.destinationInitiale,
    destinationCourante: position.destinationCourante,
    locationState: position.locationState,
    currentAgency: position.currentAgency,
    transitFrom: position.transitFrom,
    transitTo: position.transitTo,
    deliveredAt: deliveryEvent?.occurredAt ?? null,
    version: position.version,
    updatedAt: position.updatedAt,
    activeArrivalAnomaly:
      activeAnomaly === undefined
        ? null
        : {
            mismatchEventId: activeAnomaly.mismatchEventId,
            expectedAgency: activeAnomaly.expectedAgency,
            actualAgency: activeAnomaly.actualAgency,
            occurredAt: activeAnomaly.occurredAt,
            reason: activeAnomaly.reason,
            evidenceReference: activeAnomaly.evidenceReference,
          },
    agentStatus: toAgentStatus(position.locationState, position.currentAgency),
  });
}

export function buildParcelReadModels(
  groupedEvents: GroupedParcelEvents,
): Readonly<Record<string, ParcelReadModel>> {
  const models = Object.entries(groupedEvents).map(([groupKey, events]) => {
    const model = buildParcelReadModel(events);
    if (groupKey !== model.parcelId) {
      throw new ParcelReadModelError(
        "PARCEL_GROUP_MISMATCH",
        "Groupe d’événements incohérent.",
      );
    }
    return [groupKey, model] as const;
  });
  return deepFreeze(Object.fromEntries(models));
}

export function formatAgentLocationLabel(readModel: ParcelReadModel): string {
  if (readModel.activeArrivalAnomaly !== null) {
    return `Arrivée inattendue à ${readModel.activeArrivalAnomaly.actualAgency} (attendue : ${readModel.activeArrivalAnomaly.expectedAgency})`;
  }
  switch (readModel.agentStatus) {
    case "EN_ATTENTE":
      return `En attente à ${readModel.currentAgency ?? "COO"}`;
    case "EN_TRANSIT":
      return `En transit de ${readModel.transitFrom ?? "inconnue"} vers ${readModel.transitTo ?? "inconnue"}`;
    case "EN_AGENCE":
      return `En agence à ${readModel.currentAgency ?? "inconnue"}`;
    case "LIVRE":
      return "Livré";
    case "POSITION_INCONNUE":
      return "Position inconnue";
  }
}

export class ParcelReadModelError extends Error {
  readonly code: "DELIVERY_EVENT_MISSING" | "PARCEL_GROUP_MISMATCH";

  constructor(
    code: "DELIVERY_EVENT_MISSING" | "PARCEL_GROUP_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "ParcelReadModelError";
    this.code = code;
  }
}

function toAgentStatus(
  locationState: LocationState,
  currentAgency: CanonicalAgency | null,
): AgentParcelStatus {
  switch (locationState) {
    case "UNKNOWN":
      return "POSITION_INCONNUE";
    case "IN_TRANSIT":
      return "EN_TRANSIT";
    case "DELIVERED":
      return "LIVRE";
    case "AT_AGENCY":
      return currentAgency === "COO" ? "EN_ATTENTE" : "EN_AGENCE";
  }
}
