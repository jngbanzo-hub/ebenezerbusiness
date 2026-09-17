import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

// Real application modules, synthetic external readers only. Network forbidden.
const require = createRequire(import.meta.url);
function loader(stubs, env = {}) {
  const cache = new Map();
  function load(request, parent = process.cwd()) {
    if (request === "server-only") return {};
    if (request === "node:async_hooks") return require(request);
    if (Object.hasOwn(stubs,request)) return stubs[request];
    const filename = request.startsWith("@/") ? path.resolve("src",request.slice(2)+".ts") : path.resolve(parent,request+".ts");
    assert.ok(filename.startsWith(path.resolve("src")+path.sep));
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const mod={exports:{}}; cache.set(filename,mod);
    new Function("require","module","exports","process","fetch",compiled)(req=>load(req,path.dirname(filename)),mod,mod.exports,{env},()=>{throw new Error("TEST_NETWORK_FORBIDDEN");});
    return mod.exports;
  }
  return load;
}
const seed = [...readFileSync("local-preparation/supabase/bilan/024_bilan_origin_months.sql","utf8").matchAll(/\('([A-Z]+)',(\d{4}),(\d{1,2}),'([^']+)'\)/g)].map(([,prefix,year,month,label])=>({prefix,year:Number(year),month:Number(month),label,id:`${year}-${month.padStart(2,"0")}`,active:true}));

test("lecteur persistant : retourne aussi les mois inactifs, sans copie statique", async () => {
  const ranges=[];
  const data=seed.map(row=>({...row,id:`synthetic-${row.prefix}`,active:false,created_at:"2026-09-17",updated_at:"2026-09-17"}));
  const query={select(){return this;},order(){return this;},async range(from,to){ranges.push([from,to]);return {data,error:null};}};
  const load=loader({"@supabase/supabase-js":{createClient:()=>({schema:()=>({from:name=>{assert.equal(name,"bilan_origin_months");return query;}})})}},{NEXT_PUBLIC_SUPABASE_URL:"https://synthetic.invalid",SUPABASE_SERVICE_ROLE_KEY:"synthetic-local-only"});
  const result=await load("@/server/bilan-origin-months").readBilanOriginMonths();
  assert.equal(result.length,7); assert.equal(result[1].prefix,"AT"); assert.equal(result[1].active,false); assert.equal(result[1].id,"2026-08");
  assert.deepEqual(ranges,[[0,499]]); assert.ok(Object.isFrozen(result));
});

test("lecteur persistant : source absente, vide ou incohérente échoue sans fallback", async () => {
  for(const response of [{data:null,error:{message:"synthetic"}},{data:[],error:null},{data:[{id:"invalid",prefix:"AT",label:"Test",active:true,year:2026,month:13}],error:null}]) {
    const query={select(){return this;},order(){return this;},async range(){return response;}};
    const load=loader({"@supabase/supabase-js":{createClient:()=>({schema:()=>({from:()=>query})})}},{NEXT_PUBLIC_SUPABASE_URL:"https://synthetic.invalid",SUPABASE_SERVICE_ROLE_KEY:"synthetic-local-only"});
    await assert.rejects(load("@/server/bilan-origin-months").readBilanOriginMonths(),/BILAN_REGISTRY_/);
  }
});

function directionFixture(registry) {
  let builds=0, reads=0; const agencies=["FIH","LSHI","KLZ"];
  const load=loader({
    "@/server/bilan-origin-months":{readBilanOriginMonths:async()=>{reads++;return registry();}},
    "@/server/cash-dashboard-source":{createServerCashDashboardSource:()=>({readAdmin:async()=>({agencies:agencies.map(agency=>({agency,currentBalance:100}))})})},
    "@/server/agent-expenses-apps-script":{readAdminExpenses:async()=>({depenses:[],pagination:{totalPages:1}})},
    "@/server/stockages-v2":{businessDatePortoNovo:date=>date.toISOString().slice(0,10),readAdminStorage:async()=>({accounts:agencies.map(agency=>({agency,current_parcel_count:2,current_weight_kg:4}))})},
    "@/features/daily-report/daily-report":{REPORT_AGENCIES:["COO",...agencies],buildDailyAgencyReport:()=>({expenseCount:0,expensesByCurrency:{}})},
    "@/features/admin/bilan/bilan-service":{buildAdminBilan:async query=>{
      builds++;
      assert.equal(load("@/features/admin/bilan/cohort-registry").getBilanCohorts().find(row=>row.id===query.cohort.id)?.prefix,query.cohort.prefix);
      assert.equal(query.period.from,`${query.cohort.id}-01`);
      return {results:{finalProfit:{consolidatedUsd:91,status:"CERTIFIE",byAgency:{FIH:{amountUsd:10},LSHI:{amountUsd:20},KLZ:{amountUsd:61}}}}};
    }}
  });
  return {read:load("@/server/direction-summary").readDirectionSummary,counts:()=>({builds,reads})};
}

test("Direction : OT/NV/DC/JN et ajout futur utilisent le même registre et bénéfice officiel", async () => {
  const catalog=[...seed,{prefix:"FB",year:2027,month:2,id:"2027-02",label:"Février 2027",active:true}];
  const fixture=directionFixture(()=>catalog);
  for(const [prefix,date] of [["OT","2026-10-17"],["NV","2026-11-17"],["DC","2026-12-17"],["JN","2027-01-17"],["FB","2027-02-17"]]) {
    const result=await fixture.read(new Date(`${date}T12:00:00Z`));
    assert.equal(result.scope.cohort.prefix,prefix); assert.equal(result.sources.bilan,"AVAILABLE");
    assert.equal(result.totals.profit.amountUsd,91); assert.equal(result.agencies.KLZ.profit.amountUsd,61);
  }
  assert.deepEqual(fixture.counts(),{builds:5,reads:5});
});

test("Direction : registre indisponible ne fabrique pas de zéro et préserve les autres sources", async () => {
  const fixture=directionFixture(()=>{throw new Error("BILAN_REGISTRY_UNAVAILABLE");});
  const result=await fixture.read(new Date("2026-10-17T12:00:00Z"));
  assert.equal(result.sources.bilan,"UNAVAILABLE"); assert.equal(result.scope.cohort,null);
  assert.equal(result.totals.profit.amountUsd,null); assert.equal(result.agencies.LSHI.profit.amountUsd,null);
  assert.deepEqual(result.sources,{cash:"AVAILABLE",expenses:"AVAILABLE",bilan:"UNAVAILABLE",storageV2:"AVAILABLE"});
  assert.deepEqual(fixture.counts(),{builds:0,reads:1});
});
