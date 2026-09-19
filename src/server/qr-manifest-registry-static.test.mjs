import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("./qr-manifest-candidates.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260816210000_qr_manifest_registry_assignment_details.sql", import.meta.url), "utf8");

test("la détection MANIFESTE passe par un RPC service-only en lecture", () => {
  assert.match(server, /rpc\("read_qr_manifest_registry_server"/);
  assert.match(server, /readCanonicalManifestRange\(`\$\{agency\}!A:H`\)/);
  assert.doesNotMatch(server, /readAdminManifestRange/);
  assert.doesNotMatch(server, /\.from\("qr_labels"\)/);
  assert.match(migration, /language sql[\s\S]*stable[\s\S]*security definer/i);
  assert.match(migration, /grant execute on function public\.read_qr_manifest_registry_server\(bigint\[\]\)[\s\S]*to service_role/i);
  assert.match(migration, /'agency', q\.agency/);
  assert.match(migration, /'trackingCode', q\.tracking_code/);
  assert.doesNotMatch(migration, /\b(insert|update|delete|truncate)\b/i);
});
