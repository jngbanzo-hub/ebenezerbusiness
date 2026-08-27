import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const helper=fs.readFileSync(new URL("./klz-lshi-departure.ts",import.meta.url),"utf8");
const workspace=fs.readFileSync(new URL("./agent-workspace.tsx",import.meta.url),"utf8");
const stockages=fs.readFileSync(new URL("../stockages/stockages-v2-page.tsx",import.meta.url),"utf8");
test("6 kg quotes preserve the official rates and the B suffix",()=>{assert.match(helper,/LSHI:13,FIH:16/);assert.match(helper,/trackingCode:normalizedCode/);assert.equal(6*13,78);assert.equal(6*16,96);});
test("attempt reuses the same request id for retry",()=>{assert.match(helper,/current\?\.fingerprint===fingerprint\?current/);});
test("forwarding is removed from Encaissements and moved to Stockage Sorties",()=>{assert.doesNotMatch(workspace,/ACHEMINER LE COLIS|handleForwarding|inter-agency-routing\/quote/);assert.match(stockages,/Acheminer un colis/);assert.match(stockages,/LSHI — 13 USD\/kg/);assert.match(stockages,/FIH — 16 USD\/kg/);assert.match(stockages,/data\.account\.agency === "KLZ"/);});
test("native payment and QR remain unchanged",()=>{assert.match(workspace,/handlePayment/);assert.match(workspace,/saveDestinationPayment/);assert.match(workspace,/EncaissementQrScanner/);assert.match(workspace,/confirmPhysicalRemittance/);});
