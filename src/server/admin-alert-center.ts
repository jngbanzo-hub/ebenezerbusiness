import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getPortoNovoBusinessDate } from "@/features/cash/cash-dashboard";
import { getQrStockAlert } from "@/features/qr-label/qr-stock-alert";
import { readAdminExpenses } from "@/server/agent-expenses-apps-script";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { searchAdminParcelGlobally } from "@/server/admin-global-parcel-search";
import { determineParcelConsistency } from "@/server/admin-parcel-consistency";
import { createServerCashDashboardSource } from "@/server/cash-dashboard-source";
import { readQrStockSummary } from "@/server/qr-stock-summary";
import { consistencyAlerts, deduplicateAlerts, paymentAlerts, qrStockAlert, sourceUnavailable, staleStorageAlert, type AdminAlert, type AdminAlertCategory } from "@/server/admin-alert-rules";

type AdminIdentity={userId:string;email:string;agency:"COO"|"FIH"|"LSHI"|"KLZ"|null};
export type AdminAlertCenterResult={generatedAt:string;count:number;alerts:AdminAlert[];thresholds:{storageStaleDays:number;cooPartialPaymentDays:number}};

export async function readAdminAlertCenter(identity:AdminIdentity, now=new Date()):Promise<AdminAlertCenterResult>{
  const generatedAt=now.toISOString(), storageDays=positiveEnv("ADMIN_ALERT_STORAGE_STALE_DAYS",30), partialDays=positiveEnv("ADMIN_ALERT_COO_PARTIAL_DAYS",7);
  const groups=await Promise.all([
    isolated("QR",generatedAt,async()=>{const count=(await readQrStockSummary()).unassigned;return qrStockAlert(count,generatedAt,getQrStockAlert(count));}),
    isolated("STOCKAGE",generatedAt,async()=>readStorageAlerts(now,storageDays)),
    isolated("ENCAISSEMENTS",generatedAt,async()=>readPaymentAlerts(now,partialDays)),
    isolated("CAISSE",generatedAt,()=>readCashAlerts(now)),
    isolated("DÉPENSES",generatedAt,async()=>{await readAdminExpenses(identity,{page:1,pageSize:1});return [];}),
    isolated("COHÉRENCE COLIS",generatedAt,()=>readConsistencyAlerts(identity.userId,generatedAt))
  ]);
  const alerts=deduplicateAlerts(groups.flat()); return {generatedAt,count:alerts.length,alerts,thresholds:{storageStaleDays:storageDays,cooPartialPaymentDays:partialDays}};
}

async function isolated(category:AdminAlertCategory,now:string,read:()=>Promise<AdminAlert[]>){try{return await withTimeout(read(),12_000);}catch{return [sourceUnavailable(category,now)];}}
async function readStorageAlerts(now:Date,days:number){const {data,error}=await client().from("stockage_parcels").select("tracking_code,agency,updated_at").in("delivery_status",["AVAILABLE","PRESENT"]);if(error)throw new Error("STORAGE_UNAVAILABLE");return (data??[]).map((row)=>staleStorageAlert({trackingCode:String(row.tracking_code),agency:agency(row.agency),updatedAt:String(row.updated_at)},now,days)).filter((value):value is AdminAlert=>Boolean(value));}
async function readPaymentAlerts(now:Date,days:number){return (await readAdminPayments()).flatMap((item)=>paymentAlerts({id:item.id,trackingCode:item.codeColis,agency:item.agenceEncaissement,expected:item.montantAttendu,paid:item.montantPaye,status:item.statutPaiement,occurredAt:item.dateTime},now,days));}
async function readCashAlerts(now:Date){const dashboard=await createServerCashDashboardSource().readAdmin(getPortoNovoBusinessDate(now));return dashboard.agencies.flatMap((item)=>item.anomalies.map((anomaly)=>({id:`cash:${item.agency}:${anomaly.businessDate}:${anomaly.type}`,level:"ATTENTION" as const,category:"CAISSE" as const,title:"ANOMALIE CAISSE À VÉRIFIER",agency:item.agency,trackingCode:null,occurredAt:`${anomaly.businessDate}T00:00:00.000Z`,description:anomaly.type,sources:["cash_anomalies"]})));}
async function readConsistencyAlerts(actorId:string,now:string){const {data,error}=await client().rpc("read_qr_manifest_registry_server",{p_display_numbers:[]});if(error||!data||typeof data!=="object")throw new Error("QR_REGISTRY_UNAVAILABLE");const assignments=Array.isArray(data.activeAssignments)?data.activeAssignments as Array<Record<string,unknown>>:[];const codes=Array.from(new Set(assignments.map((row)=>String(row.trackingCode??"").trim().toUpperCase()).filter(Boolean)));const results=await Promise.all(codes.map((code)=>searchAdminParcelGlobally(actorId,code)));return results.flatMap((result)=>consistencyAlerts(result.code,determineParcelConsistency({manifest:result.manifest.matches,qr:result.qr.matches,storage:result.storage.matches}),now));}
function client(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();if(!url||!key)throw new Error("SERVICE_UNAVAILABLE");return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}).schema("public");}
function agency(value:unknown){if(!["FIH","LSHI","KLZ"].includes(String(value)))throw new Error("INVALID_AGENCY");return value as "FIH"|"LSHI"|"KLZ";}
function positiveEnv(name:string,fallback:number){const value=Number(process.env[name]);return Number.isInteger(value)&&value>0?value:fallback;}
function withTimeout<T>(promise:Promise<T>,delay:number){return Promise.race([promise,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("SOURCE_TIMEOUT")),delay))]);}
