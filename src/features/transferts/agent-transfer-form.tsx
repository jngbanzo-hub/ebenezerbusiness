"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createAgentTransfer } from "@/features/transferts/api";
import type { TransferAgency } from "@/features/transferts/types";

export function AgentTransferForm({
  token,
  agency,
  enabled,
  onSuccess
}: {
  token: string;
  agency: TransferAgency;
  enabled: boolean;
  onSuccess: () => void;
}) {
  const destinations = agency === "COO" ? ["FIH", "LSHI", "KLZ"] : ["COO"];
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [transferRequestId, setTransferRequestId] = useState(() => crypto.randomUUID());

  if (!enabled) {
    return <p className="text-sm text-amber-100">Les opérations de transfert ne sont pas encore activées.</p>;
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        setMessage("");
        try {
          await createAgentTransfer(token, {
            agencyTo: String(form.get("agencyTo")) as TransferAgency,
            amount: Number(form.get("amount")),
            currency: String(form.get("currency")) as "USD" | "CDF" | "XOF",
            fees: Number(form.get("fees")),
            service: String(form.get("service")),
            transferCode: String(form.get("transferCode")),
            senderName: String(form.get("senderName")),
            beneficiaryName: String(form.get("beneficiaryName")),
            beneficiaryPhone: String(form.get("beneficiaryPhone")),
            transferRequestId,
            observation: String(form.get("observation") ?? "")
          });
          event.currentTarget.reset();
          setTransferRequestId(crypto.randomUUID());
          setMessage("Transfert créé.");
          onSuccess();
        } catch (caught) {
          setMessage(caught instanceof Error ? caught.message : "Opération impossible.");
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="Agence bénéficiaire"><select name="agencyTo" required className="field">{destinations.map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Devise"><select name="currency" required className="field"><option>USD</option><option>CDF</option><option>XOF</option></select></Field>
      <Field label="Montant"><input name="amount" type="number" min="0.01" step="any" required className="field" /></Field>
      <Field label="Frais"><input name="fees" type="number" min="0" step="any" defaultValue="0" required className="field" /></Field>
      <Field label="Service"><input name="service" maxLength={80} required className="field" /></Field>
      <Field label="Code de transfert"><input name="transferCode" type="password" autoComplete="off" maxLength={128} required className="field" /></Field>
      <Field label="Expéditeur"><input name="senderName" maxLength={120} required className="field" /></Field>
      <Field label="Bénéficiaire"><input name="beneficiaryName" maxLength={120} required className="field" /></Field>
      <Field label="Téléphone bénéficiaire"><input name="beneficiaryPhone" maxLength={40} required className="field" /></Field>
      <Field label="Observation"><input name="observation" maxLength={500} className="field" /></Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Envoi sécurisé…" : "Créer le transfert"}</Button>
        {message && <p role="status" className="mt-3 text-sm text-amber-100">{message}</p>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm text-muted-foreground">{label}{children}</label>;
}
