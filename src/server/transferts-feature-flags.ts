import "server-only";

export type TransfertsFeatureFlags = {
  writesEnabled: boolean;
  adminEnabled: boolean;
};

export function getTransfertsFeatureFlags(): TransfertsFeatureFlags {
  return {
    writesEnabled: process.env.TRANSFERTS_API_WRITES_ENABLED === "true",
    adminEnabled: process.env.TRANSFERTS_ADMIN_API_ENABLED === "true"
  };
}

export function assertTransfertsReadOnlyMode() {
  if (getTransfertsFeatureFlags().writesEnabled) {
    throw new Error("TRANSFERTS_WRITES_NOT_AUTHORIZED");
  }
}
