import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/server/admin-authorization";
import {
  confirmExpenseCashRecovery,
  ExpenseCashRecoveryError,
  inspectExpenseCashRecovery
} from "@/server/expense-cash-recovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPENSE_REQUEST_ID = "625e5fe7-b0be-4353-b773-fed9c49e8a6f";
const CONFIRMATION = "CONFIRMER_DEBIT_CAISSE_KLZ";

export async function GET(request: Request) {
  if (!enabled()) return failure(404, "RECOVERY_DISABLED");
  const auth = await authorizeAdminRequest(request);
  if (!auth.authorized) return failure(auth.status, "ACCESS_DENIED");
  const url = new URL(request.url);
  if (Array.from(url.searchParams.keys()).length !== 0) {
    return failure(400, "EXPENSE_NOT_IN_SCOPE");
  }
  try {
    return NextResponse.json(
      await inspectExpenseCashRecovery(auth, EXPENSE_REQUEST_ID),
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    return recoveryFailure(error);
  }
}

export async function POST(request: Request) {
  if (!enabled()) return failure(404, "RECOVERY_DISABLED");
  const auth = await authorizeAdminRequest(request);
  if (!auth.authorized) return failure(auth.status, "ACCESS_DENIED");
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || Object.keys(body).length !== 1 || body.confirmation !== CONFIRMATION) {
    return failure(400, "CONFIRMATION_REQUIRED");
  }
  try {
    return NextResponse.json(
      await confirmExpenseCashRecovery(auth, EXPENSE_REQUEST_ID),
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    return recoveryFailure(error);
  }
}

function recoveryFailure(error: unknown) {
  if (error instanceof ExpenseCashRecoveryError) return failure(error.status, error.code);
  return failure(503, "RECOVERY_UNAVAILABLE");
}

function failure(status: number, code: string) {
  return NextResponse.json({ error: { code } }, { status, headers: noStoreHeaders() });
}

function noStoreHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function enabled() {
  return process.env.KLZ_EXPENSE_CASH_RECOVERY_ENABLED?.trim().toLowerCase() === "true";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
