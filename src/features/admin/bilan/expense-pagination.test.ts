import assert from "node:assert/strict";
import test from "node:test";
import type { AdminExpense, AdminExpensesResponse } from "../expenses";
import { combineExpensePages } from "./expense-pagination";

function expense(id: string): AdminExpense {
  return { id, expenseRequestId: id, date: "2026-11-05", dateHeure: "2026-11-05T12:00:00Z", agence: "FIH", categorie: "Sacs", montant: 1, devise: "USD", description: "", observation: "", agent: "", statut: "ACTIVE", reference: "", dateCreation: "2026-11-05T12:00:00Z", dateMiseAJour: "2026-11-05T12:00:00Z", annulee: false, corrigee: false };
}

function page(number: number, total: number, ids: string[], pageSize = 2): AdminExpensesResponse {
  return { success: true, code: "DEPENSES_ADMIN_LISTEES", lectureSeule: true, depenses: ids.map(expense), pagination: { page: number, pageSize, total, totalPages: Math.ceil(total / pageSize) }, totaux: { nombreDepenses: total, parDevise: {}, parAgence: {}, parCategorie: {} } };
}

test("une période vide lue complètement ne devient pas une erreur", () => {
  assert.deepEqual(combineExpensePages([page(1, 0, [])]), { rows: [], complete: true });
});

test("toutes les pages cohérentes sont conservées sans seconde lecture par agence", () => {
  const result = combineExpensePages([page(1, 3, ["1", "2"]), page(2, 3, ["3"])]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.rows.map((row) => row.id), ["1", "2", "3"]);
});

test("une page manquante, tronquée, divergente ou répétée reste explicitement incomplète", () => {
  assert.equal(combineExpensePages([page(1, 3, ["1", "2"])]).complete, false);
  assert.equal(combineExpensePages([page(1, 3, ["1"]), page(2, 3, ["3"])]).complete, false);
  assert.equal(combineExpensePages([page(1, 3, ["1", "2"]), page(2, 4, ["3", "4"])]).complete, false);
  assert.equal(combineExpensePages([page(1, 3, ["1", "2"]), page(2, 3, ["2"])]).complete, false);
  assert.equal(combineExpensePages([page(1, 3, ["1", "2"]), page(1, 3, ["3"])]).complete, false);
});
