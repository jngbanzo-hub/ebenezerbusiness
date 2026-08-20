import "server-only";

import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { AdminPayment, ManifestShipperRow } from "@/features/admin/types";
import { getPortoNovoBusinessDate } from "@/features/cash/cash-dashboard";
import { getQrStockAlert } from "@/features/qr-label/qr-stock-alert";
import { readAdminExpenses } from "@/server/agent-expenses-apps-script";
import { buildConsistencyInputsFromSnapshots } from "@/server/admin-alert-consistency-snapshots";
import { readAdminManifestRows } from "@/server/admin-manifest-sheets";
import { readAdminPayments } from "@/server/admin-payments-sheets";
import { determineParcelConsistency } from "@/server/admin-parcel-consistency";
import { createServerCashDashboardSource } from "@/server/cash-dashboard-source";
import { readQrStockSummary } from "@/server/qr-stock-summary";
import { consistencyAlerts, deduplicateAlerts, paymentAlerts, qrStockAlert, sourceUnavailable, staleStorageAlert, type AdminAlert, type AdminAlertCategory } from "@/server/admin-alert-rules";
import { syncAdminAlertReadStates } from "@/server/admin-alert-read-state";

type AdminIdentity={userId:string;email:string;agency:"COO"|"FIH"|"LSHI"|"KLZ"|null};
export type AdminAlertWithReadState=AdminAlert&{read:boolean;readAt:string|null;occurrence:number};
export type AdminAlertCenterResult={generatedAt:string;count:number;activeCount:number;unreadCount:number;readCount:number;alerts:AdminAlertWithReadState[];thresholds:{storageStaleDays:number;cooPartialPaymentDays:number}};

export async function readAdminAlertCenter(identity:AdminIdentity, now=new Date()):Promise<AdminAlertCenterResult>{
  const generatedAt=now.toISOString(), requestId=randomUUID(), storageDays=positiveEnv("ADMIN_ALERT_STORAGE_STALE_DAYS",30), partialDays=positiveEnv("ADMIN_ALERT_COO_PARTIAL_DAYS",7);
  const paymentsSnapshot=traced(requestId,"ENCAISSEMENTS","snapshot",()=>readAdminPayments());
  const groups=await Promise.all([
    isolated(requestId,"QR",generatedAt,async()=>{const count=(await readQrStockSummary()).unassigned;return qrStockAlert(count,generatedAt,getQrStockAlert(count));}),
    isolated(requestId,"STOCKAGE",generatedAt,async()=>readStorageAlerts(now,storageDays)),
    isolated(requestId,"ENCAISSEMENTS",generatedAt,async()=>readPaymentAlerts(await paymentsSnapshot,now,partialDays)),
    isolated(requestId,"CAISSE",generatedAt,()=>readCashAlerts(now)),
    isolated(requestId,"DÉPENSES",generatedAt,async()=>{await readAdminExpenses(identity,{page:1,pageSize:1});return [];}),
    isolated(requestId,"COHÉRENCE COLIS",generatedAt,()=>readConsistencyAlerts(requestId,generatedAt))
  ]);
  const activeAlerts=deduplicateAlerts(groups.flat());
  const states=await syncAdminAlertReadStates(identity.userId,activeAlerts.map((alert)=>alert.id));
  const alerts=activeAlerts.map((alert)=>{const state=states.get(alert.id);return {...alert,read:Boolean(state?.readAt),readAt:state?.readAt??null,occurrence:state?.occurrence??1};});
  const unreadCount=alerts.filter((alert)=>!alert.read).length;
  return {generatedAt,count:unreadCount,activeCount:alerts.length,unreadCount,readCount:alerts.length-unreadCount,alerts,thresholds:{storageStaleDays:storageDays,cooPartialPaymentDays:partialDays}};
}

