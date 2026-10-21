import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../../../../../features/agent/agent-workspace.tsx", import.meta.url), "utf8");
const payment = readFileSync(new URL("../../../../../server/destination-payment-parcel.ts", import.meta.url), "utf8");

test("route is hard-locked to the one original request, parcel, agency and amount", () => {
  for (const value of ["c3e47de2-956c-4147-b60f-363ae5742b40", "8ad13a88-2790-482c-ab0e-53a42bccff33", "OT12926", "FIH", "72"]) {
    assert.ok(route.includes(value));
  }
  assert.match(route, /Object\.keys\(body\)\.length !== 1 \|\| body\.paymentRequestId !== REQUEST_ID/);
  assert.match(route, /auth\.identity\.site !== AGENCY/);
});

test("all canonical, cash, storage and concurrency guards precede the existing recovery call", () => {
  const recovery = route.indexOf("await recordDestinationPayment(");
  for (const proof of [
    "readCanonicalPaymentsByRequestIds", "readAdminPayments", "sameCodePayments.length !== 1",
    "canonical.montantPaye !== AMOUNT", "canonical.soldeRestant !== 0", "!isSold(canonical.statutPaiement)",
    'orchestration.state !== "PENDING"', "orchestration.payment_created !== false",
    "cashFingerprintResult.data?.length", "storageExitResult.data?.length",
    "sameCodeResult.data?.length", "sameParcelResult.data?.length",
    'parcel.delivery_status !== "AVAILABLE"', "allParcelsResult.data?.length !== 1", 'account.status !== "ACTIVE"'
  ]) {
    assert.ok(route.indexOf(proof) >= 0 && route.indexOf(proof) < recovery, proof);
  }
});

test("route has no new payment, cash or storage write implementation", () => {
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|randomUUID|paiements-agents-enregistrer-paiement/);
  assert.match(route, /recordDestinationPayment\(/);
  assert.match(payment, /if \(parcel\.soldeRestant <= 0\) \{\s*const resumed = await resumePendingPaidDestination/);
});

test("the only UI action requires the exact settled FIH parcel and original id", () => {
  const handler = workspace.slice(workspace.indexOf("async function handleResumeOt12926"), workspace.indexOf("const parsedAmount =", workspace.indexOf("async function handleResumeOt12926")));
  assert.match(handler, /profile\?\.agence !== "FIH"/);
  assert.match(handler, /parcel\?\.codeColis !== "OT12926"/);
  assert.match(handler, /parcel\.soldeRestant !== 0/);
  assert.match(handler, /paymentRequestId: "c3e47de2-956c-4147-b60f-363ae5742b40"/);
  assert.doesNotMatch(handler, /savePayment|saveDestinationPayment|randomUUID/);
});
