import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const compile = source => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString("base64");
const types = compile(fs.readFileSync("src/features/transferts/types.ts","utf8"));
const h = await import(compile(fs.readFileSync("src/features/transferts/agent-transfer-history.ts","utf8").replace('from "./types"', 'from "'+types+'"')));
const filters={period:"CUSTOM",from:"2026-11-03",to:"2026-11-03",circuit:"",currency:""};
const row=(transferId,confirmedAt,agencyFrom="KLZ",agencyTo="COO",status="CONFIRME")=>({transferId,confirmedAt,agencyFrom,agencyTo,status,fundsWithdrawnBy:"agent-test",confirmedBy:"agent-test",fundsWithdrawnAt:"2026-11-01T10:00:00Z"});
test("quatre agences, droits de destination et six circuits",()=>{
 for(const agency of ["COO","FIH","LSHI","KLZ"]){
  const rows=[row("in","2026-11-03T10:00:00Z",agency==="COO"?"KLZ":"COO",agency),
   row("out","2026-11-03T10:00:00Z",agency,agency==="COO"?"KLZ":"COO"),
   row("lateral","2026-11-03T10:00:00Z","FIH","LSHI")];
  assert.deepEqual(h.finalizedTransfers(rows,agency,filters).dated.map(r=>r.transferId),["in"]);
  assert.equal(h.agencyCircuits(agency).length,agency==="COO"?6:2);
 }
});
test("bornes Porto-Novo, journée entière, ordre et égalités déterministes",()=>{
 const rows=[row("before","2026-11-02T22:59:59.999Z"),row("a","2026-11-02T23:00:00Z"),
 row("z","2026-11-03T22:59:59.999Z"),row("b","2026-11-03T22:59:59.999Z"),row("after","2026-11-03T23:00:00Z")];
 assert.deepEqual(h.finalizedTransfers(rows,"COO",filters).dated.map(r=>r.transferId),["b","z","a"]);
 assert.equal(h.finalizedTransfers(rows,"COO",{...filters,to:"2026-11-04"}).dated.length,4);
});
test("preuves absentes exclues de Retrait, autres statuts exclus",()=>{
 const rows=[row("unknown",null),...["CODE_RECU","FONDS_RETIRES","ENVOYE","ANNULE","A_VERIFIER"].map(s=>row(s,"2026-11-03T10:00:00Z","KLZ","COO",s))];
 const result=h.finalizedTransfers(rows,"COO",filters);
 assert.equal(result.dated.length,0);assert.equal(h.hasRecordedWithdrawalAndFinalization(rows[0]),false);
 assert.equal(h.finalizedTransfers(rows,"COO",{...filters,circuit:"FIH>COO"}).dated.length,0);
});
test("aujourd’hui, semaine et mois conservent le fuseau",()=>{
 const now=new Date("2026-11-02T23:30:00Z");
 assert.deepEqual(h.periodBounds({...filters,period:"TODAY"},now),{from:"2026-11-03",to:"2026-11-03"});
 assert.deepEqual(h.periodBounds({...filters,period:"THIS_WEEK"},now),{from:"2026-11-02",to:"2026-11-03"});
 assert.deepEqual(h.periodBounds({...filters,period:"THIS_MONTH"},now),{from:"2026-11-01",to:"2026-11-03"});
});

test("clôture exceptionnelle sans retrait, acteurs absents et dates incohérentes refusés",()=>{
 const base=row("final","2026-11-03T10:00:00Z");
 assert.equal(h.hasRecordedWithdrawalAndFinalization(base),true);
 for(const change of [
 {fundsWithdrawnAt:null},{fundsWithdrawnBy:""},{confirmedBy:" "},
 {confirmedAt:"invalide"},{fundsWithdrawnAt:"2026-11-04T10:00:00Z"},
 {status:"FONDS_RETIRES"}
 ]) assert.equal(h.hasRecordedWithdrawalAndFinalization({...base,...change}),false);
});

test("devise et frontière Reçus/Retrait sans suppression des dossiers",()=>{
 const complete={...row("complete","2026-11-03T10:00:00Z"),currency:"USD"};
 const pending={...complete,transferId:"pending",status:"FONDS_RETIRES",confirmedAt:null};
 const exceptional={...complete,transferId:"exception",fundsWithdrawnAt:null};
 const all=[complete,pending,exceptional];
 assert.deepEqual(all.filter(r=>!h.hasRecordedWithdrawalAndFinalization(r)).map(r=>r.transferId),["pending","exception"]);
 assert.equal(h.finalizedTransfers(all,"COO",{...filters,currency:"CDF"}).dated.length,0);
 assert.equal(h.finalizedTransfers(all,"COO",{...filters,currency:"USD"}).dated.length,1);
 assert.equal(all.length,3);
});
