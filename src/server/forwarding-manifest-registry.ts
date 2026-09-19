import "server-only";

import { createClient } from "@supabase/supabase-js";

/** Effet additif post-paiement. L'appelant doit toujours absorber son échec. */
export async function reconcileForwardingManifestRegistry(forwardingId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(forwardingId)) throw new Error("INVALID_FORWARDING_ID");
  const { data, error } = await client().rpc("reconcile_forwarding_manifest_registry", {
    p_forwarding_id: forwardingId
  });
  if (error) throw new Error("FORWARDING_MANIFEST_RECONCILIATION_FAILED");
  return data;
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("FORWARDING_MANIFEST_REGISTRY_NOT_CONFIGURED");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("public");
}
