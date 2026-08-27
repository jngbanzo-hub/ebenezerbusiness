import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const sql=fs.readFileSync(new URL("./013_klz_lshi_departure.sql",import.meta.url),"utf8");
test("RPC is isolated and service-role only",()=>{assert.match(sql,/create function public\.confirm_klz_lshi_departure/);assert.match(sql,/revoke all on function public\.confirm_klz_lshi_departure[\s\S]*from public,anon,authenticated/);assert.match(sql,/grant execute[\s\S]*to service_role/);});
test("departure is atomic and preserves parcel status constraints",()=>{for(const token of ["for update","delete from public.stockage_parcels","SORTIE_POUR_ACHEMINEMENT","FORWARDING_DEPARTED","status='IN_TRANSIT'","state='IN_TRANSIT'"])assert.ok(sql.includes(token),token);assert.doesNotMatch(sql,/stockage_parcels_status_check|stockage_parcels_delivery_check|delivery_status='DELIVERED'/);});
test("KLZ LSHI identity and suffix are strict",()=>{assert.match(sql,/v_code\|\|'-KLZ-LSHI'/);assert.match(sql,/origin_agency='KLZ' and destination_agency='LSHI'/);});
test("no payment or cash mutation exists",()=>{assert.doesNotMatch(sql,/insert into public\.cash_|update public\.cash_|payment_response\s*=/i);});
