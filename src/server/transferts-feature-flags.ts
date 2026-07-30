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

export function areTransfertsWritesEnabled() {
  return getTransfertsFeatureFlags().writesEnabled;
}

/**
 * Kept for compatibility with read routes. Reads are intentionally available
 * regardless of the write flag.
 */
export function assertTransfertsReadOnlyMode() {
  return;
}
