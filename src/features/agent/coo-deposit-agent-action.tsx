"use client";

import { type FormEvent, useRef, useState } from "react";
import { LoaderCircle, PackageCheck } from "lucide-react";

import { GlassPanel } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import {
  CooDepositRequestError,
  submitCooDeposit
} from "@/features/agent/coo-deposit-client";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import {
  getOrCreateRequestIdAttempt,
  type RequestIdAttempt
} from "@/features/agent/request-id-attempt";

type Feedback = Readonly<{
  type: "success" | "replay" | "error" | "conflict";
  message: string;
}>;

export function CooDepositAgentAction() {
  const [trackingCode, setTrackingCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const requestLock = useRef(false);
  const attemptRef = useRef<RequestIdAttempt | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestLock.current) return;

    const normalizedTrackingCode = trackingCode.trim().toUpperCase();
    if (!normalizedTrackingCode || !confirmed) {
      setFeedback({
        type: "error",
        message: "Renseignez le colis et confirmez le dépôt physique."
      });
      return;
    }

    if (
      !window.confirm(
        `Confirmer le dépôt physique du colis ${normalizedTrackingCode} à COO ?`
      )
    ) {
      return;
    }

    requestLock.current = true;
    setSubmitting(true);
    setFeedback(null);

    try {
      const attempt = getOrCreateRequestIdAttempt(
        attemptRef.current,
        normalizedTrackingCode
      );
      attemptRef.current = attempt;
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new CooDepositRequestError(
          "UNAUTHORIZED",
          401,
          "Votre session Agent a expiré. Reconnectez-vous."
        );
      }

      const result = await submitCooDeposit(session.access_token, {
        trackingCode: normalizedTrackingCode,
        requestId: attempt.requestId,
        confirmationPhysicalDeposit: true
      });
      setFeedback(
        result.replayed
          ? {
              type: "replay",
              message: `Commande déjà traitée : résultat rejoué pour ${result.trackingCode}, version ${result.version}.`
            }
          : {
              type: "success",
              message: `Dépôt enregistré pour ${result.trackingCode}, version ${result.version}.`
            }
      );
      attemptRef.current = null;
      setTrackingCode("");
      setConfirmed(false);
    } catch (error) {
      const conflict =
        error instanceof CooDepositRequestError && error.status === 409;
      setFeedback({
        type: conflict ? "conflict" : "error",
        message:
          error instanceof CooDepositRequestError
            ? error.message
            : "La commande logistique n’a pas pu être envoyée."
      });
    } finally {
      requestLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <GlassPanel className="mt-8 border-accent/25 p-5 sm:p-6" glow="growth">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
          <PackageCheck className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-accent">Dépôt physique à COO</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enregistre uniquement l’entrée initiale d’un colis physiquement reçu à Cotonou.
          </p>
        </div>
      </div>

      <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium">
          Code colis
          <input
            className="h-11 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-white outline-none focus:border-accent"
            value={trackingCode}
            onChange={(event) => {
              attemptRef.current = null;
              setTrackingCode(event.target.value);
              setFeedback(null);
            }}
            autoComplete="off"
            required
          />
        </label>
        <label className="flex items-start gap-3 text-sm sm:col-span-2">
          <input
            className="mt-1 h-4 w-4 accent-emerald-400"
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            required
          />
          <span>Je confirme que le colis est physiquement déposé à l’agence COO.</span>
        </label>

        {feedback ? (
          <p
            role="status"
            className={`rounded-lg border px-4 py-3 text-sm sm:col-span-2 ${
              feedback.type === "success" || feedback.type === "replay"
                ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                : "border-red-300/30 bg-red-400/10 text-red-100"
            }`}
          >
            {feedback.message}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="growth"
          className="sm:col-span-2 sm:w-fit"
          disabled={submitting || !confirmed}
        >
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {submitting ? "Enregistrement…" : "Enregistrer l’entrée COO"}
        </Button>
      </form>
    </GlassPanel>
  );
}
