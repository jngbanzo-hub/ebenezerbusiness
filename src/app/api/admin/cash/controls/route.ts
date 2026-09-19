import { authorizeAdminRequest } from "@/server/admin-authorization";
import { CashAdminControlError, executeCashAdminCommand } from "@/server/cash-admin-controls";
import { recordInternalNotification } from "@/server/internal-notifications";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function POST(request:Request){
  if(process.env.CASH_ADMIN_CONTROLS_ENABLED?.trim().toLowerCase()!=="true")return failure("WRITES_DISABLED","Les commandes Admin Caisse ne sont pas activées.",503);
  const auth=await authorizeAdminRequest(request);if(!auth.authorized)return failure(auth.status===401?"UNAUTHORIZED":"FORBIDDEN","Accès Admin refusé.",auth.status);
  let body:unknown;try{body=await request.json();}catch{return failure("INVALID_COMMAND","Corps JSON invalide.",400);}
  try{const result=await executeCashAdminCommand(body,{userId:auth.userId,name:auth.email,role:"ADMIN"});if(!result.replayed)await recordInternalNotification({eventKey:`CASH:${result.resultId}`,agency:result.agency,type:"CASH",title:"Contrôle Admin Caisse",message:`${result.action} — ${result.agency} — opération auditée`,actorUserId:auth.userId,actorName:auth.email}).catch(()=>undefined);return Response.json(result,{status:result.replayed?200:201,headers:noStore});}catch(error){if(!(error instanceof CashAdminControlError))return failure("SERVICE_UNAVAILABLE","Service Caisse indisponible.",503);const status=error.code==="INVALID_COMMAND"?400:error.code==="SERVICE_UNAVAILABLE"?503:409;return failure(error.code,error.message,status);}
}
const noStore={"Cache-Control":"private, no-store, max-age=0"};function failure(code:string,message:string,status:number){return Response.json({error:{code,message}},{status,headers:noStore});}
