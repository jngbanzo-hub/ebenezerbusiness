import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./qr-stock-alert.ts", import.meta.url), "utf8")
  .replace(/export type QrStockAlert = \{[\s\S]*?\} \| null;\n/, "")
  .replace("unassigned: number", "unassigned")
  .replace(": QrStockAlert", "");
const { getQrStockAlert } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test("n’affiche aucune alerte au-dessus de 200 QR libres", () => {
  assert.equal(getQrStockAlert(500), null);
  assert.equal(getQrStockAlert(201), null);
});

test("active le seuil faible de 200 à 101 inclus", () => {
  for (const value of [200, 150, 101]) {
    const alert = getQrStockAlert(value);
    assert.equal(alert?.level, "LOW");
    assert.match(alert?.message ?? "", new RegExp(`\\b${value}\\b`));
  }
});

test("active le seuil très faible à 100 et en dessous", () => {
  for (const value of [100, 50, 0]) {
    const alert = getQrStockAlert(value);
    assert.equal(alert?.level, "VERY_LOW");
    assert.match(alert?.message ?? "", new RegExp(`\\b${value}\\b`));
  }
});
