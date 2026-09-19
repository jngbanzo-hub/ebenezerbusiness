import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { AdminAuthorizationResult } from "@/server/admin-authorization";
import { resolveDirectionScope } from "@/server/direction-summary-scope";
import { TEST_COHORTS } from "./bilan-test-context";
import { getBilanCohorts, resolveCohort, withBilanCohorts } from "./cohort-registry";
import { validateCohortDefinitions, type OriginMonth } from "./cohort-catalog";
import { createBilanFilters, buildBilanFilterQuery } from "./bilan-filter-state";
import { parseBilanApiQuery } from "./bilan-api-query";
import { createBilanGetHandler } from "./bilan-route-handler";
import { createOriginMonthHandlers } from "./origin-month-handlers";

const actor = "00000000-0000-4000-8000-000000000001";
const admin: AdminAuthorizationResult = { authorized: true, userId: actor, email: "admin@example.test", role: "ADMIN", agency: "COO" };
const months: OriginMonth[] = TEST_COHORTS.map(row => ({ ...row, registryId: actor, active: true, createdAt: "2026-09-17", updatedAt: "2026-09-17" }));

for (const [prefix, period, end] of [["MR","2026-03","31"],["AV","2026-04","30"],["MA","2026-05","31"],["JN","2026-06","30"],["JL","2026-07","31"],["AT","2026-08","31"],["SE","2026-09","30"],["OT","2026-10","31"],["NV","2026-11","30"],["DC","2026-12","31"],["JA","2027-01","31"],["FE","2027-02","28"]]) {
  test(`${prefix} : résolution, interface, API et Direction partagent ${period}`, () => withBilanCohorts(months, () => {
    const resolved = resolveCohort(`${prefix}00126B`);
    assert.equal(resolved.state,"RESOLVED");
    if (resolved.state === "RESOLVED") assert.equal(resolved.definition.id,period);
    const filters = createBilanFilters(prefix,months);
    const query = parseBilanApiQuery(`https://test.invalid/api/admin/bilan?${buildBilanFilterQuery(filters,months)}`);
    assert.equal(query.state,"VALID");
    if (query.state === "VALID") assert.deepEqual(query.query.period,{from:`${period}-01`,to:`${period}-${end}`});
    const direction = resolveDirectionScope(`${period}-17`,getBilanCohorts());
    assert.equal(direction.cohort?.prefix,prefix);
    assert.deepEqual(direction.analysisPeriod,{from:`${period}-01`,to:`${period}-${end}`});
  }));
}

test("aucun registre implicite, vide ou préfixe inventé OC", () => {
  assert.throws(() => resolveCohort("AT00126"),/REGISTRY_UNAVAILABLE/);
  assert.throws(() => withBilanCohorts([],() => {}),/REGISTRY_UNAVAILABLE/);
  withBilanCohorts(months,() => assert.equal(resolveCohort("OC00126").state,"UNRESOLVED"));
});

test("ajout futur explicite et désactivation conservent la résolution historique", () => {
  const catalog = [...months.map(row=>({...row,active:false})),{id:"2027-02" as const,prefix:"FB",year:2027,month:2,label:"Février 2027",active:true}];
  withBilanCohorts(catalog,() => {
    assert.equal(resolveCohort("AT00126").state,"RESOLVED");
    const parsed = parseBilanApiQuery("https://test.invalid/api/admin/bilan?cohort=FB");
    assert.equal(parsed.state,"VALID");
    if(parsed.state==="VALID") assert.deepEqual(parsed.query.period,{from:"2027-02-01",to:"2027-02-28"});
  });
});

test("snapshots immuables et isolés entre requêtes concurrentes", async () => {
  const results = await Promise.all(["XA","XB"].map(prefix => withBilanCohorts([{id:"2030-01",prefix,year:2030,month:1,label:"Test"}],async () => {
    await new Promise(resolve=>setTimeout(resolve,2));
    assert.ok(Object.isFrozen(getBilanCohorts())); assert.ok(Object.isFrozen(getBilanCohorts()[0]));
    return getBilanCohorts()[0].prefix;
  })));
  assert.deepEqual(results,["XA","XB"]);
  assert.throws(getBilanCohorts,/REGISTRY_UNAVAILABLE/);
});

