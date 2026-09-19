import assert from "node:assert/strict";
import test from "node:test";
import { departureDisplayCode } from "./departure-display-code.ts";

const routes = [["KLZ", "LSHI"], ["KLZ", "FIH"], ["LSHI", "KLZ"], ["LSHI", "FIH"], ["FIH", "LSHI"], ["FIH", "KLZ"]];

test("conserve les sorties natives et distingue un forwarding homonyme", () => {
  assert.equal(departureDisplayCode({ tracking_code: "AT02326" }), "AT02326");
  assert.equal(departureDisplayCode({ tracking_code: "AT02326", forwarding_identity: { forwardingId: "forwarding", trackingCode: "AT02326", originAgency: "KLZ", destinationAgency: "LSHI" } }), "AT02326 · KLZ-LSHI");
});

test("formate les six trajets depuis l'identité forwarding", () => {
  for (const [originAgency, destinationAgency] of routes) {
    assert.equal(departureDisplayCode({ tracking_code: "CODE1", forwarding_identity: { forwardingId: "forwarding", trackingCode: "CODE1", originAgency, destinationAgency } }), `CODE1 · ${originAgency}-${destinationAgency}`);
  }
});

test("une identité absente, incomplète ou incohérente conserve le code natif", () => {
  const rows = [
    { tracking_code: "SAFE1", forwarding_identity: { trackingCode: "SAFE1", originAgency: "KLZ", destinationAgency: "FIH" } },
    { tracking_code: "SAFE2", forwarding_identity: { forwardingId: "forwarding", trackingCode: "SAFE2", originAgency: "KLZ" } },
    { tracking_code: "SAFE3", forwarding_identity: { forwardingId: "forwarding", trackingCode: "SAFE3", originAgency: "KLZ", destinationAgency: "KLZ" } },
    { tracking_code: "SAFE4", forwarding_identity: { forwardingId: "forwarding", trackingCode: "SAFE4", originAgency: "COO", destinationAgency: "KLZ" } }
  ];
  assert.deepEqual(rows.map(departureDisplayCode), ["SAFE1", "SAFE2", "SAFE3", "SAFE4"]);
});
