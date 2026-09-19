export type ShipmentStatusUpdateResponse = {
  updatedRange?: string;
  updatedCells?: number;
  updatedData?: { range?: string; values?: unknown[][] };
  error?: { message?: string };
};

export function assertShipmentStatusWriteConfirmed(responseOk: boolean, payload: ShipmentStatusUpdateResponse, rowNumber: number, expectedStatus: string) {
  const expectedRange = `!K${rowNumber}`;
  const returnedStatus = String(payload.updatedData?.values?.[0]?.[0] ?? "").trim();
  const rangeConfirmed = payload.updatedRange?.toUpperCase().endsWith(expectedRange) && payload.updatedData?.range?.toUpperCase().endsWith(expectedRange);
  if (!responseOk || payload.updatedCells !== 1 || !rangeConfirmed || returnedStatus !== expectedStatus) {
    throw new Error(payload.error?.message ?? "La réponse Google ne confirme pas la valeur écrite dans la colonne K.");
  }
}
