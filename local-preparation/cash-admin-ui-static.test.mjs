import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync(new URL("../src/features/admin/admin-workspace.tsx", import.meta.url), "utf8");
const consultation = fs.readFileSync(new URL("../src/features/cash/cash-period-consultation.tsx", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../src/server/cash-dashboard-source.ts", import.meta.url), "utf8");

assert.doesNotMatch(workspace, /CashOpeningBalanceSection/);
assert.match(workspace, /CashPeriodConsultation/);
for (const label of ["Aujourd’hui", "Hier", "Cette semaine", "Semaine passée", "Ce mois", "Mois précédent", "Personnalisé"]) assert.match(consultation, new RegExp(label));
for (const agency of ["FIH", "LSHI", "KLZ", "COO"]) assert.match(consultation, new RegExp(`option>${agency}`));
assert.match(consultation, /Recettes COO hors caisse/);
assert.match(source, /priorMovements/);
assert.match(source, /event_type\) !== "OPENING_BALANCE_RECORDED"/);
console.log("Cash Admin UI static checks passed.");
