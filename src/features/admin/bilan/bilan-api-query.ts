import { getBilanCohorts } from "./cohort-registry";
import { parseBilanQuery } from "./bilan-query-validation";
export { BILAN_ALLOWED_METHODS } from "./bilan-query-validation";
export type { BilanApiQuery, BilanQueryResult } from "./bilan-query-validation";

export function parseBilanApiQuery(url: string) {
  return parseBilanQuery(url, getBilanCohorts());
}
