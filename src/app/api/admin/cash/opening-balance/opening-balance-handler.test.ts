import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AdminAuthorizationResult } from "@/server/admin-authorization";
import { OpeningBalanceCommandService, type OpeningBalanceRepository } from "./opening-balance-command";
import { createOpeningBalancePostHandler } from "./opening-balance-handler";

const authorized: AdminAuthorizationResult = { authorized: true, userId: "admin-001", email: "admin@example.test", role: "ADMIN", agency: "COO" };
const input = { agency: "FIH", amount: 10, businessDate: "2026-08-01", requestId: "opening-route-001", confirmationFinal: true };
function service() { const repository: OpeningBalanceRepository = { async openCashAccount(command){ return { state:"SUCCESS",replayed:false,eventId:"event-fih",agency:command.agency,amount:command.amount,currency:"USD",businessDate:command.businessDate,accountStatus:"ACTIVE" }; } }; return new OpeningBalanceCommandService(repository); }
function request(body: unknown) { return new Request("http://localhost/api/admin/cash/opening-balance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

test("Admin actif obtient 201", async () => { const response = await createOpeningBalancePostHandler(async()=>authorized,service())(request(input)); assert.equal(response.status,201); assert.equal((await response.json()).agency,"FIH"); });
test("session absente est refusée avant construction du service", async () => { let built=false; const response=await createOpeningBalancePostHandler(async()=>({authorized:false,status:401}),()=>{built=true;return service();})(request(input)); assert.equal(response.status,401); assert.equal(built,false); });
test("Agent est refusé par l'autorisation Admin", async () => { const response=await createOpeningBalancePostHandler(async()=>({authorized:false,status:403}),service())(request(input)); assert.equal(response.status,403); });
test("la route Next exporte uniquement POST, dynamic et runtime",()=>{ const source=readFileSync(new URL("./route.ts",import.meta.url),"utf8"); const exports=Array.from(source.matchAll(/export (?:const|async function) (\w+)/g),m=>m[1]).sort(); assert.deepEqual(exports,["POST","dynamic","runtime"]); assert.match(source,/CASH_OPENING_BALANCE_ENABLED/); assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY/); });