async function isolated(requestId:string,category:AdminAlertCategory,now:string,read:()=>Promise<AdminAlert[]>){try{return await withTimeout(read(),12_000);}catch(error){logTrace(requestId,category,"alert-group",0,"error",error);return [sourceUnavailable(category,now)];}}
async function readStorageAlerts(now:Date,days:number){const {data,error}=await client().from("stockage_parcels").select("tracking_code,agency,updated_at").in("delivery_status",["AVAILABLE","PRESENT"]);if(error)throw new Error("STORAGE_UNAVAILABLE");return (data??[]).map((row)=>staleStorageAlert({trackingCode:String(row.tracking_code),agency:agency(row.agency),updatedAt:String(row.updated_at)},now,days)).filter((value):value is AdminAlert=>Boolean(value));}
async function readPaymentAlerts(payments:AdminPayment[],now:Date,days:number){return payments.flatMap((item)=>paymentAlerts({id:item.id,trackingCode:item.codeColis,agency:item.agenceEncaissement,expected:item.montantAttendu,paid:item.montantPaye,status:item.statutPaiement,occurredAt:item.dateTime},now,days));}
async function readCashAlerts(now:Date){const dashboard=await createServerCashDashboardSource().readAdmin(getPortoNovoBusinessDate(now));return dashboard.agencies.flatMap((item)=>item.anomalies.map((anomaly)=>({id:`cash:${item.agency}:${anomaly.businessDate}:${anomaly.type}`,level:"ATTENTION" as const,category:"CAISSE" as const,title:"ANOMALIE CAISSE À VÉRIFIER",agency:item.agency,trackingCode:null,occurredAt:`${anomaly.businessDate}T00:00:00.000Z`,description:anomaly.type,sources:["cash_anomalies"]})));}
async function readConsistencyAlerts(requestId:string,now:string){
  const data=await traced(requestId,"QR","registry",async()=>{const result=await client().rpc("read_qr_manifest_registry_server",{p_display_numbers:[]});if(result.error||!result.data||typeof result.data!=="object")throw new Error("QR_REGISTRY_UNAVAILABLE");return result.data;});
  const rawAssignments=Array.isArray(data.activeAssignments)?data.activeAssignments as Array<Record<string,unknown>>:[];
  const assignments=rawAssignments.map((row)=>({agency:nullableAgency(row.agency),trackingCode:String(row.trackingCode??"").trim()})).filter((row)=>row.trackingCode);
  const codes=Array.from(new Set(assignments.map((row)=>row.trackingCode.toUpperCase())));
  const [manifest,storage]=await Promise.all([
    optionalSnapshot(requestId,"MANIFESTE",()=>readAdminManifestRows()),
    optionalSnapshot(requestId,"STOCKAGE",async()=>{if(!codes.length)return [];const {data:rows,error}=await client().from("stockage_parcels").select("tracking_code,agency,delivery_status").in("tracking_code",codes);if(error)throw new Error("STORAGE_UNAVAILABLE");return rows??[];})
  ]);
  console.info("[admin-alerts-trace]",JSON.stringify({requestId,source:"COHÉRENCE COLIS",step:"in-memory-check",success:true,itemCount:assignments.length}));
  return buildConsistencyInputsFromSnapshots({
    assignments,
    manifest:(manifest as ManifestShipperRow[]).map((row)=>({agency:row.sourceSite,trackingCode:row.codeColisRaw,rowNumber:row.rowNumber})),
    storage:(storage as Array<Record<string,unknown>>).map((row)=>({agency:String(row.agency??""),trackingCode:String(row.tracking_code??""),status:String(row.delivery_status??"")}))
  }).flatMap((check)=>consistencyAlerts(check.code,determineParcelConsistency(check.input),now));
}
async function optionalSnapshot<T>(requestId:string,source:string,read:()=>Promise<T[]>){try{return await traced(requestId,source,"snapshot",read);}catch{return [] as T[];}}
async function traced<T>(requestId:string,source:string,step:string,read:()=>Promise<T>){const started=Date.now();try{const value=await read();logTrace(requestId,source,step,Date.now()-started,"success");return value;}catch(error){logTrace(requestId,source,step,Date.now()-started,"error",error);throw error;}}
function logTrace(requestId:string,source:string,step:string,durationMs:number,status:"success"|"error",error?:unknown){const candidate=error as {name?:unknown;code?:unknown;status?:unknown};console.info("[admin-alerts-trace]",JSON.stringify({requestId,source,step,durationMs,status,errorType:error?String(candidate?.name??"Error"):undefined,errorCode:error?String(candidate?.code??candidate?.status??"")||undefined:undefined}));}
function client(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();if(!url||!key)throw new Error("SERVICE_UNAVAILABLE");return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}).schema("public");}
function agency(value:unknown){if(!["FIH","LSHI","KLZ"].includes(String(value)))throw new Error("INVALID_AGENCY");return value as "FIH"|"LSHI"|"KLZ";}
function nullableAgency(value:unknown){return ["FIH","LSHI","KLZ"].includes(String(value))?String(value) as "FIH"|"LSHI"|"KLZ":null;}
function positiveEnv(name:string,fallback:number){const value=Number(process.env[name]);return Number.isInteger(value)&&value>0?value:fallback;}
function withTimeout<T>(promise:Promise<T>,delay:number){return Promise.race([promise,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("SOURCE_TIMEOUT")),delay))]);}
