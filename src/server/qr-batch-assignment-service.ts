import "server-only";

import { assignQrLabelInternally, QrAssignmentMutationError } from "@/server/qr-assignment-service";
import { readCanonicalManifestIdentities } from "@/server/qr-batch-prevalidation";
import type { QrAgency } from "@/server/qr-identity-certifier";

export type QrBatchAssignmentCommand = {
  lineNumber: number;
  displayNumber: number;
  agency: QrAgency;
  trackingCode: string;
  expectedVersion: number;
  requestId: string;
};

export type QrBatchAssignmentLineResult = {
  lineNumber: number;
  requestId: string;
  state: "ASSOCIATED" | "ALREADY_ASSOCIATED" | "ERROR";
  code?: string;
  replayed?: boolean;
};

export async function assignQrBatchInternally(
  actorId: string,
  commands: QrBatchAssignmentCommand[]
): Promise<QrBatchAssignmentLineResult[]> {
  const startedAt = Date.now();
  const manifestStartedAt = Date.now();
  const identities = await readCanonicalManifestIdentities();
  console.info("[qr-batch-assignment]", JSON.stringify({
    step: "MANIFEST_CANONICAL",
    durationMs: Date.now() - manifestStartedAt,
    success: true
  }));

  const results = await mapWithConcurrency(commands, 4, async (command) => {
    const lineStartedAt = Date.now();
    const manifestKey = `${command.agency}|${command.trackingCode}`;
    if (!identities.has(manifestKey)) {
      return result(command, "ERROR", "IDENTITY_NOT_FOUND", lineStartedAt);
    }
    try {
      const assigned = await assignQrLabelInternally({ actorId, ...command });
      return result(
        command,
        assigned.replayed ? "ALREADY_ASSOCIATED" : "ASSOCIATED",
        undefined,
        lineStartedAt,
        assigned.replayed
      );
    } catch (cause) {
      const code = cause instanceof QrAssignmentMutationError ? cause.code : "QR_SERVICE_UNAVAILABLE";
      const state = code === "QR_NOT_UNASSIGNED" ? "ALREADY_ASSOCIATED" : "ERROR";
      return result(command, state, code, lineStartedAt);
    }
  });
  console.info("[qr-batch-assignment]", JSON.stringify({
    step: "BATCH_RESULT",
    durationMs: Date.now() - startedAt,
    success: true,
    lines: results.length,
    associated: results.filter((line) => line.state === "ASSOCIATED").length,
    alreadyAssociated: results.filter((line) => line.state === "ALREADY_ASSOCIATED").length,
    errors: results.filter((line) => line.state === "ERROR").length
  }));
  return results;
}

function result(
  command: QrBatchAssignmentCommand,
  state: QrBatchAssignmentLineResult["state"],
  code: string | undefined,
  startedAt: number,
  replayed = false
): QrBatchAssignmentLineResult {
  console.info("[qr-batch-assignment]", JSON.stringify({
    step: "ASSIGN_LINE",
    lineNumber: command.lineNumber,
    durationMs: Date.now() - startedAt,
    success: state !== "ERROR",
    state,
    code
  }));
  return { lineNumber: command.lineNumber, requestId: command.requestId, state, code, replayed };
}

async function mapWithConcurrency<T, R>(values: readonly T[], concurrency: number, worker: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}
