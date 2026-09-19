import "server-only";

import { z } from "zod";

const whatsappHealthSchema = z.object({
  overallStatus: z.enum(["SAIN", "ATTENTION", "INCIDENT"]),
  dialog360: z.enum(["OPERATIONAL", "PROBLEM", "UNKNOWN"]),
  scheduler: z.enum(["ACTIVE", "PROBLEM", "UNKNOWN"]),
  cloudRun: z.enum(["ACTIVE", "OPERATIONAL", "PROBLEM", "UNKNOWN"]),
  lastRun: z.enum(["SUCCESS", "FAILURE", "EN COURS", "UNKNOWN"]),
  invalidRecipient24h: z.number().int().nonnegative(),
  deliveryUncertainRecent: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  checkedAt: z.string().datetime({ offset: true }),
  unavailableDependencies: z.array(z.enum(["dialog360", "scheduler", "cloudRun", "runs", "metrics"])).optional()
}).strict();

export type WhatsappHealth = z.infer<typeof whatsappHealthSchema>;
export type WhatsappHealthResult = Readonly<{ status: "AVAILABLE"; health: WhatsappHealth }> | Readonly<{ status: "UNAVAILABLE"; health: null }>;

export async function readWhatsappHealth(fetchImpl: typeof fetch = fetch): Promise<WhatsappHealthResult> {
  const url = process.env.WHATSAPP_HEALTH_URL?.trim();
  const token = process.env.WHATSAPP_HEALTH_READER_TOKEN?.trim();
  if (!url || !token || token.length < 32) return unavailable();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (!response.ok) return unavailable();
    const parsed = whatsappHealthSchema.safeParse(await response.json());
    return parsed.success ? Object.freeze({ status: "AVAILABLE" as const, health: parsed.data }) : unavailable();
  } catch { return unavailable(); }
  finally { clearTimeout(timeout); }
}

function unavailable(): WhatsappHealthResult { return Object.freeze({ status: "UNAVAILABLE", health: null }); }
