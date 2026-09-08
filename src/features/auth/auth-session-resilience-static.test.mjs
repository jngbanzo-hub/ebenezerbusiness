import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("le login ne lance qu’un signIn et ne détruit pas la session sur erreur", async () => {
  const source = await read("../agent/sign-in-form.tsx");
  assert.equal((source.match(/signInWithPassword/g) ?? []).length, 1);
  assert.doesNotMatch(source, /signOutAgent/);
  assert.match(source, /runSerializedAuthOperation/);
});

for (const [label, path] of [["Admin", "../admin/admin-workspace.tsx"], ["Agent", "../agent/agent-workspace.tsx"]]) {
  test(`${label}: le garde temporaire préserve la session et propose un retry local`, async () => {
    const source = await read(path);
    const guard = source.slice(source.indexOf("async function protectRoute"), source.indexOf("void protectRoute"));
    assert.doesNotMatch(guard, /signOutAgent/);
    assert.match(source, /setAuthRetryCount/);
    assert.match(source, /accessVerificationErrorMessage/);
    assert.doesNotMatch(source, /window\.location\.reload\(\)/);
  });
}
