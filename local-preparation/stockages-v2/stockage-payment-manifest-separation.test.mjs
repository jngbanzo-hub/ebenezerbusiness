import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const workspace = read("src/features/agent/agent-workspace.tsx");
const dashboard = read("src/features/agent/agent-dashboard.tsx");
const destination = read("src/server/destination-payment-parcel.ts");
const edge = read("local-preparation/edge-functions/web-hardened/paiements-agents-enregistrer-paiement/index.ts");
const appsScript = read("local-preparation/apps-script/payments/unified/Code.gs");
const sql = read("local-preparation/supabase/stockages-v2/009_paid_exit_forwarding_orchestration.sql");

test("Encaissements destination lit Stockage, historique et tarifs serveur", () => {
  assert.match(destination, /from\("stockage_parcels"\)/);
  assert.match(destination, /readAdminPayments\((?:trace)?\)/);
  assert.match(destination, /STANDARD_RATES_USD_PER_KG/);
  assert.doesNotMatch(destination, /readAdminManifestRows|MANIFESTE PUBLIC/);
  assert.match(workspace, /searchDestinationParcel/);
  assert.match(workspace, /saveDestinationPayment/);
});

test("le paiement destination signé n’utilise pas rechercherColisSource", () => {
  assert.match(edge, /STORAGE_DESTINATION_PAYMENT/);
  assert.match(appsScript, /paiement\.operationType === "STORAGE_DESTINATION_PAYMENT"[\s\S]*?codeColis: paiement\.codeColis/);
  const storageBranch = appsScript.slice(appsScript.indexOf('var colis = paiement.operationType === "STORAGE_DESTINATION_PAYMENT"'), appsScript.indexOf("var montantAttendu", appsScript.indexOf('var colis = paiement.operationType === "STORAGE_DESTINATION_PAYMENT"')));
  assert.doesNotMatch(storageBranch.split(": rechercherColisSource_")[0], /rechercherColisSource_/);
});

test("la présence physique est verrouillée avant tout paiement", () => {
  const begin = sql.slice(sql.indexOf("begin_paid_destination_orchestration"), sql.indexOf("checkpoint_paid_destination_payment"));
  assert.match(begin, /stockage_parcels where tracking_code=v_code and agency=v_agency for update/);
  assert.match(begin, /delivery_status<>'AVAILABLE'/);
});

test("le contrôle Manifeste est intégré et la consultation dédiée reste disponible", () => {
  assert.match(workspace, /AgentManifestControl/);
  assert.match(dashboard, /\/agent\/manifeste/);
  assert.match(read("src/features/agent/agent-manifest-page.tsx"), /Information de contrôle uniquement/);
});
