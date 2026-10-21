import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { certifyDestinationResume } from "./destination-payment-resume-guard.ts";

const requestId = "c3e47de2-956c-4147-b60f-363ae5742b40";
const parcelId = "8ad13a88-2790-482c-ab0e-53a42bccff33";
const fingerprint = "a".repeat(64);

function fixture(agency) {
  const payment = {
    paymentRequestId: requestId, codeColis: "OT12926", agenceEncaissement: agency,
    destinationCode: agency, statutPaiement: "SOLDÉ", soldeRestant: 0,
    montantPaye: 72, montantAttendu: 72, poidsKg: 8, agent: "Agent vérifié",
    modePaiement: "ESPECES", reference: "", observation: ""
  };
  return {
    agency, trackingCode: "OT12926", parcelId,
    orchestration: {
      request_id: requestId, command_fingerprint: fingerprint, tracking_code: "OT12926", agency,
      actor_name: "Agent vérifié", expected_amount: 72, paid_amount: 72,
      payment_created: false, payment_response: null, cash_event_id: null,
      stockage_event_id: null, state: "PENDING", parcel_id: parcelId, forwarding_id: null
    },
    otherOrchestrations: [],
    parcel: { parcel_id: parcelId, tracking_code: "OT12926", agency, forwarding_id: null, canonical_weight_kg: 8, delivery_status: "AVAILABLE" },
    sameCodeParcels: [{ parcel_id: parcelId }],
    account: { status: "ACTIVE", current_parcel_count: 1, current_weight_kg: 8 },
    canonical: payment, sameCodePayments: [payment], cashRows: [], fingerprintCashRows: [],
    storageRows: [], storageExitRows: [], relatedForwardings: []
  };
}

for (const agency of ["FIH", "LSHI", "KLZ"]) {
  test(`${agency}: eligible only with exact native, paid, pending identity`, () => {
    const evidence = fixture(agency);
    assert.equal(certifyDestinationResume(evidence), true);
    evidence.orchestration.state = "COMPLETED";
    assert.equal(certifyDestinationResume(evidence), false);
  });
  test(`${agency}: existing Cash Event is reused, duplicates and exit are refused`, () => {
    const evidence = fixture(agency);
    const cash = { event_id: "cash-one", source_request_id: requestId, agency, amount: 72, direction: "CREDIT", metadata: { commandFingerprint: fingerprint } };
    evidence.cashRows = [cash];
    evidence.fingerprintCashRows = [{ event_id: cash.event_id, source_request_id: requestId }];
    evidence.orchestration.cash_event_id = cash.event_id;
    assert.equal(certifyDestinationResume(evidence), true);
    evidence.cashRows.push({ ...cash, event_id: "cash-two" });
    assert.equal(certifyDestinationResume(evidence), false);
    evidence.cashRows.pop();
    evidence.storageExitRows = [{ event_id: "exit-one" }];
    assert.equal(certifyDestinationResume(evidence), false);
  });
  test(`${agency}: mismatched agency, parcel and ambiguous canonical refuse`, () => {
    const evidence = fixture(agency);
    evidence.parcel.agency = agency === "FIH" ? "LSHI" : "FIH";
    assert.equal(certifyDestinationResume(evidence), false);
    evidence.parcel.agency = agency;
    evidence.orchestration.parcel_id = "2cf02533-6474-4ada-bf20-ff8e4811c102";
    assert.equal(certifyDestinationResume(evidence), false);
    evidence.orchestration.parcel_id = parcelId;
    evidence.sameCodePayments.push({ ...evidence.canonical, paymentRequestId: "f4378f70-4368-4131-8675-6f39ecbc663b" });
    assert.equal(certifyDestinationResume(evidence), false);
  });
  test(`${agency}: checkpointed payment is accepted only when its response matches`, () => {
    const evidence = fixture(agency);
    evidence.orchestration.payment_created = true;
    evidence.orchestration.payment_response = {
      codeColis: "OT12926", destinationCode: agency, montantPaye: 72,
      nouveauSolde: 0, statutPaiement: "SOLDE"
    };
    assert.equal(certifyDestinationResume(evidence), true);
    evidence.orchestration.payment_response.montantPaye = 73;
    assert.equal(certifyDestinationResume(evidence), false);
  });
}

test("forwarding, missing original request and concurrent orchestration fail closed", () => {
  const evidence = fixture("FIH");
  evidence.parcel.forwarding_id = "forwarding-one";
  assert.equal(certifyDestinationResume(evidence), false);
  evidence.parcel.forwarding_id = null;
  evidence.relatedForwardings.push({ forwarding_id: "forwarding-one" });
  assert.equal(certifyDestinationResume(evidence), false);
  evidence.relatedForwardings = [];
  evidence.canonical.paymentRequestId = undefined;
  assert.equal(certifyDestinationResume(evidence), false);
  evidence.canonical.paymentRequestId = requestId;
  evidence.otherOrchestrations = [{ request_id: "other", parcel_id: parcelId, state: "PENDING" }];
  assert.equal(certifyDestinationResume(evidence), false);
});

test("route cannot enter new-payment path; UI locks double clicks and COO is excluded", () => {
  const server = readFileSync(fileURLToPath(new URL("../app/api/agent/encaissements/resume/route.ts", import.meta.url)), "utf8");
  const ui = readFileSync(fileURLToPath(new URL("../features/agent/agent-workspace.tsx", import.meta.url)), "utf8");
  assert.match(server, /resumePendingPaidDestination\(/);
  assert.doesNotMatch(server, /recordDestinationPayment\(/);
  assert.match(server, /auth\.identity\.site === "COO"/);
  assert.match(server, /row\.agency !== auth\.identity\.site/);
  assert.match(ui, /resumeDestinationLockRef\.current/);
  assert.match(ui, /Finalisation en cours…/);
  assert.match(ui, /Finaliser la reprise — sans nouveau paiement/);
  assert.doesNotMatch(ui, /resume-ot12926|Finaliser la reprise OT12926/);
});
