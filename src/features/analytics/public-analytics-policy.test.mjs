import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./public-analytics-policy.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const compiledModule = { exports: {} };
new Function("exports", "module", transpiled)(compiledModule.exports, compiledModule);

const {
  isPublicAnalyticsPath,
  qrResolutionOutcome,
  sanitizePublicAnalyticsEvent,
  trackingSearchOutcome
} = compiledModule.exports;

test("mesure seulement la liste blanche des routes publiques", () => {
  for (const path of ["/", "/contact", "/live", "/privacy", "/services", "/suivi-de-colis", "/tarifs", "/q/EEBQR000001"]) {
    assert.equal(isPublicAnalyticsPath(path), true, path);
  }
  for (const path of ["/admin", "/admin/bilan", "/agent", "/agent/caisse", "/auth/sign-in", "/api/tracking/AT00126", "/design-system", "/route-inconnue"]) {
    assert.equal(isPublicAnalyticsPath(path), false, path);
  }
});

test("supprime les événements privés et masque totalement l'identifiant QR externe", () => {
  assert.equal(sanitizePublicAnalyticsEvent({ type: "pageview", url: "https://ebenezerbusiness.com/admin" }), null);
  assert.equal(sanitizePublicAnalyticsEvent({ type: "event", url: "https://ebenezerbusiness.com/agent/caisse" }), null);

  const sanitized = sanitizePublicAnalyticsEvent({
    type: "pageview",
    url: "https://www.ebenezerbusiness.com/q/EEBQR009999?secret=forbidden#fragment"
  });
  assert.ok(sanitized);
  assert.match(sanitized.url, /\/q\/\[qrId\]$/);
  assert.doesNotMatch(sanitized.url, /EEBQR009999|secret|fragment/);
});

test("classe les résultats manuels sans exposer le code recherché", () => {
  assert.equal(trackingSearchOutcome(200, true), "success");
  assert.equal(trackingSearchOutcome(404, false), "not_found");
  assert.equal(trackingSearchOutcome(400, false), "unavailable");
  assert.equal(trackingSearchOutcome(503, false), "unavailable");
});

test("classe les résolutions QR dans les trois résultats Analytics autorisés", () => {
  assert.equal(qrResolutionOutcome("ASSIGNED"), "success");
  assert.equal(qrResolutionOutcome("INVALID"), "invalid");
  assert.equal(qrResolutionOutcome("REVOKED"), "invalid");
  assert.equal(qrResolutionOutcome("UNKNOWN"), "unknown");
  assert.equal(qrResolutionOutcome("UNASSIGNED"), "unknown");
  assert.equal(qrResolutionOutcome("TRACKING_NOT_FOUND"), "unknown");
  assert.equal(qrResolutionOutcome("UNAVAILABLE"), "unknown");
});
