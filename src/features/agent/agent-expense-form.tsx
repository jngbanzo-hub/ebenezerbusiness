"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText } from "lucide-react";

import { Container, GlassPanel } from "@/components/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import {
  getOrCreateRequestIdAttempt,
  type RequestIdAttempt
} from "@/features/agent/request-id-attempt";
import { logOperationPerformance } from "@/features/agent/operation-performance-client";
import { expenseSuccessDetail } from "@/features/agent/expense-success-message";
import { EXPENSE_CATEGORIES } from "@/features/expenses/categories";

const CURRENCIES = ["USD", "FCFA", "CDF"] as const;
const PAYMENT_MODES = [
  "ESPÈCES",
  "MOBILE MONEY",
  "VIREMENT",
  "CARTE",
  "CRÉDIT",
  "AUTRE"
] as const;

type ExpenseFormValues = {
  categorie: (typeof EXPENSE_CATEGORIES)[number];
  description: string;
  montant: string;
  devise: (typeof CURRENCIES)[number];
  modePaiement: (typeof PAYMENT_MODES)[number];
  reference: string;
  observation: string;
};

type ExpenseResult = {
  cashRecorded?: unknown;
  cashStatus?: unknown;
  success?: unknown;
  code?: unknown;
  expenseRequestId?: unknown;
  message?: unknown;
};

const INITIAL_VALUES: ExpenseFormValues = {
  categorie: "Autres",
  description: "",
  montant: "",
  devise: "USD",
  modePaiement: "ESPÈCES",
  reference: "",
  observation: ""
};

const fieldClassName =
  "mt-2 h-11 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 text-white outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60";
const textareaClassName =
  "mt-2 min-h-28 w-full rounded-md border border-white/15 bg-white/[0.05] px-3 py-2 text-white outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60";

