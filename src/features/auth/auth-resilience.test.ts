import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { AuthOperationTimeoutError, accessVerificationErrorMessage, isDefinitiveRefreshFailure, loginErrorMessage, runSerializedAuthOperation } from "./auth-resilience.ts";

test("une tentative login expirée reste single-flight jusqu’à sa résolution", async () => {
  let calls = 0;
  let release!: (value: string) => void;
  const pending = new Promise<string>((resolve) => { release = resolve; });
  const request = () => { calls += 1; return pending; };

  await assert.rejects(
    () => runSerializedAuthOperation("test_password_sign_in", request, 5),
    AuthOperationTimeoutError
  );
  const retry = runSerializedAuthOperation("test_password_sign_in", request, 100);
  assert.equal(calls, 1);
  release("ok");
  assert.equal(await retry, "ok");
  assert.equal(calls, 1);
});

test("les messages distinguent credentials, limitation et indisponibilité", () => {
  assert.equal(loginErrorMessage({ code: "invalid_credentials", status: 400 }), "Adresse e-mail ou mot de passe incorrect.");
  assert.equal(loginErrorMessage({ status: 429 }), "Trop de tentatives. Veuillez patienter quelques instants avant de réessayer.");
  assert.equal(loginErrorMessage({ status: 503 }), "Le service d’authentification est temporairement indisponible. Réessayez dans quelques instants.");
  assert.equal(accessVerificationErrorMessage(), "Impossible de vérifier votre accès pour le moment. Réessayez.");
});

test("seuls les refresh définitivement invalides expirent la session", () => {
  assert.equal(isDefinitiveRefreshFailure({ status: 400, code: "refresh_token_not_found" }), true);
  assert.equal(isDefinitiveRefreshFailure({ status: 503, code: "gateway_timeout" }), false);
  assert.equal(isDefinitiveRefreshFailure(new TypeError("fetch failed")), false);
});
