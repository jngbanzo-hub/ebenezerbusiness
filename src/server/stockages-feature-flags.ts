import "server-only";

export function assertStockagesPreparationMode() {
  if (process.env.STOCKAGES_REAL_SYNC_ENABLED === "true") {
    throw new Error(
      "Le module web Stockages doit rester en mode préparation."
    );
  }
}
