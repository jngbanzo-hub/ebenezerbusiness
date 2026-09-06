export type WeightAllocationInput = Readonly<{ key: string; weightKg: number }>;
export type MoneyAllocation = Readonly<{ key: string; amountCents: number; amountUsd: number }>;

export function allocateUsdByWeight(totalUsd: number, entries: readonly WeightAllocationInput[]): readonly MoneyAllocation[] {
  if (!Number.isFinite(totalUsd) || totalUsd < 0) throw new Error("BILAN_INVALID_AMOUNT");
  if (!entries.length) throw new Error("BILAN_ALLOCATION_EMPTY");
  if (entries.some(({ key, weightKg }) => !key || !Number.isFinite(weightKg) || weightKg <= 0)) {
    throw new Error("BILAN_INVALID_ALLOCATION_WEIGHT");
  }
  if (new Set(entries.map(({ key }) => key)).size !== entries.length) throw new Error("BILAN_DUPLICATE_ALLOCATION_KEY");

  const totalCents = Math.round((totalUsd + Number.EPSILON) * 100);
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weightKg, 0);
  let allocatedCents = 0;
  return Object.freeze(entries.map((entry, index) => {
    const isLast = index === entries.length - 1;
    const amountCents = isLast
      ? totalCents - allocatedCents
      : Math.round(totalCents * entry.weightKg / totalWeight);
    allocatedCents += amountCents;
    return Object.freeze({ key: entry.key, amountCents, amountUsd: amountCents / 100 });
  }));
}

export function usdToCents(amountUsd: number) {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new Error("BILAN_INVALID_AMOUNT");
  return Math.round((amountUsd + Number.EPSILON) * 100);
}
