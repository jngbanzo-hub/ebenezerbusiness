import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { prevalidateQrBatch, readCanonicalManifestIdentities, readQrRegistrySnapshot } from "@/server/qr-batch-prevalidation";
import { qrBatchConfirmationSchema } from "@/server/qr-batch-confirmation-schema";

export type QrBatchAssignmentCommand = z.infer<typeof qrBatchConfirmationSchema>["lines"][number];
const resultLine = z.object({
  lineNumber: z.number().int().positive(), requestId: z.string().uuid(), displayNumber: z.number().int().positive(),
  agency: z.enum(["FIH", "LSHI", "KLZ"]), trackingCode: z.string(), expectedVersion: z.number(), qrId: z.string().optional(),
  state: z.enum(["ASSOCIATED", "ALREADY_ASSOCIATED", "ERROR"]), code: z.string().optional(), replayed: z.boolean().optional(),
  application: z.enum(["APPLIED", "NOT_APPLIED", "UNKNOWN"]), retrySafe: z.boolean()
});
const resultSchema = z.object({ batchId: z.string().uuid(), status: z.enum(["COMPLETED", "REJECTED", "IN_PROGRESS"]), lines: z.array(resultLine).max(250) })
  .superRefine((value, ctx) => {
    const invalid = value.status === "IN_PROGRESS" ? value.lines.length !== 0 :
      value.lines.length === 0 || value.lines.some(line => value.status === "COMPLETED"
        ? line.application !== "APPLIED" || line.state !== "ASSOCIATED" || line.retrySafe
        : line.application !== "NOT_APPLIED" || line.state !== "ERROR");
    if (invalid || new Set(value.lines.map(line => line.requestId)).size !== value.lines.length ||
      new Set(value.lines.map(line => line.lineNumber)).size !== value.lines.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid batch outcome" });
    }
  });
export type QrBatchAssignmentLineResult = z.infer<typeof resultLine>;
export type QrBatchResult = z.infer<typeof resultSchema>;
type RecordResult = { commands: QrBatchAssignmentCommand[]; result: QrBatchResult };
type Dependencies = {
  prevalidate: typeof prevalidateQrBatch;
  read: (actorId: string, batchId: string) => Promise<RecordResult | null>;
  assign: (actorId: string, batchId: string, commands: QrBatchAssignmentCommand[]) => Promise<QrBatchResult>;
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("QR_SERVICE_UNAVAILABLE");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}

export async function readQrBatchStatus(actorId: string, batchId: string): Promise<RecordResult | null> {
  if (!z.string().uuid().safeParse(batchId).success) throw new Error("INVALID_QR_BATCH");
  const { data, error } = await client().rpc("read_qr_assignment_batch_server", { p_actor_id: actorId, p_batch_id: batchId })
    .abortSignal(AbortSignal.timeout(3_000));
  if (error) throw new Error("QR_SERVICE_UNAVAILABLE");
  if (data === null) return null;
  const parsed = z.object({ commands: qrBatchConfirmationSchema.shape.lines, result: resultSchema }).safeParse(data);
  if (!parsed.success || parsed.data.result.batchId !== batchId) throw new Error("QR_SERVICE_UNAVAILABLE");
  return parsed.data;
}

const defaults: Dependencies = {
  read: readQrBatchStatus,
  prevalidate: (lines, token) => prevalidateQrBatch(lines, token, {
    readRegistry: readQrRegistrySnapshot,
    readManifestIdentities: () => readCanonicalManifestIdentities(true)
  }),
  assign: async (actorId, batchId, commands) => {
    const { data, error } = await client().rpc("assign_qr_batch_server", { p_actor_id: actorId, p_batch_id: batchId, p_lines: commands })
      .abortSignal(AbortSignal.timeout(12_000));
    if (error) throw new Error("QR_BATCH_RESULT_UNKNOWN");
    const parsed = resultSchema.safeParse(data);
    if (!parsed.success || parsed.data.batchId !== batchId) throw new Error("QR_BATCH_RESULT_UNKNOWN");
    return parsed.data;
  }
};

