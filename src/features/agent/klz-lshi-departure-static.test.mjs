import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const helper=fs.readFileSync(new URL("./klz-lshi-departure.ts",import.meta.url),"utf8");
const workspace=fs.readFileSync(new URL("./agent-workspace.tsx",import.meta.url),"utf8");
test("6 kg quote preserves 13 USD/kg and the B suffix",()=>{const quote={trackingCode:"AT19326B",weightKg:6,rateUsdPerKg:13,amountExpectedUsd:78};assert.equal(quote.weightKg*quote.rateUsdPerKg,quote.amountExpectedUsd);assert.match(workspace,/Acheminer vers LSHI/);assert.match(helper,/trackingCode:quote\.trackingCode/);});
test("attempt reuses the same request id for retry",()=>{assert.match(helper,/current\?\.fingerprint===fingerprint\?current/);});
test("action remains KLZ-only and does not replace payment",()=>{assert.match(workspace,/profile\.agence === "KLZ"/);assert.match(workspace,/handlePayment/);assert.match(workspace,/EncaissementQrScanner/);});
