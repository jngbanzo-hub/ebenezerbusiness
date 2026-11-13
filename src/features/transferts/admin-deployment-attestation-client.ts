/** Préparation locale non montée dans l'interface Admin. */
import { authenticatedRead, type BrowserAuth } from "@/features/auth/authenticated-fetch";
import type { DeploymentAttestationResult } from "@/server/admin-transfer-deployment-attestation";

const DEPLOYMENT_ID = /^[A-Za-z0-9_-]{20,512}$/;

export async function attestDeploymentFromAdminSession(
  auth: BrowserAuth,
  candidateDeploymentId: string
): Promise<DeploymentAttestationResult> {
  const id = candidateDeploymentId.trim();
  if (!DEPLOYMENT_ID.test(id)) return "INDETERMINABLE";
  const bytes = new TextEncoder().encode(id);
  const digestBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const candidateDigest = Array.from(digestBytes, (value) => value.toString(16).padStart(2, "0")).join("");
  const response = await authenticatedRead(auth, "/api/admin/transferts/deployment-attestation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateDigest })
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== "object" || !("result" in result))
    return "INDETERMINABLE";
  const state = result.result;
  return state === "CORRESPOND" || state === "NE_CORRESPOND_PAS" || state === "INDETERMINABLE"
    ? state : "INDETERMINABLE";
}
