export const MONTHLY_FIXED_COSTS_USD = Object.freeze({
  COO: Object.freeze({ amountUsd: 770, components: Object.freeze(["Salaire", "Loyer", "Connexion"]) }),
  FIH: Object.freeze({ amountUsd: 540, components: Object.freeze(["Salaire", "Connexion"]) }),
  LSHI: Object.freeze({ amountUsd: 950, components: Object.freeze(["Salaire", "Loyer", "Eau et Électricité", "Chauffeur", "Connexion"]) }),
  KLZ: Object.freeze({ amountUsd: 130, components: Object.freeze(["Salaire"]) })
});

const KLZ_RENT = Object.freeze({ amountUsd: 100, component: "Loyer", effectiveFrom: "2026-11-01" });

export function calculateMonthlyFixedCosts(analysisMonth: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(analysisMonth)) throw new Error("Mois d'analyse invalide pour les charges fixes.");
  const rentApplies = `${analysisMonth}-01` >= KLZ_RENT.effectiveFrom;
  const definitions = Object.freeze({
    ...MONTHLY_FIXED_COSTS_USD,
    KLZ: rentApplies
      ? Object.freeze({ amountUsd: MONTHLY_FIXED_COSTS_USD.KLZ.amountUsd + KLZ_RENT.amountUsd, components: Object.freeze([...MONTHLY_FIXED_COSTS_USD.KLZ.components, KLZ_RENT.component]) })
      : MONTHLY_FIXED_COSTS_USD.KLZ
  });
  const byAgency = Object.freeze(Object.fromEntries(
    Object.entries(definitions).map(([agency, definition]) => [agency, definition.amountUsd])
  ) as Record<keyof typeof MONTHLY_FIXED_COSTS_USD, number>);
  return Object.freeze({
    basis: "BILAN_ANALYSIS_MONTH" as const,
    byAgency,
    totalUsd: Object.values(byAgency).reduce((total, amount) => total + amount, 0),
    definitions
  });
}

export function isFixedCostExpenseCategory(value: string, agency: string, analysisMonth?: string) {
  const category = normalize(value);
  const fixedByAgency: Readonly<Record<string, ReadonlySet<string>>> = {
    COO: new Set(["salaire", "loyer", "connexion"]),
    FIH: new Set(["salaire"]),
    LSHI: new Set(["salaire", "loyer", "eau", "electricite", "eau et electricite", "chauffeur"]),
    KLZ: new Set(analysisMonth && `${analysisMonth}-01` >= KLZ_RENT.effectiveFrom ? ["salaire", "loyer"] : ["salaire"])
  };
  return fixedByAgency[agency.trim().toUpperCase()]?.has(category) ?? false;
}

function normalize(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}
