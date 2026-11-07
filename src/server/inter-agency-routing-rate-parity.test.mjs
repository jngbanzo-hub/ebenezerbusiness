import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const quoteSource = readFileSync(new URL("./inter-agency-routing.ts", import.meta.url), "utf8");
const departureSource = readFileSync(new URL("./stockages-forwarding-departure.ts", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("../features/stockages/stockages-v2-page.tsx", import.meta.url), "utf8");
const sqlSource = readFileSync(new URL("../../local-preparation/supabase/stockages-v2/023_forwarding_new_cycle_after_correction.sql", import.meta.url), "utf8");

const rates = {
  "FIH-LSHI": 12,
  "FIH-KLZ": 13,
  "LSHI-FIH": 13,
  "LSHI-KLZ": 11,
  "KLZ-FIH": 16,
  "KLZ-LSHI": 13
};

test("menu, devis serveur et validation SQL utilisent les mêmes six tarifs", () => {
  for (const [route, rate] of Object.entries(rates)) {
    const [origin, destination] = route.split("-");
    assert.match(quoteSource, new RegExp(`"${route}": ${rate}(?:,|\\n)`));
    const menuBranch = origin === "FIH"
      ? menuSource.match(/: \[\{ agency: "LSHI", rate: 12 \}, \{ agency: "KLZ", rate: 13 \}\] as const;/)?.[0]
      : origin === "LSHI"
        ? menuSource.match(/\? \[\{ agency: "KLZ", rate: 11 \}, \{ agency: "FIH", rate: 13 \}\] as const/)?.[0]
        : menuSource.match(/\? \[\{ agency: "LSHI", rate: 13 \}, \{ agency: "FIH", rate: 16 \}\] as const/)?.[0];
    assert.ok(menuBranch, `Menu absent pour ${origin}`);
    assert.match(menuBranch, new RegExp(`agency: "${destination}", rate: ${rate}(?: | \\})`));
    assert.match(sqlSource, new RegExp(`v_origin='${origin}' and v_destination='${destination}' then v_rate:=${rate};`));
  }
  assert.match(quoteSource, /amountExpectedUsd: round\(input\.weightKg \* rateUsdPerKg\)/);
  assert.match(departureSource, /const quote = quoteInterAgencyRouting\(/);
  assert.match(departureSource, /p_expected_amount: quote\.amountExpectedUsd, p_rate_usd_per_kg: quote\.rateUsdPerKg/);
  assert.equal(3 * rates["FIH-KLZ"], 39);
});
