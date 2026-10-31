import {
  TRANSFER_CIRCUITS,
  type TransferAgency,
  type TransferStatus,
  type TransferSummary
} from "@/features/transferts/types";

export function receivedOriginsForAgency(agency: TransferAgency): TransferAgency[] {
  return TRANSFER_CIRCUITS
    .map((circuit) => circuit.split(">") as [TransferAgency, TransferAgency])
    .filter(([, destination]) => destination === agency)
    .map(([origin]) => origin);
}

export function visibleAgentTransfers(
  transfers: TransferSummary[],
  agency: TransferAgency,
  direction: "SENT" | "RECEIVED",
  origin: TransferAgency | "",
  status: TransferStatus | "",
  search: string
): TransferSummary[] {
  const transferIdQuery = search.trim().toLowerCase();
  const visible = transfers.filter((transfer) =>
    (direction === "SENT"
      ? transfer.agencyFrom === agency
      : transfer.agencyTo === agency && (!origin || transfer.agencyFrom === origin)) &&
    (!status || transfer.status === status) &&
    (!transferIdQuery || transfer.transferId.toLowerCase().includes(transferIdQuery))
  );

  if (direction === "SENT") return visible;
  return visible.sort((first, second) => {
    const firstDate = Date.parse(first.sentAt);
    const secondDate = Date.parse(second.sentAt);
    const firstValid = Number.isFinite(firstDate);
    const secondValid = Number.isFinite(secondDate);
    if (!firstValid || !secondValid) return Number(secondValid) - Number(firstValid);
    return secondDate - firstDate;
  });
}