test("catalogue refuse collisions, doublons, dates invalides et identités incohérentes", () => {
  const base = months[0];
  for(const invalid of [{...base,prefix:""},{...base,month:13},{...base,year:1999},{...base,id:"2027-07" as const}]) {
    assert.throws(()=>validateCohortDefinitions([invalid]),/REGISTRY_INVALID/);
  }
  for(const invalid of [{...base,id:"2028-01" as const,year:2028,month:1}, {...base,prefix:"XX"}, {...base,id:"2028-01" as const,year:2028,month:1,prefix:"JLA"}]) {
    assert.throws(()=>validateCohortDefinitions([...months,invalid]),/REGISTRY_INVALID/);
  }
});

function request(method: string, body?: object) {
  return new Request("https://test.invalid/api/admin/bilan/origin-months",{method, ...(body ? {headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
}

for(const status of [401,403] as const) test(`registre inaccessible sans Admin (${status}), aucune lecture/écriture`, async () => {
  let accesses=0;
  const handlers=createOriginMonthHandlers({authorize:async()=>({authorized:false,status}),read:async()=>{accesses++;return months;},create:async()=>{accesses++;},update:async()=>{accesses++;}});
  for(const method of ["GET","POST","PATCH"] as const) assert.equal((await handlers[method](request(method))).status,status);
  assert.equal(accesses,0);
});

test("Admin : lecture complète, ajout explicite et attribution de l’acteur serveur", async () => {
  const writes: unknown[]=[];
  const handlers=createOriginMonthHandlers({authorize:async()=>admin,read:async()=>months,create:async(input,by)=>{writes.push({input,by});},update:async(input,by)=>{writes.push({input,by});}});
  assert.equal((await (await handlers.GET(request("GET"))).json()).months.length,7);
  assert.equal((await handlers.POST(request("POST",{prefix:" fb ",year:2027,month:2,label:"Février 2027"}))).status,200);
  assert.deepEqual(writes,[{input:{prefix:"FB",year:2027,month:2,label:"Février 2027"},by:actor}]);
  assert.equal((await handlers.PATCH(request("PATCH",{id:actor,label:"Historique",active:false}))).status,200);
  assert.equal(writes.length,2);
});

test("API refuse toute réaffectation et création invalide avant RPC", async () => {
  let writes=0;
  const handlers=createOriginMonthHandlers({authorize:async()=>admin,read:async()=>months,create:async()=>{writes++;},update:async()=>{writes++;}});
  for(const extra of [{prefix:"XX"},{year:2027},{month:10},{created_by:actor}]) assert.equal((await handlers.PATCH(request("PATCH",{id:actor,label:"Test",active:true,...extra}))).status,400);
  for(const extra of [{prefix:""},{month:13},{year:1999},{actorId:actor}]) assert.equal((await handlers.POST(request("POST",{prefix:"FB",year:2027,month:2,label:"Test",...extra}))).status,400);
  assert.equal(writes,0);
});

test("registre indisponible : 503 sans formule exécutée, données fabriquées ou fuite", async () => {
  let builds=0;
  const get=createBilanGetHandler({authorize:async()=>admin,registry:async()=>{throw new Error("private diagnostic");},build:async()=>{builds++;return {};}});
  const response=await get(new Request("https://test.invalid/api/admin/bilan?cohort=AT"));
  assert.equal(response.status,503); assert.equal(builds,0);
  assert.doesNotMatch(await response.text(),/private diagnostic/);
  const handlers=createOriginMonthHandlers({authorize:async()=>admin,read:async()=>{throw new Error("private diagnostic");},create:async()=>{},update:async()=>{}});
  const unavailable=await handlers.GET(request("GET"));
  assert.equal(unavailable.status,503); assert.deepEqual(await unavailable.json(),{code:"BILAN_REGISTRY_UNAVAILABLE"});
});

test("aucune copie statique runtime, suppression ou écriture métier dans le registre", () => {
  const reader=readFileSync("src/server/bilan-origin-months.ts","utf8");
  const route=readFileSync("src/app/api/admin/bilan/origin-months/route.ts","utf8");
  assert.match(reader,/import "server-only"/);
  assert.doesNotMatch(reader,/\.from\("(?!bilan_origin_months")/);
  assert.doesNotMatch(route,/export.*DELETE/);
  assert.doesNotMatch(readFileSync("src/features/admin/bilan/cohort-registry.ts","utf8"),/BILAN_COHORTS|prefix:\s*["']AT/);
});
