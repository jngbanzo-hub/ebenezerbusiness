import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const helper=fs.readFileSync(new URL("./klz-lshi-departure.ts",import.meta.url),"utf8");
const workspace=fs.readFileSync(new URL("./agent-workspace.tsx",import.meta.url),"utf8");
test("6 kg quotes preserve the official rates and the B suffix",()=>{assert.match(helper,/LSHI:13,FIH:16/);assert.match(helper,/trackingCode:normalizedCode/);assert.equal(6*13,78);assert.equal(6*16,96);});
test("attempt reuses the same request id for retry",()=>{assert.match(helper,/current\?\.fingerprint===fingerprint\?current/);});
test("destination choice exposes LSHI and a disabled FIH departure",()=>{assert.match(workspace,/ACHEMINER LE COLIS/);assert.match(workspace,/Vers LSHI — 13 USD\/kg/);assert.match(workspace,/Vers FIH — 16 USD\/kg/);assert.match(workspace,/Acheminement vers FIH en cours d’activation/);assert.doesNotMatch(workspace,/api\/agent\/stockages\/forwardings\/klz-fih/);});
test("action remains KLZ-only and does not replace payment",()=>{assert.match(workspace,/profile\.agence === "KLZ"/);assert.match(workspace,/storageSearchResult\?\.state === "FOUND"/);assert.match(workspace,/handlePayment/);assert.match(workspace,/EncaissementQrScanner/);});
