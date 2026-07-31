import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const common = { agency: z.enum(["FIH","LSHI","KLZ"]), businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), requestId: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/), reason: z.string().trim().min(3).max(500), confirmationFinal: z.literal(true) };
export const cashAdminCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("ADJUSTMENT"), amount: z.number().positive().multipleOf(0.01), direction: z.enum(["CREDIT","DEBIT"]) }).strict(),
  z.object({ ...common, action: z.literal("CORRECTION"), targetEventId: z.string().trim().min(8).max(200), newAmount: z.number().positive().multipleOf(0.01) }).strict(),
  z.object({ ...common, action: z.literal("CLOSE") }).strict(),
  z.object({ ...common, action: z.literal("REOPEN"), closureId: z.string().trim().min(8).max(200) }).strict()
]);
export type CashAdminCommand = z.infer<typeof cashAdminCommandSchema>;
export type CashAdminResult = Readonly<{ state:"SUCCESS"; replayed:boolean; action:CashAdminCommand["action"]; agency:"FIH"|"LSHI"|"KLZ"; businessDate:string; resultId:string }>;
export class CashAdminControlError extends Error { constructor(readonly code:string, message:string){super(message);} }

export async function executeCashAdminCommand(raw:unknown, actor:{userId:string;name:string;role:"ADMIN"}):Promise<CashAdminResult>{
  const parsed=cashAdminCommandSchema.safeParse(raw); if(!parsed.success||actor.role!=="ADMIN")throw new CashAdminControlError("INVALID_COMMAND","Commande Admin invalide.");
  const command=parsed.data; const fingerprint=createHash("sha256").update(JSON.stringify({...command,confirmationFinal:undefined,actorUserId:actor.userId})).digest("hex");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!url||!key)throw new CashAdminControlError("SERVICE_UNAVAILABLE","Service Caisse indisponible.");
  const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data,error}=await client.rpc("execute_cash_admin_command",{p_action:command.action,p_agency:command.agency,p_business_date:command.businessDate,p_request_id:command.requestId,p_admin_user_id:actor.userId,p_admin_name:actor.name,p_reason:command.reason,p_amount:command.action==="ADJUSTMENT"?command.amount:command.action==="CORRECTION"?command.newAmount:null,p_direction:command.action==="ADJUSTMENT"?command.direction:null,p_target_event_id:command.action==="CORRECTION"?command.targetEventId:null,p_closure_id:command.action==="REOPEN"?command.closureId:null,p_fingerprint:fingerprint});
  if(error){const code=["IDEMPOTENCY_CONFLICT","ACCOUNT_NOT_ACTIVE","TARGET_NOT_FOUND","DAY_ALREADY_CLOSED","CLOSURE_NOT_FOUND","NEGATIVE_CASH_BALANCE"].find((item)=>error.message.includes(item))??"SERVICE_UNAVAILABLE";throw new CashAdminControlError(code,publicMessage(code));}
  if(!isResult(data))throw new CashAdminControlError("SERVICE_UNAVAILABLE","Résultat Caisse invalide."); return Object.freeze(data);
}
function isResult(value:unknown):value is CashAdminResult{if(typeof value!=="object"||value===null)return false;const row=value as Record<string,unknown>;return row.state==="SUCCESS"&&typeof row.replayed==="boolean"&&["ADJUSTMENT","CORRECTION","CLOSE","REOPEN"].includes(String(row.action))&&["FIH","LSHI","KLZ"].includes(String(row.agency))&&typeof row.businessDate==="string"&&typeof row.resultId==="string";}
function publicMessage(code:string){return ({IDEMPOTENCY_CONFLICT:"Ce requestId correspond à une autre commande.",ACCOUNT_NOT_ACTIVE:"La caisse doit être ACTIVE.",TARGET_NOT_FOUND:"Événement cible introuvable.",DAY_ALREADY_CLOSED:"Cette journée est déjà clôturée.",CLOSURE_NOT_FOUND:"Clôture active introuvable.",NEGATIVE_CASH_BALANCE:"Le solde calculé serait négatif."} as Record<string,string>)[code]??"Service Caisse indisponible.";}
