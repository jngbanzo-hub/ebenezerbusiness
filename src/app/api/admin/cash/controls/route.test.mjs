import assert from "node:assert/strict";import fs from "node:fs";import test from "node:test";
const route=fs.readFileSync(new URL("./route.ts",import.meta.url),"utf8");const service=fs.readFileSync(new URL("../../../../../server/cash-admin-controls.ts",import.meta.url),"utf8");
test("route réservée à authorizeAdminRequest et fermée par défaut",()=>{assert.match(route,/authorizeAdminRequest\(request\)/);assert.match(route,/CASH_ADMIN_CONTROLS_ENABLED/);assert.match(route,/WRITES_DISABLED/);});
test("identité et service_role restent exclusivement serveur",()=>{assert.match(service,/SUPABASE_SERVICE_ROLE_KEY/);assert.match(service,/p_admin_user_id:actor\.userId/);assert.doesNotMatch(route,/p_admin_user_id|SUPABASE_SERVICE_ROLE_KEY/);});
test("aucune commande Admin n'est exposée aux routes Agent",()=>{assert.doesNotMatch(route,/authorizeAgentRequest/);});
