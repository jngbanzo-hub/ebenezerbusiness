import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const directory = new URL(".", import.meta.url).pathname;
const sources = readdirSync(directory)
  .filter((name) => name.endsWith(".ts") || name.endsWith(".md"))
  .map((name) => readFileSync(join(directory, name), "utf8"))
  .join("\n");
const executableSources = readdirSync(directory)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => readFileSync(join(directory, name), "utf8"))
  .join("\n");

test("51. aucun contrat n'importe Transferts", () => {
  assert.doesNotMatch(executableSources, /(?:import|from)\s+["'][^"']*transfert/i);
});
test("52. aucun contrat n'importe Dépenses", () => {
  assert.doesNotMatch(executableSources, /(?:import|from)\s+["'][^"']*d[eé]pense/i);
});
test("53. aucun contrat n'importe Caisse", () => {
  assert.doesNotMatch(executableSources, /(?:import|from)\s+["'][^"']*caisse/i);
});
test("54. aucun contrat n'écrit MANIFESTE PUBLIC", () => {
  assert.doesNotMatch(executableSources, /getRange|setValue|appendRow|SpreadsheetApp/);
});
test("55. aucun contrat ne dépend d'Apps Script", () => {
  assert.doesNotMatch(executableSources, /GoogleAppsScript|UrlFetchApp|PropertiesService/);
});
test("56. aucun contrat ne dépend d'un navigateur", () => {
  assert.doesNotMatch(executableSources, /\bwindow\b|\bdocument\b|localStorage|sessionStorage/);
});
test("57. aucun contrat ne dépend du mobile", () => {
  assert.doesNotMatch(executableSources, /react-native|expo-|android|ios\//i);
});
test("frontière documentaire : PAYÉ reste distinct de LIVRÉ", () => {
  assert.match(sources, /PAYÉ\s*≠\s*LIVRÉ/);
});
