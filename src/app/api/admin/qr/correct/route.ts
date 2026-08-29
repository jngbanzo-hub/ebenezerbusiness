import {NextResponse} from "next/server"; import {z} from "zod";
import {authorizeAdminRequest} from "@/server/admin-authorization"; import {correctAdminQr} from "@/server/qr-admin-service"; import {certifyQrParcelIdentity,QrIdentityCertificationError} from "@/server/qr-identity-certifier";
const reason=z.string().trim().min(20).max(500).refine(value=>!["correction","erreur","modifier","changement"].includes(value.toLowerCase()));
const schema=z.object({qrId:z.string().regex(/^EEBQR\d{6,}$/),agency:z.enum(["FIH","LSHI","KLZ"]),trackingCode:z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{1,63}$/),reason,expectedVersion:z.number().int().positive(),requestId:z.string().uuid()}).strict();
export async function POST(request:Request){
  let requestId:string|null=null;
  let step="AUTH";
  let startedAt=performance.now();
  const trace=(status:"success"|"error",code:string|null,externalStatus:number|null=null)=>console[status==="error"?"error":"info"]("[admin-qr-correct-trace]",{requestId,step,startedAt:new Date(Date.now()-(performance.now()-startedAt)).toISOString(),durationMs:Math.round(performance.now()-startedAt),status,code,externalStatus});
  try{
    const auth=await authorizeAdminRequest(request);
    if(!auth.authorized){trace("error","ACCESS_DENIED",auth.status);return fail("ACCESS_DENIED",auth.status);}
    trace("success",null);

    step="VALIDATION";startedAt=performance.now();
    const token=request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const parsed=schema.safeParse(await request.json().catch(()=>null));
    requestId=parsed.success?parsed.data.requestId:null;
    if(!token||!parsed.success){trace("error","INVALID_QR_ADMIN_CORRECTION",400);return fail("INVALID_QR_ADMIN_CORRECTION",400);}
    trace("success",null);

    step="MANIFEST_CERTIFICATION";startedAt=performance.now();
    const certified=await certifyQrParcelIdentity({agency:parsed.data.agency,trackingCode:parsed.data.trackingCode},token);
    trace("success",null,200);

    step="RPC_CORRECTION";startedAt=performance.now();
    const result=await correctAdminQr({actorId:auth.userId,...parsed.data,...certified});
    trace("success",null);

    step="RESPONSE_BUILD";startedAt=performance.now();
    const response=NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
    trace("success",null,200);
    return response;
  }catch(cause){
    if(cause instanceof QrIdentityCertificationError){
      trace("error",cause.diagnosticCode??cause.code,cause.externalStatus??cause.status);
      return fail(cause.code,cause.status);
    }
    const code=cause instanceof Error?cause.message:"QR_SERVICE_UNAVAILABLE";
    trace("error",code,status(code));
    return fail(code,status(code));
  }
}
function status(code:string){return code.includes("ADMIN")||code.includes("ACCESS")?403:code==="QR_NOT_FOUND"?404:code.includes("VERSION")||code.includes("ASSIGNED")||code.includes("UNCHANGED")?409:503;} function fail(code:string,status:number){return NextResponse.json({code},{status,headers:{"Cache-Control":"private, no-store"}});}
