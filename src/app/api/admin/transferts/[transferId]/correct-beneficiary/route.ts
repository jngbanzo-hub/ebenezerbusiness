import { correctTransferFieldAsAdmin } from "@/server/transferts-admin-field-correction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { transferId: string } }
) {
  return correctTransferFieldAsAdmin(request, params.transferId, "beneficiary");
}
