import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const server = read("../../../../server/stockages-v2.ts");
const agent = [read("./route.ts"), read("./arrival/route.ts"), read("./parcel/route.ts"), read("./delivery/route.ts")].join("\n");
const admin = read("../../admin/stockages/v2/route.ts");
const adminQueues = read("../../admin/stockages/v2/queues/route.ts");
const ui = read("../../../../features/stockages/stockages-v2-page.tsx");
const remittance = read("../../../../server/encaissements-remittance.ts");

test("toutes les routes Agent exigent authorizeAgentRequest", () => {
  assert.equal((agent.match(/authorizeAgentRequest\(request\)/g) ?? []).length, 4);
});

test("la route Admin exige authorizeAdminRequest", () => {
  assert.match(admin, /authorizeAdminRequest\(request\)/);
  assert.match(adminQueues, /authorizeAdminRequest\(request\)/);
  assert.match(adminQueues, /readAdminWorkQueue/);
  assert.doesNotMatch(admin, /body\.(role|actorId|actorAgency)/);
});

test("les écritures passent uniquement par les RPC service_role", () => {
  assert.match(server, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(server, /\.rpc\(name, args\)/);
  assert.doesNotMatch(ui, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_SERVICE/);
  assert.doesNotMatch(ui, /requestId[^\n]*<input/i);
});

test("la présence et le poids viennent du Stockage physique, le paiement reste contrôlé par Encaissements", () => {
  assert.doesNotMatch(server, /readCanonicalPaymentManifestRows|readAdminPayments/);
  assert.match(remittance, /stockage_parcels/);
  assert.match(remittance, /readAdminPayments/);
  assert.match(server, /p_weight_source: "PHYSICAL_ARRIVAL"/);
  assert.doesNotMatch(read("./delivery/route.ts"), /body\.weight/);
});

test("COO est exclu et les comptes SUSPENDED désactivent les actions", () => {
  assert.match(server, /STORAGE_AGENCIES = \["FIH", "LSHI", "KLZ"\]/);
  assert.match(ui, /disabled=!\{?data\.actionsEnabled|disabled=\{!data\.actionsEnabled\}/);
  assert.match(ui, /Stockage non ouvert — solde initial requis/);
});

test("Transferts, Caisse et Dépenses ne sont pas importés", () => {
  assert.doesNotMatch(server + agent + admin + ui + remittance, /features\/transferts|cash_events|cash_|agent-expenses|expenses/);
});

test("l'inventaire Agent lit uniquement les colis présents de son agence", () => {
  assert.match(server, /from\("stockage_parcels"\)[\s\S]*\.eq\("agency", agency\)[\s\S]*\.in\("delivery_status", \["AVAILABLE", "PRESENT"\]\)/);
  assert.match(ui, /INVENTAIRE PHYSIQUE ACTUEL/);
  assert.match(ui, /Rechercher un code/);
  assert.doesNotMatch(ui, /CurrentInventory[\s\S]*modifier un colis/i);
});

test("un arrivage réussi notifie Admin et COO avec des clés idempotentes", () => {
  const arrival = read("./arrival/route.ts") + read("./forwardings/arrival/route.ts");
  assert.match(arrival, /if \(!result\.replayed\)/);
  assert.match(arrival, /stock_arrival:\$\{eventId\}:admin/);
  assert.match(arrival, /agency, audience: "ADMIN"/);
  assert.match(arrival, /stock_arrival:\$\{eventId\}:coo/);
  assert.match(arrival, /agency: "COO", audience: "AGENT"/);
  assert.match(arrival, /if\(!result\.replayed\)/);
});
