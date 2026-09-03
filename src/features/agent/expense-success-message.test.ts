import assert from "node:assert/strict";
import test from "node:test";

import {
  expenseSuccessDetail,
  formatExpenseAmount
} from "./expense-success-message";

test("formate Transport 1 USD avec deux décimales", () => {
  assert.equal(
    expenseSuccessDetail({ category: "Transport", amount: 1, currency: "USD" }),
    "Transport — 1,00 USD"
  );
});

test("formate Connexion 1 USD sans conserver une catégorie précédente", () => {
  assert.equal(
    expenseSuccessDetail({ category: "Connexion", amount: 1, currency: "USD" }),
    "Connexion — 1,00 USD"
  );
});

test("conserve les décimales et la devise confirmées", () => {
  assert.equal(formatExpenseAmount(15.5, "USD"), "15,50 USD");
  assert.equal(formatExpenseAmount(100, "USD"), "100,00 USD");
  assert.equal(formatExpenseAmount(2, "CDF"), "2,00 CDF");
});
