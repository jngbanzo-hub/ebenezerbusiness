import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const text = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const id = "625e5fe7-b0be-4353-b773-fed9c49e8a6f";

function runtime(enabled = true) {
  const calls = { inspect: 0, confirm: 0 };
  const exportsObject = {};
  const context = vm.createContext({
    exports: exportsObject,
    module: { exports: exportsObject },
    Request, URL, Object, Array,
    process: { env: { KLZ_EXPENSE_CASH_RECOVERY_ENABLED: enabled ? "true" : "false" } },
    require: (name) => {
      if (name === "next/server") return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
      if (name === "@/server/admin-authorization") return {
        authorizeAdminRequest: async (request) => request.headers.get("Authorization") === "Bearer admin"
          ? { authorized: true, userId: "admin-id", email: "admin@test.local", agency: "COO" }
          : { authorized: false, status: request.headers.get("Authorization") ? 403 : 401 }
      };
      if (name === "@/server/expense-cash-recovery") return {
        ExpenseCashRecoveryError: class extends Error {},
        inspectExpenseCashRecovery: async () => { calls.inspect++; return { eligible: true }; },
        confirmExpenseCashRecovery: async () => { calls.confirm++; return { cashEventCount: 1 }; }
      };
      throw new Error(name);
    }
  });
  vm.runInContext(code, context);
  return { route: exportsObject, calls };
}

test("désactivée par défaut de configuration : aucune lecture ni écriture", async () => {
  const { route, calls } = runtime(false);
  const result = await route.POST(new Request("https://test.local/api/admin/expenses/cash-recovery", { method: "POST" }));
  assert.equal(result.status, 404);
  assert.equal(calls.confirm, 0);
});

test("sans session et session non Admin refusées", async () => {
  const { route, calls } = runtime();
  const missing = await route.GET(new Request("https://test.local/api/admin/expenses/cash-recovery"));
  assert.equal(missing.status, 401);
  const agent = await route.POST(new Request("https://test.local/api/admin/expenses/cash-recovery", {
    method: "POST", headers: { Authorization: "Bearer agent" },
    body: JSON.stringify({ confirmation: "CONFIRMER_DEBIT_CAISSE_KLZ" })
  }));
  assert.equal(agent.status, 403);
  assert.equal(calls.confirm, 0);
});

test("Admin : dossier et confirmation exacts obligatoires", async () => {
  const { route, calls } = runtime();
  const allowedPreview = await route.GET(new Request("https://test.local/api/admin/expenses/cash-recovery", {
    headers: { Authorization: "Bearer admin" }
  }));
  assert.equal(allowedPreview.status, 200);
  assert.equal(calls.inspect, 1);
  const wrong = await route.GET(new Request("https://test.local/api/admin/expenses/cash-recovery?expenseRequestId=other", {
    headers: { Authorization: "Bearer admin" }
  }));
  assert.equal(wrong.status, 400);
  const noConfirmation = await route.POST(new Request("https://test.local/api/admin/expenses/cash-recovery", {
    method: "POST", headers: { Authorization: "Bearer admin" },
    body: JSON.stringify({ expenseRequestId: id })
  }));
  assert.equal(noConfirmation.status, 400);
  const confirmed = await route.POST(new Request("https://test.local/api/admin/expenses/cash-recovery", {
    method: "POST", headers: { Authorization: "Bearer admin" },
    body: JSON.stringify({ confirmation: "CONFIRMER_DEBIT_CAISSE_KLZ" })
  }));
  assert.equal(confirmed.status, 200);
  assert.equal(calls.confirm, 1);
  assert.equal(calls.inspect, 1);
});
