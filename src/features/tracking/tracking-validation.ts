import { z } from "zod";

export const DEMO_TRACKING_CODE = "MR11826";

export const trackingSiteValues = ["FIH", "LSHI", "KLZ"] as const;

export type TrackingSite = (typeof trackingSiteValues)[number];

export const trackingSites: Array<{
  value: TrackingSite;
  label: string;
}> = [
  { value: "FIH", label: "🇨🇩 FIH – Kinshasa" },
  { value: "LSHI", label: "🇨🇩 LSHI – Lubumbashi" },
  { value: "KLZ", label: "🇨🇩 KLZ – Kolwezi" }
];

export const trackingSiteSchema = z.enum(trackingSiteValues);

export const trackingCodeSchema = z
  .string()
  .trim()
  .min(4, "Le code de suivi doit contenir au moins 4 caractères.")
  .max(32, "Le code de suivi ne doit pas dépasser 32 caractères.")
  .regex(/^[A-Za-z0-9-]+$/, "Le code de suivi ne doit contenir que des lettres, chiffres ou tirets.")
  .transform((value) => value.toUpperCase());

export const trackingFormSchema = z.object({
  trackingSite: z
    .string()
    .trim()
    .refine((value) => trackingSiteValues.includes(value as TrackingSite), {
      message: "Veuillez choisir votre site avant de rechercher votre colis."
    }),
  trackingCode: trackingCodeSchema
});

export type TrackingFormValues = z.infer<typeof trackingFormSchema>;
