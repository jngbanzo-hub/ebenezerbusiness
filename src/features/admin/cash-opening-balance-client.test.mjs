import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { OpeningBalanceRequestError, submitOpeningBalance } from "./cash-opening-balance-client";

const command={agency:"FIH",amount:10,businessDate:"2026-08-01",requestId:"opening-client-001",confirmationFinal:true};
test("envoie le Bearer token et la commande exacte",async()=>{let captured;const result=await submitOpeningBalance("token-test",command,async(_url,init)=>{captured=init;return Response.json({state:"SUCCESS",replayed:false,eventId:"event-1",agency:"FIH",amount:10,currency:"USD",businessDate:"2026-08-01",accountStatus:"ACTIVE"},{status:201});});assert.equal(captured.headers.Authorization,"Bearer token-test");assert.deepEqual(JSON.parse(captured.body),command);assert.equal(result.replayed,false);});
test("expose un conflit métier sans détail technique",async()=>{await assert.rejects(()=>submitOpeningBalance("token",command,async()=>Response.json({error:{code:"IDEMPOTENCY_CONFLICT",message:"Commande différente."}},{status:409})),(error)=>error instanceof OpeningBalanceRequestError&&error.code==="IDEMPOTENCY_CONFLICT"&&error.status===409);});
test("l'interface contient trois saisies séparées et aucun secret serveur",()=>{const ui=readFileSync(new URL("./cash-opening-balance.tsx",import.meta.url),"utf8");const client=readFileSync(new URL("./cash-opening-balance-client.ts",import.meta.url),"utf8");assert.match(ui,/\["FIH", "LSHI", "KLZ"\]/);assert.match(ui,/confirmationFinal: true/);assert.doesNotMatch(`${ui}\n${client}`,/SUPABASE_SERVICE_ROLE_KEY/);});
