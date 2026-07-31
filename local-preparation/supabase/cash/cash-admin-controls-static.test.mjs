import assert from "node:assert/strict"; import fs from "node:fs"; import test from "node:test";
const sql=fs.readFileSync(new URL("./006_cash_admin_controls_rpc.sql",import.meta.url),"utf8");
test("RPC Admin transactionnelle et service_role uniquement",()=>{assert.match(sql,/security definer/i);assert.match(sql,/pg_advisory_xact_lock/i);assert.match(sql,/revoke all[\s\S]+authenticated/i);assert.match(sql,/grant execute[\s\S]+service_role/i);});
test("couvre ajustement correction clôture et réouverture",()=>{for(const value of ["ADMIN_ADJUSTMENT_RECORDED","CASH_CORRECTION_RECORDED","CASH_DAY_CLOSED","CASH_DAY_REOPENED"])assert.match(sql,new RegExp(value));});
test("exclut COO et exige un compte actif",()=>{assert.match(sql,/p_agency not in \('FIH','LSHI','KLZ'\)/);assert.match(sql,/v_account\.status <> 'ACTIVE'/);});
test("préserve historique et audit",()=>{assert.doesNotMatch(sql,/update public\.cash_events|delete from public\.cash_/i);assert.match(sql,/previousAmount/);assert.match(sql,/newAmount/);assert.match(sql,/public\.cash_admin_audit/);});
test("idempotence et formule officielle",()=>{assert.match(sql,/IDEMPOTENCY_CONFLICT/);assert.match(sql,/v_opening\+v_payments-v_expenses\+v_corrections/);assert.match(sql,/status='CLOSED'/);});