// No in-memory coordination is used for correctness: the DB owns the batch lock and journal.
export function createQrBatchRunner(dependencies: Dependencies = defaults) {
  return async function run(actorId: string, input: QrBatchAssignmentCommand[], batchId: string): Promise<QrBatchResult> {
    const parsed = qrBatchConfirmationSchema.safeParse({ batchId, lines: input });
    if (!parsed.success) throw new Error("INVALID_QR_BATCH");
    const commands = parsed.data.lines;
    for (const keys of [commands.map(c => c.lineNumber), commands.map(c => c.displayNumber),
      commands.map(c => c.requestId.toLowerCase()), commands.map(c => `${c.agency}|${c.trackingCode}`)]) {
      if (new Set<string | number>(keys).size !== keys.length) return rejected(batchId, commands, "DUPLICATE_IN_LIST");
    }
    const previous = await bounded(() => dependencies.read(actorId, batchId), 3_500);
    if (previous) {
      if (canonical(previous.commands) !== canonical(commands)) throw new Error("QR_IDEMPOTENCY_CONFLICT");
      return previous.result;
    }
    const checked = await bounded(() => dependencies.prevalidate(commands.map(c => ({
      lineNumber: c.lineNumber, displayNumber: String(c.displayNumber), agency: c.agency, trackingCode: c.trackingCode
    })), ""), 12_000);
    const byLine = new Map(checked.map(line => [line.lineNumber, line]));
    const failures = commands.map(c => {
      const check = byLine.get(c.lineNumber);
      if (!check || check.displayNumber !== String(c.displayNumber) || check.agency !== c.agency || check.trackingCode !== c.trackingCode) return "SOURCE_UNAVAILABLE";
      if (!check.ready) return check.result;
      return check.version === c.expectedVersion ? undefined : "QR_VERSION_CONFLICT";
    });
    if (checked.length !== commands.length || failures.some(Boolean)) {
      // Another instance may have committed between the first read and prevalidation.
      const committed = await bounded(() => dependencies.read(actorId, batchId), 3_500);
      if (committed) {
        if (canonical(committed.commands) !== canonical(commands)) throw new Error("QR_IDEMPOTENCY_CONFLICT");
        return committed.result;
      }
      return { batchId, status: "REJECTED", lines: commands.map((c, i) => ({ ...c, state: "ERROR", application: "NOT_APPLIED",
        code: failures[i] ?? "BATCH_NOT_STARTED", retrySafe: true })) };
    }
    const result = await bounded(() => dependencies.assign(actorId, batchId, commands), 12_500);
    if (result.status !== "IN_PROGRESS" && (result.lines.length !== commands.length || result.lines.some(line =>
      !commands.some(c => c.requestId === line.requestId && c.displayNumber === line.displayNumber && c.lineNumber === line.lineNumber)))) {
      throw new Error("QR_BATCH_RESULT_UNKNOWN");
    }
    return result;
  };
}
export const assignQrBatchInternally = createQrBatchRunner();

function rejected(batchId: string, commands: QrBatchAssignmentCommand[], code: string): QrBatchResult {
  return { batchId, status: "REJECTED", lines: commands.map(c => ({ ...c, state: "ERROR", application: "NOT_APPLIED", retrySafe: true, code })) };
}
function canonical(commands: QrBatchAssignmentCommand[]) {
  return JSON.stringify([...commands].sort((a, b) => a.lineNumber - b.lineNumber).map(c =>
    [c.lineNumber, c.displayNumber, c.agency, c.trackingCode, c.expectedVersion, c.requestId]));
}
export async function bounded<T>(operation: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("QR_SERVICE_UNAVAILABLE")), ms);
    })]);
  } finally { clearTimeout(timer); }
}
