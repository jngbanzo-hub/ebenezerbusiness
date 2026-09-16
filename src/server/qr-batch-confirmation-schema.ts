import { z } from "zod";

export const qrBatchConfirmationSchema = z.object({
  batchId: z.string().uuid(),
  lines: z.array(z.object({
    lineNumber: z.number().int().positive().safe(),
    displayNumber: z.number().int().positive().safe(),
    agency: z.enum(["FIH", "LSHI", "KLZ"]),
    trackingCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._/-]{1,63}$/),
    expectedVersion: z.number().int().positive().safe(),
    requestId: z.string().uuid()
  }).strict()).min(1).max(250)
}).strict();
