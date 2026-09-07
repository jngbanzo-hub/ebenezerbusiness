import assert from "node:assert/strict";
import test from "node:test";
import { aggregateMonthlyAgentBonuses, applyMonthlyBonuses, type MonthlyAgentBonus } from "./monthly-bonus-aggregations";

const row = (agentId: string, agency: MonthlyAgentBonus["agency"], amountUsd: number | null, status: MonthlyAgentBonus["status"] = "CERTIFIEE"): MonthlyAgentBonus => ({ id: agentId, monthOrigin: "2026-08", agentId, agentName: agentId, agency, amountUsd, status, decidedAt: null, decidedBy: null, note: null, createdAt: "2026-08-31", updatedAt: "2026-08-31" });

test("agrège 50 et 100 USD par agent, agence et EEB", () => {
  const result = aggregateMonthlyAgentBonuses("2026-08", [row("A", "FIH", 50), row("B", "FIH", 100), row("C", "LSHI", 100), row("D", "KLZ", 50), row("E", "COO", 150)]);
  assert.deepEqual(result.byAgency, { COO: 150, FIH: 150, LSHI: 100, KLZ: 50 });
  assert.equal(result.totalUsd, 450);
  assert.equal(result.status, "CERTIFIE");
});

test("une prime non définie rend le bénéfice après prime provisoire", () => {
  const bonuses = aggregateMonthlyAgentBonuses("2026-08", []);
  const result = applyMonthlyBonuses({ byAgency: { FIH: { amountUsd: 100 }, LSHI: { amountUsd: 200 }, KLZ: { amountUsd: 300 } }, centralCoo: { totalCostsUsd: 50 }, consolidated: { amountUsd: 550 } }, bonuses);
  assert.equal(bonuses.status, "A_DEFINIR");
  assert.equal(result.status, "PROVISOIRE");
  assert.equal(result.afterBonusUsd, 550);
});

test("une prime certifiée à zéro est explicite et certifiable", () => {
  const bonuses = aggregateMonthlyAgentBonuses("2026-08", [row("A", "FIH", 0), row("B", "LSHI", 0), row("C", "KLZ", 0), row("D", "COO", 0)]);
  assert.equal(bonuses.status, "CERTIFIE");
  assert.equal(bonuses.totalUsd, 0);
});

test("FIH/LSHI/KLZ réduisent leur agence et COO uniquement le consolidé", () => {
  const bonuses = aggregateMonthlyAgentBonuses("2026-08", [row("A", "FIH", 50), row("B", "LSHI", 100), row("C", "KLZ", 25), row("D", "COO", 75)]);
  const result = applyMonthlyBonuses({ byAgency: { FIH: { amountUsd: 1000 }, LSHI: { amountUsd: 2000 }, KLZ: { amountUsd: 3000 } }, centralCoo: { totalCostsUsd: 500 }, consolidated: { amountUsd: 5500 } }, bonuses);
  assert.deepEqual(result.byAgency, { FIH: { beforeBonusUsd: 1000, bonusUsd: 50, afterBonusUsd: 950 }, LSHI: { beforeBonusUsd: 2000, bonusUsd: 100, afterBonusUsd: 1900 }, KLZ: { beforeBonusUsd: 3000, bonusUsd: 25, afterBonusUsd: 2975 } });
  assert.equal(result.centralCooBonusUsd, 75);
  assert.equal(result.afterBonusUsd, 5250);
  assert.equal(result.reconciliationDifferenceUsd, 0);
});

test("décision PDG août: 12 bénéficiaires, 600 USD et bénéfices attendus", () => {
  const rows = [
    ...["Christian Sacre", "Kiss Esda BOMEME", "Trésor", "Yannick"].map((name) => row(name, "COO", 50)),
    ...["Jean Remy Ilela", "Sera NGBANZO", "Benedicte Ngbanzo", "Paul Ngbanzo"].map((name) => row(name, "FIH", 50)),
    ...["Clever KAYEMBE", "Isaac ILELA", "Prisca Ilela"].map((name) => row(name, "LSHI", 50)),
    row("Maman Deborah", "KLZ", 50)
  ];
  const bonuses = aggregateMonthlyAgentBonuses("2026-08", rows);
  const result = applyMonthlyBonuses({ byAgency: { FIH: { amountUsd: 10675.95 }, LSHI: { amountUsd: 39658.8 }, KLZ: { amountUsd: 8428.2 } }, centralCoo: { totalCostsUsd: 5078.26 }, consolidated: { amountUsd: 53684.69 } }, bonuses);
  assert.equal(rows.length, 12);
  assert.deepEqual(bonuses.byAgency, { COO: 200, FIH: 200, LSHI: 150, KLZ: 50 });
  assert.equal(bonuses.totalUsd, 600);
  assert.equal(result.byAgency.FIH.afterBonusUsd, 10475.95);
  assert.equal(result.byAgency.LSHI.afterBonusUsd, 39508.8);
  assert.equal(result.byAgency.KLZ.afterBonusUsd, 8378.2);
  assert.equal(result.afterBonusUsd, 53084.69);
});
