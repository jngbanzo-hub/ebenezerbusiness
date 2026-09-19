import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("la route Direction est GET uniquement, privée et no-store", () => {
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export (?:async )?function (?:POST|PUT|PATCH|DELETE)/);
  assert.match(source, /authorizeDirectionServiceRequest/);
  assert.match(source, /private, no-store, max-age=0/);
});

test("la route ne contient aucune primitive métier ou credential Supabase", () => {
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE|D360_API_KEY/);
});
