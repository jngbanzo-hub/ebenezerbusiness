import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const {resolveAuditUtcBounds:bounds}=await import(compile(fs.readFileSync('src/server/transferts-audit-date-bounds.ts','utf8')));
const types=compile(fs.readFileSync('src/features/transferts/types.ts','utf8'));
const admin=await import(compile(fs.readFileSync('src/server/transferts-admin-statistics.ts','utf8').replace('import "server-only";','').replace('@/features/transferts/types',types)));
// Run the existing frozen V5 read filter unchanged, against fictitious rows only.
const source="function _apiListAdminAudit_(filters, request, adminEnabled) {\n  if (!adminEnabled || String(request.actorRole).toUpperCase() !== 'ADMIN') throw new Error('ADMIN_API_DISABLED');\n  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRANSFERTS_CONFIG.SHEETS.AUDIT);\n  if (!sheet || sheet.getLastRow() < 2) return [];\n  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues()\n    .filter(function (r) {\n      if (filters.transferId && String(r[5]) !== String(filters.transferId)) return false;\n      if (filters.agencyFrom && r[3] !== String(filters.agencyFrom).toUpperCase()) return false;\n      if (filters.agencyTo && r[4] !== String(filters.agencyTo).toUpperCase()) return false;\n      if (filters.dateFrom && new Date(r[0]).getTime() < new Date(filters.dateFrom).getTime()) return false;\n      if (filters.dateTo && new Date(r[0]).getTime() > new Date(filters.dateTo).getTime()) return false;\n      return true;\n    }).map(_serializeAuditRow_);\n}\n\n";
let rows=[];
const context={TRANSFERTS_CONFIG:{SHEETS:{AUDIT:'AUDIT'}},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>rows.length+1,getRange:()=>({getValues:()=>rows})})})},_serializeAuditRow_:r=>r};
vm.createContext(context);vm.runInContext(source,context);
const read=(period,extra={})=>Array.from(context._apiListAdminAudit_({...period,...extra},{actorRole:'ADMIN'},true));
const row=(date,id,action='RECEPTION_CODE',origin='FIH')=>[date,'fictional-agent',action,origin,'COO',id,'','','SUCCES','{}','fictional-event-'+id];
const day={from:'2026-11-17',to:'2026-11-17'};
const times=['2026-11-16T22:59:59.999Z','2026-11-16T23:00:00.000Z','2026-11-17T00:00:00.000Z','2026-11-17T00:00:00.001Z','2026-11-17T12:00:00.000Z','2026-11-17T22:59:59.999Z','2026-11-17T23:00:00.000Z'];
test('journée du 17 : début local inclus, fin exclusive, événements après 01h',()=>{
 assert.deepEqual(bounds(day),{dateFrom:'2026-11-16T23:00:00.000Z',dateTo:'2026-11-17T22:59:59.999Z'});
 rows=times.map((d,i)=>row(d,String(i)));
 assert.deepEqual(read(bounds(day)).map(r=>r[5]),['1','2','3','4','5']);
});
test('3 au 4 novembre : journée de fin intégralement incluse',()=>{
 const range=bounds({from:'2026-11-03',to:'2026-11-04'});
 assert.deepEqual(range,{dateFrom:'2026-11-02T23:00:00.000Z',dateTo:'2026-11-04T22:59:59.999Z'});
 rows=['2026-11-02T22:59:59.999Z','2026-11-02T23:00:00Z','2026-11-04T22:59:59.999Z','2026-11-04T23:00:00Z'].map((d,i)=>row(d,String(i)));
 assert.deepEqual(read(range).map(r=>r[5]),['1','2']);
});
test('mois du 1 au 17 inclus, conversion UTC unique',()=>{
 const period=admin.resolveAdminPeriodBounds(admin.parseAdminTransferFilters(new URLSearchParams({period:'THIS_MONTH'})),new Date('2026-11-17T15:00:00Z'));
 assert.deepEqual(bounds(period),{dateFrom:'2026-10-31T23:00:00.000Z',dateTo:'2026-11-17T22:59:59.999Z'});
 rows=[row('2026-10-31T23:00:00Z','first'),row('2026-11-17T22:59:59.999Z','last'),row('2026-11-17T23:00:00Z','outside')];
 assert.equal(read(bounds(period)).length,2);
});
test('RECEPTION_CODE, RETRAIT_FONDS et CONFIRMATION : ID exact et agences conservés',()=>{
 rows=['RECEPTION_CODE','RETRAIT_FONDS','CONFIRMATION'].map((a,i)=>row(`2026-11-17T1${i}:00:00Z`,'exact-id',a));
 rows.push(row('2026-11-17T12:00:00Z','exact-id-extra'),row('2026-11-17T12:00:00Z','exact-id','CONFIRMATION','KLZ'));
 const result=read(bounds(day),{transferId:'exact-id',agencyFrom:'FIH',agencyTo:'COO'});
 assert.deepEqual(result.map(r=>r[2]),['RECEPTION_CODE','RETRAIT_FONDS','CONFIRMATION']);
 assert.ok(result.every(r=>r[5]==='exact-id'));
});
test('jours adjacents : aucun événement ajouté deux fois',()=>{
 rows=times.map((d,i)=>row(d,String(i)));
 const one=read(bounds(day));const next=read(bounds({from:'2026-11-18',to:'2026-11-18'}));
 const ids=one.concat(next).map(r=>r[10]);assert.equal(ids.length,new Set(ids).size);
});
test('comparaison avant/après : quatre événements fictifs retrouvés',()=>{
 rows=times.map((d,i)=>row(d,String(i)));
 const before=read({dateFrom:day.from,dateTo:day.to});const after=read(bounds(day));
 assert.equal(before.length,1);assert.equal(after.length,5);
 assert.equal(after.filter(r=>!before.some(b=>r[5]===b[5])).length,4);
});
test('statistiques Admin inchangées : mêmes bornes calendaires et journée entière',()=>{
 const f=admin.parseAdminTransferFilters(new URLSearchParams({period:'CUSTOM',from:day.from,to:day.to}));
 const list=times.map((sentAt,i)=>({sentAt,transferId:String(i)}));
 assert.deepEqual(admin.filterAdminTransfers(list,f).map(r=>r.transferId),['1','2','3','4','5']);
});
test('filtre V5 : refus des lecteurs non Admin inchangé',()=>{
 assert.throws(()=>context._apiListAdminAudit_(bounds(day),{actorRole:'AGENT'},true),/ADMIN_API_DISABLED/);
 assert.throws(()=>context._apiListAdminAudit_(bounds(day),{actorRole:'ADMIN'},false),/ADMIN_API_DISABLED/);
});
