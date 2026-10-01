import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./bilan-monthly-bonus-admin.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  const beneficiaries = [
    { beneficiary_id: "coo", display_name: "COO", agency: "COO", active: true, auth_agent_id: null },
    { beneficiary_id: "fih", display_name: "FIH", agency: "FIH", active: true, auth_agent_id: null },
    { beneficiary_id: "lshi", display_name: "LSHI", agency: "LSHI", active: true, auth_agent_id: null },
    { beneficiary_id: "klz", display_name: "KLZ", agency: "KLZ", active: true, auth_agent_id: null },
  ];
  const saved = new Map();
  const writes = [];
  const client = {
    schema(name) { assert.equal(name, "public"); return this; },
    from(table) {
      let ids;
      let month;
      const query = {
        select() { return this; },
        in(field, values) { assert.equal(field, "beneficiary_id"); ids = values; return this; },
        eq(field, value) { if (field === "month_origin") month = value; return this; },
        order() { return this; },
        then(resolve, reject) {
          const data = table === "bilan_bonus_beneficiaries"
            ? beneficiaries.filter((person) => person.active && (!ids || ids.includes(person.beneficiary_id)))
            : [...saved.values()].filter((row) => row.month_origin === month);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
        upsert(rows, options) {
          assert.equal(table, "bilan_monthly_agent_bonuses");
          assert.equal(options.onConflict, "month_origin,beneficiary_id");
          writes.push(rows);
          for (const row of rows) {
            assert.ok(row.agency, "agency must be persisted");
            saved.set(`${row.month_origin}|${row.beneficiary_id}`, row);
          }
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      if (name === "server-only") return {};
      if (name === "@supabase/supabase-js") return { createClient: () => client };
      throw new Error(`Unexpected import: ${name}`);
    },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test" } },
    Date, Map, Set, Error,
  });
  return { ...module.exports, beneficiaries, saved, writes };
}

test("direct certification persists verified agencies, exact manual amounts and status on reload", async () => {
  const app = fixture();
  const decisions = [
    { beneficiaryId: "coo", amountUsd: 50 },
    { beneficiaryId: "fih", amountUsd: 12.25 },
    { beneficiaryId: "lshi", amountUsd: 0 },
    { beneficiaryId: "klz", amountUsd: 77.5 },
  ];
  await app.saveMonthlyBonusAdmin({ monthOrigin: "2026-10", actorId: "admin", certify: true, decisions });
  assert.equal(app.writes.length, 1);
  const reloaded = await app.readMonthlyBonusAdmin("2026-10");
  assert.equal(reloaded.decisions.length, 4);
  for (const [index, decision] of decisions.entries()) {
    const row = app.saved.get(`2026-10-01|${decision.beneficiaryId}`);
    assert.equal(row.agency, app.beneficiaries[index].agency);
    assert.equal(row.amount_usd, decision.amountUsd);
    assert.equal(row.status, "CERTIFIEE");
  }
  const totals = Object.fromEntries(app.beneficiaries.map((person) => [person.agency,
    reloaded.decisions.filter((row) => row.beneficiary_id === person.beneficiary_id)
      .reduce((sum, row) => sum + row.amount_usd, 0)]));
  assert.deepEqual(totals, { COO: 50, FIH: 12.25, LSHI: 0, KLZ: 77.5 });
  await app.saveMonthlyBonusAdmin({ monthOrigin: "2026-10", actorId: "admin", certify: true, decisions });
  assert.equal(app.saved.size, 4, "upsert must not duplicate month + beneficiary");
});

test("direct certification rejects unknown, inactive or duplicate beneficiaries before any write", async () => {
  for (const decisions of [
    [{ beneficiaryId: "unknown", amountUsd: 10 }],
    [{ beneficiaryId: "fih", amountUsd: 10 }, { beneficiaryId: "fih", amountUsd: 20 }],
  ]) {
    const app = fixture();
    await assert.rejects(app.saveMonthlyBonusAdmin({ monthOrigin: "2026-10", actorId: "admin", certify: true, decisions }),
      /BILAN_BONUS_INVALID_BENEFICIARY/);
    assert.equal(app.writes.length, 0);
  }
  const app = fixture();
  app.beneficiaries[0].active = false;
  await assert.rejects(app.saveMonthlyBonusAdmin({ monthOrigin: "2026-10", actorId: "admin", certify: true,
    decisions: [{ beneficiaryId: "coo", amountUsd: 10 }] }), /BILAN_BONUS_INVALID_BENEFICIARY/);
  assert.equal(app.writes.length, 0);
});
