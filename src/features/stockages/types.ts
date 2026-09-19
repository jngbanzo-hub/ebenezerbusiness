export const STOCKAGES_SITES = ["COO", "FIH", "LSHI", "KLZ"] as const;

export type StockagesSite = (typeof STOCKAGES_SITES)[number];

export type StockagesInitialBalanceStatus = {
  site: StockagesSite;
  status: "BROUILLON" | "VALIDÉ" | null;
};

export type StockagesPreparationStatus = {
  mode: "PREPARATION";
  systemStatus: string | null;
  activationDate: string | null;
  realSyncEnabled: false;
  initialBalances: StockagesInitialBalanceStatus[];
  snapshot: {
    present: boolean;
    status: string | null;
  };
  lastSimulation: {
    date: string;
    result: string;
  } | null;
  anomalies: {
    blocking: number | null;
    result: string | null;
  };
  lastUpdatedAt: string | null;
};