export function AgentExpenseForm() {
  const router = useRouter();
  const attemptRef = useRef<RequestIdAttempt | null>(null);
  const requestLockRef = useRef(false);
  const [values, setValues] = useState<ExpenseFormValues>(INITIAL_VALUES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    text: string;
    detail?: string;
    note?: string;
  } | null>(null);

  function updateValue<Key extends keyof ExpenseFormValues>(
    key: Key,
    value: ExpenseFormValues[Key]
  ) {
    attemptRef.current = null;
    setResult(null);
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestLockRef.current) {
      return;
    }

    const amount = Number(values.montant.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setResult({
        type: "error",
        text: "Le montant doit être strictement supérieur à zéro."
      });
      return;
    }

    const submittedExpense = Object.freeze({
      category: values.categorie,
      amount,
      currency: values.devise
    });

    requestLockRef.current = true;
    const performanceStartedAt = performance.now();
    let fetchStartedAt = performanceStartedAt;
    setIsSubmitting(true);
    setResult(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/auth/sign-in");
        return;
      }

      const fingerprint = fingerprintExpense(values, amount);
      const attempt = getOrCreateRequestIdAttempt(attemptRef.current, fingerprint);
      attemptRef.current = attempt;

      fetchStartedAt = performance.now();
      const response = await fetch("/api/agent/expenses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "ENREGISTRER_DEPENSE",
          donnees: {
            expenseRequestId: attempt.requestId,
            categorie: values.categorie,
            description: values.description.trim(),
            montant: amount,
            devise: values.devise,
            modePaiement: values.modePaiement,
            reference: values.reference.trim(),
            observation: values.observation.trim()
          }
        })
      });
      const responseReceivedAt = performance.now();
      const payload = (await response.json().catch(() => null)) as
        | ExpenseResult
        | null;

      if (
        payload?.success === true &&
        (payload.code === "DEPENSE_ENREGISTREE" ||
          payload.code === "DEPENSE_DEJA_ENREGISTREE")
      ) {
        logOperationPerformance({ operation: "depense", requestId: attempt.requestId, agency: "agent", startedAt: performanceStartedAt, response, result: "success" });
        const alreadyRecorded =
          payload.code === "DEPENSE_DEJA_ENREGISTREE";
        const setResultAt = performance.now();
        setResult({
          type: "success",
          text: alreadyRecorded
            ? "Cette dépense avait déjà été enregistrée."
            : "Dépense enregistrée avec succès",
          detail: alreadyRecorded
            ? undefined
            : expenseSuccessDetail(submittedExpense),
          note:
            payload.cashStatus === "ACCOUNT_NOT_ACTIVE"
              ? "La caisse de l’agence n’est pas encore ouverte ; aucun débit de caisse n’a été créé."
              : undefined
        });
        attemptRef.current = null;
        setValues(INITIAL_VALUES);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const renderedAt = performance.now();
          void fetch("/api/agent/expenses/telemetry", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ expenseRequestId: attempt.requestId, metrics: {
              clickToFetch: fetchStartedAt - performanceStartedAt,
              fetchToResponse: responseReceivedAt - fetchStartedAt,
              responseToSetResult: setResultAt - responseReceivedAt,
              setResultToRendered: renderedAt - setResultAt,
              clickToRendered: renderedAt - performanceStartedAt
            } }),
            cache: "no-store",
            keepalive: true
          }).catch(() => undefined);
        }));
        return;
      }

      throw new Error(
        typeof payload?.message === "string"
          ? payload.message
          : response.ok
            ? "Enregistrement impossible."
            : "Le service Dépenses est indisponible."
      );
    } catch (error) {
      logOperationPerformance({ operation: "depense", requestId: attemptRef.current?.requestId ?? "unknown", agency: "agent", startedAt: performanceStartedAt, result: "error" });
      setResult({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Enregistrement impossible."
      });
    } finally {
      requestLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-ebe-night py-8 text-white sm:py-12">
      <Container>
        <div className="mx-auto max-w-3xl">
          <Badge variant="growth">Dépenses Agent</Badge>
          <h1 className="mt-3 text-3xl font-semibold">
            Enregistrer une dépense
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre identité et votre agence sont déterminées automatiquement
            depuis votre profil sécurisé.
          </p>

          <GlassPanel className="mt-7 p-5 sm:p-6" glow="growth">
            <form onSubmit={handleSubmit} className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Catégorie
                  <select
                    required
                    value={values.categorie}
                    onChange={(event) =>
                      updateValue(
                        "categorie",
                        event.target.value as ExpenseFormValues["categorie"]
                      )
                    }
                    className={fieldClassName}
                  >
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option
                        key={category}
                        value={category}
                        className="bg-ebe-navy"
                      >
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium">
                  Montant
                  <input
                    required
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={values.montant}
                    onChange={(event) =>
                      updateValue("montant", event.target.value)
                    }
                    className={fieldClassName}
                    placeholder="0.00"
                  />
                </label>

                <label className="text-sm font-medium">
                  Devise
                  <select
                    required
                    value={values.devise}
                    onChange={(event) =>
                      updateValue(
                        "devise",
                        event.target.value as ExpenseFormValues["devise"]
                      )
                    }
                    className={fieldClassName}
                  >
                    {CURRENCIES.map((currency) => (
                      <option
                        key={currency}
                        value={currency}
                        className="bg-ebe-navy"
                      >
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium">
                  Mode de paiement
                  <select
                    required
                    value={values.modePaiement}
                    onChange={(event) =>
                      updateValue(
                        "modePaiement",
                        event.target.value as ExpenseFormValues["modePaiement"]
                      )
                    }
                    className={fieldClassName}
                  >
                    {PAYMENT_MODES.map((mode) => (
                      <option
                        key={mode}
                        value={mode}
                        className="bg-ebe-navy"
                      >
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="text-sm font-medium">
                Description
                <textarea
                  required
                  maxLength={500}
                  value={values.description}
                  onChange={(event) =>
                    updateValue("description", event.target.value)
                  }
                  className={textareaClassName}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Référence (facultative)
                  <input
                    maxLength={200}
                    value={values.reference}
                    onChange={(event) =>
                      updateValue("reference", event.target.value)
                    }
                    className={fieldClassName}
                  />
                </label>

                <label className="text-sm font-medium">
                  Observation (facultative)
                  <input
                    maxLength={1000}
                    value={values.observation}
                    onChange={(event) =>
                      updateValue("observation", event.target.value)
                    }
                    className={fieldClassName}
                  />
                </label>
              </div>

              <Button
                type="submit"
                variant="growth"
                size="lg"
                disabled={
                  isSubmitting ||
                  !values.description.trim() ||
                  !values.montant
                }
              >
                <ReceiptText className="h-5 w-5" />
                {isSubmitting
                  ? "Enregistrement…"
                  : "Enregistrer une dépense"}
              </Button>
            </form>

            {result ? (
              <div
                role="alert"
                className={`mt-5 rounded-md border p-4 text-sm ${
                  result.type === "success"
                    ? "border-accent/25 bg-accent/10 text-accent"
                    : "border-red-400/25 bg-red-400/10 text-red-200"
                }`}
              >
                <p>{result.text}</p>
                {result.detail ? (
                  <p className="mt-1 font-medium">{result.detail}</p>
                ) : null}
                {result.note ? (
                  <p className="mt-2 text-xs">{result.note}</p>
                ) : null}
              </div>
            ) : null}
          </GlassPanel>
        </div>
      </Container>
    </main>
  );
}

function fingerprintExpense(values: ExpenseFormValues, amount: number) {
  return JSON.stringify({
    categorie: values.categorie,
    description: values.description.trim(),
    montant: amount,
    devise: values.devise,
    modePaiement: values.modePaiement,
    reference: values.reference.trim(),
    observation: values.observation.trim()
  });
}
