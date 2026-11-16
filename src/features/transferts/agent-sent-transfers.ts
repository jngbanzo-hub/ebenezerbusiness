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

function creationTime(transfer: TransferSummary): number {
  const time = Date.parse(transfer.createdAt);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
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
  ).sort((left, right) => {
    const leftTime = creationTime(left);
    const rightTime = creationTime(right);
    if (leftTime !== rightTime) return rightTime - leftTime;
    if (left.transferId === right.transferId) return 0;
    return left.transferId < right.transferId ? -1 : 1;
  });
}
