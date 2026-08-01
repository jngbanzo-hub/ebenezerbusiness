import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const server = read("../../../../server/stockages-v2.ts");
const agent = [read("./route.ts"), read("./arrival/route.ts"), read("./parcel/route.ts"), read("./delivery/route.ts")].join("\n");
const admin = read("../../admin/stockages/v2/route.ts");
const ui = read("../../../../features/stockages/stockages-v2-page.tsx");

test("toutes les routes Agent exigent authorizeAgentRequest", () => {
  assert.equal((agent.match(/authorizeAgentRequest\(request\)/g) ?? []).length, 4);
});

test("la route Admin exige authorizeAdminRequest", () => {
  assert.match(admin, /authorizeAdminRequest\(request\)/);
  assert.doesNotMatch(admin, /body\.(role|actorId|actorAgency)/);
});

test("les écritures passent uniquement par les RPC service_role", () => {
  assert.match(server, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(server, /\.rpc\(name, args\)/);
  assert.doesNotMatch(ui, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_SERVICE/);
  assert.doesNotMatch(ui, /requestId[^\n]*<input/i);
});

test("le poids de livraison vient du Manifeste et est contrôlé par Paiements", () => {
  assert.match(server, /readCanonicalPaymentManifestRows/);
  assert.match(server, /readAdminPayments/);
  assert.match(server, /weightSource: "SHIPPING_MANIFEST"/);
  assert.doesNotMatch(read("./delivery/route.ts"), /body\.weight/);
});

test("COO est exclu et les comptes SUSPENDED désactivent les actions", () => {
  assert.match(server, /STORAGE_AGENCIES = \["FIH", "LSHI", "KLZ"\]/);
  assert.match(ui, /disabled=!\{?data\.actionsEnabled|disabled=\{!data\.actionsEnabled\}/);
  assert.match(ui, /Stockage non ouvert — solde initial requis/);
});

test("Transferts, Caisse et Dépenses ne sont pas importés", () => {
  assert.doesNotMatch(server + agent + admin + ui, /features\/transferts|cash_events|cash_|agent-expenses|expenses/);
});
