import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  createTrackingResultFromPublicRecord,
  type TrackingResult
} from "@/features/tracking/tracking-data";
import { trackingSiteSchema } from "@/features/tracking/tracking-validation";
import { findPublicTrackingRecordByCode } from "@/server/google-sheets";

export const qrIdSchema = z.string().regex(/^EEBQR[0-9]{6,}$/);

const qrRegistryResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNKNOWN") }).strict(),
  z.object({ qrId: qrIdSchema, status: z.literal("UNASSIGNED") }).strict(),
  z.object({ qrId: qrIdSchema, status: z.literal("REVOKED") }).strict(),
  z
    .object({
      qrId: qrIdSchema,
      status: z.literal("ASSIGNED"),
      agency: trackingSiteSchema,
      trackingCode: z.string().min(1).max(64)
    })
    .strict()
]);

export type PublicQrResolution =
  | { state: "INVALID" }
  | { state: "UNKNOWN" }
  | { state: "UNASSIGNED"; qrId: string }
  | { state: "REVOKED"; qrId: string }
  | { state: "ASSIGNED"; qrId: string; result: TrackingResult }
  | { state: "TRACKING_NOT_FOUND"; qrId: string }
  | { state: "UNAVAILABLE" };

type Dependencies = {
  readRegistry: (qrId: string) => Promise<unknown>;
  findTracking: typeof findPublicTrackingRecordByCode;
};

export function createPublicQrResolver(dependencies: Dependencies) {
  return async (rawQrId: string): Promise<PublicQrResolution> => {
    const parsedQrId = qrIdSchema.safeParse(rawQrId);
    if (!parsedQrId.success) return { state: "INVALID" };

    try {
      const registry = qrRegistryResultSchema.parse(
        await dependencies.readRegistry(parsedQrId.data)
      );

      if (registry.status === "UNKNOWN") return { state: "UNKNOWN" };
      if (registry.status === "UNASSIGNED") {
        return { state: "UNASSIGNED", qrId: registry.qrId };
      }
      if (registry.status === "REVOKED") return { state: "REVOKED", qrId: registry.qrId };

      const record = await dependencies.findTracking(registry.trackingCode, registry.agency);
      if (!record) return { state: "TRACKING_NOT_FOUND", qrId: registry.qrId };

      return {
        state: "ASSIGNED",
        qrId: registry.qrId,
        result: createTrackingResultFromPublicRecord(record)
      };
    } catch (error) {
      console.error("[public-qr] Resolution failed", error);
      return { state: "UNAVAILABLE" };
    }
  };
}

async function readRegistry(qrId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("QR_SERVICE_NOT_CONFIGURED");

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  }).schema("public");
  const { data, error } = await client.rpc("resolve_qr_public", { p_qr_id: qrId });
  if (error) throw error;
  return data;
}

export const resolvePublicQr = createPublicQrResolver({
  readRegistry,
  findTracking: findPublicTrackingRecordByCode
});
