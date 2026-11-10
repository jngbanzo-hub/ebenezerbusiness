"use client";

import { useEffect, useRef, useState } from "react";

import { getAdminProfile } from "@/features/agent/auth";
import { getSupabaseBrowserClient } from "@/features/agent/supabase";
import { requestAdminOidcProbe, type AdminOidcProbeState } from "./admin-oidc-probe-trigger";

type Props = { enabled?: boolean; expiresAt?: string };

function windowIsOpen(enabled: boolean, expiresAt?: string) {
  const remaining = Date.parse(expiresAt ?? "") - Date.now();
  return enabled && Number.isFinite(remaining) && remaining > 0 && remaining <= 900_000;
}

/** Not mounted in any page. Requires a separately authorized temporary Admin mount. */
export function AdminOidcProbeTrigger({ enabled = false, expiresAt }: Props) {
  const [adminReady, setAdminReady] = useState(false);
  const [result, setResult] = useState<AdminOidcProbeState | null>(null);
  const [running, setRunning] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!windowIsOpen(enabled, expiresAt)) return;
    let active = true;
    void (async () => {
      try {
        const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
        if (!session?.user || !session.access_token) return;
        await getAdminProfile(session.user);
        if (active) setAdminReady(true);
      } catch { /* Server authorization remains authoritative. */ }
    })();
    return () => { active = false; };
  }, [enabled, expiresAt]);

  if (!adminReady || !windowIsOpen(enabled, expiresAt)) return null;

  async function runOnce() {
    if (attempted.current || !windowIsOpen(enabled, expiresAt)) return;
    attempted.current = true;
    setRunning(true);
    const outcome = await requestAdminOidcProbe(getSupabaseBrowserClient().auth);
    setResult(outcome);
    setRunning(false);
  }

  return <section aria-label="Diagnostic OIDC Admin">
    <button type="button" disabled={running || attempted.current}
      onClick={() => void runOnce()}>Tester la lecture Google une fois</button>
    {result ? <p role="status">{result}</p> : null}
  </section>;
}
