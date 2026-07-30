import { executeAgentTransferAction } from "@/server/transferts-agent-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { transferId: string } }) {
  return executeAgentTransferAction(request, params.transferId, "CANCEL_TRANSFER", true);
}
