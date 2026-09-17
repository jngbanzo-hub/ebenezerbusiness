import { AsyncLocalStorage } from "node:async_hooks";
import type { CohortDefinition } from "./bilan-contracts";
import { resolveCatalogCohort, validateCohortDefinitions } from "./cohort-catalog";
export { canonicalParcelCode, monthPeriod } from "./cohort-catalog";

// Immutable request-scoped snapshot; never substitute a static fallback.
const registry = new AsyncLocalStorage<readonly CohortDefinition[]>();

export function getBilanCohorts() {
  const snapshot = registry.getStore();
  if (!snapshot) throw new Error("BILAN_REGISTRY_UNAVAILABLE");
  return snapshot;
}

export function withBilanCohorts<T>(definitions: readonly CohortDefinition[], run: () => T): T {
  validateCohortDefinitions(definitions);
  const snapshot = Object.freeze(definitions.map(item => Object.freeze({ ...item })));
  return registry.run(snapshot, run);
}

export function resolveCohort(rawCode: string) {
  return resolveCatalogCohort(rawCode, getBilanCohorts());
}
