import {
  AGENCIES,
  DESTINATIONS,
  type Agency,
  type DestinationCode
} from "@/features/agent/types";

export function isAgency(value: unknown): value is Agency {
  return typeof value === "string" && AGENCIES.includes(value as Agency);
}

export function getAllowedDestinations(agency: Agency): readonly DestinationCode[] {
  if (agency === "COTONOU") {
    return DESTINATIONS;
  }

  return [agency];
}
