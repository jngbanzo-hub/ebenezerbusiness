import { correctTransferCodeAsAdmin } from "@/server/transferts-admin-code-correction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { transferId: string } }
) {
  return correctTransferCodeAsAdmin(request, params.transferId);
}
