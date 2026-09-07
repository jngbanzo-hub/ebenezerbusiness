export const MONTHLY_FIXED_COSTS_USD = Object.freeze({
  COO: Object.freeze({ amountUsd: 770, components: Object.freeze(["Salaire", "Loyer", "Connexion"]) }),
  FIH: Object.freeze({ amountUsd: 540, components: Object.freeze(["Salaire", "Connexion"]) }),
  LSHI: Object.freeze({ amountUsd: 950, components: Object.freeze(["Salaire", "Loyer", "Eau et Électricité", "Chauffeur", "Connexion"]) }),
  KLZ: Object.freeze({ amountUsd: 130, components: Object.freeze(["Salaire"]) })
});

export function calculateMonthlyFixedCosts() {
  const byAgency = Object.freeze(Object.fromEntries(
    Object.entries(MONTHLY_FIXED_COSTS_USD).map(([agency, definition]) => [agency, definition.amountUsd])
  ) as Record<keyof typeof MONTHLY_FIXED_COSTS_USD, number>);
  return Object.freeze({
    basis: "BILAN_ANALYSIS_MONTH" as const,
    byAgency,
    totalUsd: Object.values(byAgency).reduce((total, amount) => total + amount, 0),
    definitions: MONTHLY_FIXED_COSTS_USD
  });
}

export function isFixedCostExpenseCategory(value: string) {
  return new Set(["salaire", "loyer", "connexion", "eau", "electricite", "eau et electricite", "chauffeur"]).has(normalize(value));
}

function normalize(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}
