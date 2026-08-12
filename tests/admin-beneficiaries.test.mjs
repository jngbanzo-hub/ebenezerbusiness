import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/admin/beneficiaries.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { calculateBeneficiaryStatistics, normalizeBeneficiary } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const row = (overrides={}) => ({ sourceSite:"FIH", rowNumber:2, dateRaw:"12/08/2026", codeColisRaw:"AT00126", expediteurRaw:"Expéditeur", beneficiaireRaw:"Marie N. +243 999-111-222", poidsRaw:"2 kg", statutRaw:"EN ATTENTE", ...overrides });

test("normalise le téléphone et conserve un nom lisible", () => {
  assert.deepEqual(normalizeBeneficiary(" Marie N. (+243) 999-111-222 "), { name:"Marie N.", phone:"243999111222" });
  assert.equal(normalizeBeneficiary("Marie sans numéro"), null);
});

test("regroupe par agence et numéro malgré les variantes de nom", () => {
  const stats = calculateBeneficiaryStatistics([row(), row({rowNumber:3,codeColisRaw:"AT00226",beneficiaireRaw:"MARIE NG. 243999111222",poidsRaw:"3"})],"2026-08-01","2026-08-31");
  assert.equal(stats.byAgency.FIH.byParcels.length,1);
  assert.equal(stats.byAgency.FIH.byParcels[0].parcelCount,2);
  assert.equal(stats.byAgency.FIH.byParcels[0].totalWeightKg,5);
});

test("sépare le même numéro entre agences", () => {
  const stats = calculateBeneficiaryStatistics([row(),row({sourceSite:"KLZ",rowNumber:3,codeColisRaw:"AT00226"})],"2026-08-01","2026-08-31");
  assert.equal(stats.byAgency.FIH.byParcels.length,1);
  assert.equal(stats.byAgency.KLZ.byParcels.length,1);
});

test("déduplique un colis dans la même agence mais pas entre agences", () => {
  const stats = calculateBeneficiaryStatistics([row(),row({rowNumber:8,poidsRaw:"9"}),row({sourceSite:"KLZ",rowNumber:9})],"2026-08-01","2026-08-31");
  assert.equal(stats.byAgency.FIH.byParcels[0].parcelCount,1);
  assert.equal(stats.byAgency.FIH.byParcels[0].totalWeightKg,2);
  assert.equal(stats.byAgency.KLZ.byParcels[0].parcelCount,1);
});

test("respecte les bornes inclusives et produit deux classements top 10", () => {
  const rows = Array.from({length:12},(_,i)=>row({rowNumber:i+2,dateRaw:i===11?"01/09/2026":"01/08/2026",codeColisRaw:`AT${i}`,beneficiaireRaw:`Nom ${i} +243900000${String(i).padStart(3,"0")}`,poidsRaw:String(i+1)}));
  const stats=calculateBeneficiaryStatistics(rows,"2026-08-01","2026-08-31");
  assert.equal(stats.byAgency.FIH.byParcels.length,10);
  assert.equal(stats.byAgency.FIH.byWeight.length,10);
  assert.equal(stats.byAgency.FIH.byWeight[0].totalWeightKg,11);
});

test("la route reste Admin GET en lecture seule", async () => {
  const route = await readFile(new URL("../src/app/api/admin/beneficiaries/statistics/route.ts", import.meta.url),"utf8");
  assert.match(route,/authorizeAdminRequest/);
  assert.match(route,/export async function GET/);
  assert.doesNotMatch(route,/export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(route,/private, no-store/);
});
