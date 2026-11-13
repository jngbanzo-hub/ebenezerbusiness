"use client";

import { useRef, useState, type FormEvent } from "react";

import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import {
  attestDeploymentFromAdminSession
} from "@/features/transferts/admin-deployment-attestation-client";
import type { DeploymentAttestationResult } from "@/server/admin-transfer-deployment-attestation";

type Props = { enabled?: boolean; expiresAt?: string };

function windowIsOpen(enabled: boolean, expiresAt?: string): boolean {
  const remaining = Date.parse(expiresAt ?? "") - Date.now();
  return enabled && Number.isFinite(remaining) && remaining > 0 && remaining <= 15 * 60_000;
}

/** Mounted only after the existing Admin page access check. The API checks ADMIN again. */
export function AdminDeploymentAttestationTrigger({ enabled = false, expiresAt }: Props) {
  const [candidateId, setCandidateId] = useState("");
  const [outcome, setOutcome] = useState<DeploymentAttestationResult | null>(null);
  const [running, setRunning] = useState(false);
  const attempted = useRef(false);
  if (!windowIsOpen(enabled, expiresAt)) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (attempted.current || !windowIsOpen(enabled, expiresAt)) return;
    attempted.current = true;
    setRunning(true);
    const candidate = candidateId;
    setCandidateId("");
    try {
      setOutcome(await attestDeploymentFromAdminSession(getSupabaseBrowserClient().auth, candidate));
    } catch {
      setOutcome("INDETERMINABLE");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mt-6 rounded-md border border-white/15 p-4" aria-label="Attestation temporaire du déploiement Transferts">
      <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Identifiant du déploiement candidat
          <input type="password" autoComplete="off" spellCheck={false} value={candidateId}
            onChange={(event) => setCandidateId(event.target.value)}
            className="mt-2 block rounded-md border border-white/20 bg-transparent p-2" />
        </label>
        <button type="submit" disabled={running || attempted.current || !candidateId.trim()}
          className="rounded-md border border-white/20 px-4 py-2 text-sm disabled:opacity-50">
          Comparer une fois
        </button>
      </form>
      {outcome ? <p role="status" className="mt-3 text-sm">{outcome}</p> : null}
    </section>
  );
}
