"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, MapPin, PackageCheck, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  statusConfig,
  trackingDetailItems,
  trackingHighlights,
  type TrackingResult
} from "@/features/tracking/tracking-data";
import {
  DEMO_TRACKING_CODE,
  trackingFormSchema,
  trackingSites,
  type TrackingFormValues
} from "@/features/tracking/tracking-validation";
import {
  PublicQrScanner,
  type PublicQrApiResponse
} from "@/features/tracking/public-qr-scanner";
import { cn } from "@/lib/utils";

type TrackingApiResponse =
  | {
      found: true;
      result: TrackingResult;
    }
  | {
      found: false;
      message: string;
    };

type TrackingFeedback = {
  tone: "error" | "info";
  message: string;
} | null;

export function ParcelTracking() {
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [trackingFeedback, setTrackingFeedback] = useState<TrackingFeedback>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<TrackingFormValues>({
    resolver: zodResolver(trackingFormSchema),
    defaultValues: {
      trackingSite: "",
      trackingCode: ""
    }
  });
  const formErrorMessage = errors.trackingSite?.message ?? errors.trackingCode?.message;

  async function onSubmit(values: TrackingFormValues) {
    setTrackingFeedback(null);

    try {
      const trackingParams = new URLSearchParams({
        site: values.trackingSite
      });
      const response = await fetch(`/api/tracking/${encodeURIComponent(values.trackingCode)}?${trackingParams.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
      const payload = (await response.json()) as TrackingApiResponse;

      if (!payload.found) {
        setResult(null);
        setTrackingFeedback({
          tone: "error",
          message:
            payload.message ??
            "Aucun colis trouvé avec ce code. Vérifiez le code ou contactez notre service client."
        });
        return;
      }

      if (!response.ok) {
        setResult(null);
        setTrackingFeedback({
          tone: "error",
          message:
            "Le service de suivi est temporairement indisponible. Veuillez réessayer ou contacter notre service client."
        });
        return;
      }

      setResult(payload.result);
    } catch {
      setResult(null);
      setTrackingFeedback({
        tone: "error",
        message:
          "Le service de suivi est temporairement indisponible. Veuillez réessayer ou contacter notre service client."
      });
    }
  }

  function onQrResolved(resolution: PublicQrApiResponse) {
    if (resolution.state === "ASSIGNED") {
      setTrackingFeedback(null);
      setResult(resolution.result);
      return;
    }

    setResult(null);
    const messages: Record<Exclude<PublicQrApiResponse["state"], "ASSIGNED">, TrackingFeedback> = {
      UNASSIGNED: { tone: "info", message: "QR Eben Ezer Business valide — association au colis en attente." },
      REVOKED: { tone: "error", message: "Ce QR Eben Ezer Business n’est pas utilisable." },
      UNKNOWN: { tone: "error", message: "Ce QR ne correspond pas à un QR Eben Ezer Business utilisable." },
      INVALID: { tone: "error", message: "QR Eben Ezer Business non reconnu." },
      TRACKING_NOT_FOUND: { tone: "error", message: "Aucun colis trouvé avec ce QR. Contactez notre service client." },
      UNAVAILABLE: { tone: "error", message: "Le service de suivi est temporairement indisponible. Veuillez réessayer." }
    };
    setTrackingFeedback(messages[resolution.state]);
  }

  return (
    <GlassPanel className="overflow-hidden p-0" glow="growth">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(30,99,255,0.20),rgba(163,230,53,0.08),rgba(255,255,255,0.035))] p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Badge variant="premium">Suivi professionnel</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              Suivi de colis
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Saisissez votre Tracking ID pour consulter les informations officielles du colis.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[28rem]">
            {trackingHighlights.map((highlight) => {
              const Icon = highlight.icon;

              return (
                <div
                  key={highlight.label}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-muted-foreground"
                >
                  <Icon className="h-4 w-4 shrink-0 text-accent" />
                  <span>{highlight.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-7">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-xl border border-white/10 bg-[#030A13]/88 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.32)]"
        >
          <label className="sr-only" htmlFor="parcel-tracking-number">
            Tracking ID
          </label>
          <label className="sr-only" htmlFor="parcel-tracking-site">
            Choisissez votre site
          </label>
          <div className="grid gap-3 lg:grid-cols-[auto_minmax(13rem,0.42fr)_minmax(0,1fr)_auto] lg:items-center">
            <div className="hidden h-14 w-14 place-items-center rounded-lg border border-accent/20 bg-accent/10 text-accent sm:grid">
              <PackageCheck className="h-6 w-6" />
            </div>
            <div className="flex min-h-14 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-4 transition-colors focus-within:border-accent/40 focus-within:bg-white/[0.07]">
              <MapPin className="h-5 w-5 shrink-0 text-accent" />
              <div className="w-full min-w-0">
                <span className="block text-[11px] font-semibold uppercase text-muted-foreground">
                  Choisissez votre site
                </span>
                <select
                  id="parcel-tracking-site"
                  className="h-8 w-full bg-transparent text-sm font-semibold text-white outline-none [color-scheme:dark] disabled:opacity-60"
                  aria-invalid={Boolean(errors.trackingSite)}
                  {...register("trackingSite")}
                >
                  <option value="" className="bg-ebe-night text-muted-foreground">
                    Sélectionner
                  </option>
                  {trackingSites.map((site) => (
                    <option key={site.value} value={site.value} className="bg-ebe-night text-white">
                      {site.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex min-h-14 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-4 transition-colors focus-within:border-accent/40 focus-within:bg-white/[0.07]">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="w-full">
                <span className="block text-[11px] font-semibold uppercase text-muted-foreground">
                  Tracking ID
                </span>
                <input
                  id="parcel-tracking-number"
                  className="h-8 w-full bg-transparent font-mono text-base font-semibold uppercase tracking-normal text-white outline-none placeholder:font-sans placeholder:normal-case placeholder:text-muted-foreground"
                  placeholder={`Ex : ${DEMO_TRACKING_CODE}`}
                  autoComplete="off"
                  aria-invalid={Boolean(errors.trackingCode)}
                  {...register("trackingCode")}
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="growth"
              size="lg"
              className="h-14 w-full px-7 shadow-lime hover:shadow-[0_0_0_1px_rgba(163,230,53,0.35),0_24px_70px_rgba(163,230,53,0.22)] lg:w-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Recherche..." : "Suivre"}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
          <p className="px-1 pt-3 text-xs font-medium text-muted-foreground">
            Choisissez votre site, puis saisissez simplement votre Tracking ID : MR00126, JL00126 ou JN00126.
          </p>
        </form>

        <div className="my-5 flex items-center gap-4" aria-hidden="true">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-xs font-semibold uppercase text-muted-foreground">ou</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <PublicQrScanner onResolved={onQrResolved} />
          <p className="text-xs text-muted-foreground">Scannez le QR officiel apposé sur votre colis.</p>
        </div>

        <TrackingFeedbackMessage
          message={formErrorMessage ?? trackingFeedback?.message}
          tone={formErrorMessage ? "error" : trackingFeedback?.tone}
        />

        {result ? (
          <TrackingResultCard result={result} />
        ) : trackingFeedback?.tone === "error" ? (
          <TrackingNotFoundState message={trackingFeedback.message} />
        ) : (
          <TrackingEmptyState />
        )}
      </div>
    </GlassPanel>
  );
}

function TrackingEmptyState() {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-white/15 bg-white/[0.035] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-[#AFC7FF]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Aucun suivi affiché</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Les informations apparaîtront ici après validation du Tracking ID.
          </p>
        </div>
      </div>
    </div>
  );
}

function TrackingNotFoundState({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-200">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Tracking ID introuvable</p>
          <p className="mt-1 text-sm leading-6 text-amber-100/80">{message}</p>
        </div>
      </div>
    </motion.div>
  );
}

function TrackingFeedbackMessage({
  message,
  tone
}: {
  message?: string | null;
  tone?: "error" | "info";
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-3 rounded-lg border px-4 py-3 text-xs font-semibold",
        tone === "error"
          ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
          : "border-primary/20 bg-primary/10 text-[#AFC7FF]"
      )}
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export function TrackingResultCard({ result }: { result: TrackingResult }) {
  const visual = statusConfig[result.statusVisual];
  const StatusIcon = visual.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_34px_110px_rgba(0,0,0,0.34)]"
    >
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(30,99,255,0.18),rgba(163,230,53,0.08))] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Tracking ID</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              {result.trackingId}
            </p>
          </div>
          <span className={cn("inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold", visual.className)}>
            <StatusIcon className="h-4 w-4" />
            {result.status}
          </span>
        </div>

        <div className="mt-6 grid gap-4 rounded-xl border border-white/10 bg-ebe-night/55 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <RoutePoint label="Site d'origine" value={result.site} />
          <div className="hidden h-px min-w-16 bg-[linear-gradient(90deg,rgba(30,99,255,0.25),rgba(163,230,53,0.85))] sm:block" />
          <RoutePoint label="Destination" value={result.destination} align="right" />
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-4">
        {trackingDetailItems.map((item) => {
          const Icon = item.icon;
          const value = result[item.key];
          const isStatus = item.key === "status";

          return (
            <div key={item.key} className="rounded-xl border border-white/10 bg-ebe-night/65 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-md border border-primary/20 bg-primary/10 text-[#AFC7FF]">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{item.label}</p>
                  {isStatus ? (
                    <span className={cn("mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", visual.className)}>
                      <StatusIcon className="h-4 w-4" />
                      {value}
                    </span>
                  ) : (
                    <p className="mt-1 break-words text-sm font-semibold text-white">{value}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function RoutePoint({
  label,
  value,
  align = "left"
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("flex items-center gap-3", align === "right" && "sm:justify-end sm:text-right")}>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
        {align === "right" ? <CheckCircle2 className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 text-base font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}
