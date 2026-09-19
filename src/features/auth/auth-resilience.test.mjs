import test from "node:test";
import assert from "node:assert/strict";
import { AuthOperationTimeoutError, isRetryableAuthError, loginErrorMessage, withinAuthTimeout } from "./auth-resilience.ts";

test("borne une opération Auth suspendue", async () => {
  await assert.rejects(() => withinAuthTimeout("test", new Promise(() => undefined), 5), AuthOperationTimeoutError);
});
test("réserve le message identifiants incorrects au code Supabase explicite", () => {
  assert.equal(loginErrorMessage({ code: "invalid_credentials" }), "Adresse e-mail ou mot de passe incorrect.");
  assert.match(loginErrorMessage(new TypeError("fetch failed")), /temporairement indisponible/);
});
test("retry uniquement les pannes transitoires", () => {
  assert.equal(isRetryableAuthError(new AuthOperationTimeoutError("sign_in")), true);
  assert.equal(isRetryableAuthError({ status: 503 }), true);
  assert.equal(isRetryableAuthError({ code: "invalid_credentials", status: 400 }), false);
});
