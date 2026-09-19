import "server-only";

export type StockagesServerFeatureFlags = {
  realSyncEnabled: boolean;
  adminActionsEnabled: boolean;
  adjustmentsEnabled: boolean;
  exportsEnabled: boolean;
};

export function getStockagesServerFeatureFlags(): StockagesServerFeatureFlags {
  return {
    realSyncEnabled: process.env.STOCKAGES_REAL_SYNC_ENABLED === "true",
    adminActionsEnabled:
      process.env.STOCKAGES_ADMIN_ACTIONS_ENABLED === "true",
    adjustmentsEnabled:
      process.env.STOCKAGES_ADJUSTMENTS_ENABLED === "true",
    exportsEnabled: process.env.STOCKAGES_EXPORTS_ENABLED === "true"
  };
}

export function assertStockagesPreparationMode() {
  const flags = getStockagesServerFeatureFlags();

  if (
    flags.realSyncEnabled ||
    flags.adminActionsEnabled ||
    flags.adjustmentsEnabled ||
    flags.exportsEnabled
  ) {
    throw new Error(
      "Le module web Stockages doit rester en mode préparation."
    );
  }
}
