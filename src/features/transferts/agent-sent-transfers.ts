import {
  TRANSFER_CIRCUITS,
  type TransferAgency,
  type TransferStatus,
  type TransferSummary
} from "@/features/transferts/types";

export function sentDestinationsForAgency(agency: TransferAgency): TransferAgency[] {
  return TRANSFER_CIRCUITS
    .map((circuit) => circuit.split(">") as [TransferAgency, TransferAgency])
    .filter(([origin]) => origin === agency)
    .map(([, destination]) => destination);
}

export function visibleSentTransfers(
  transfers: TransferSummary[],
  agency: TransferAgency,
  destination: TransferAgency | "",
  status: TransferStatus | "",
  search: string
): TransferSummary[] {
  if (!destination || !sentDestinationsForAgency(agency).includes(destination)) return [];
  const transferIdQuery = search.trim().toLowerCase();
  return transfers.filter((transfer) =>
    transfer.agencyFrom === agency &&
    transfer.agencyTo === destination &&
    (!status || transfer.status === status) &&
    (!transferIdQuery || transfer.transferId.toLowerCase().includes(transferIdQuery))
  );
}
