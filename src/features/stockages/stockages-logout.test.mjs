import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./stockages-v2-page.tsx", import.meta.url),
  "utf8"
);

test("le shell Stockages termine la déconnexion avant de quitter la route protégée", () => {
  assert.match(source, /await signOutAgent\(\)/);
  assert.match(source, /router\.replace\("\/auth\/sign-in"\)/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /onClick=\{handleSignOut\}/);
  assert.doesNotMatch(
    source,
    /onClick=\{\(\) => void getSupabaseBrowserClient\(\)\.auth\.signOut\(\)\}/
  );
});
