import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const identity = readFileSync(new URL("./storage-parcel-identity.ts", import.meta.url), "utf8");
const resolver = readFileSync(new URL("./destination-payment-parcel.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../features/agent/agent-workspace.tsx", import.meta.url), "utf8");

function parseAlias(value) {
  const match = String(value).trim().toUpperCase().match(/^([A-Z0-9][A-Z0-9._/]{1,63}?)(?:\s*·\s*| |-|)(KLZ|LSHI|FIH)-(KLZ|LSHI|FIH)$/);
  if (!match || match[2] === match[3]) return null;
  return { trackingCode: match[1], originAgency: match[2], destinationAgency: match[3] };
}

test("the six forwarding aliases resolve to a canonical code and explicit route", () => {
  for (const route of ["KLZ-LSHI", "KLZ-FIH", "LSHI-KLZ", "LSHI-FIH", "FIH-LSHI", "FIH-KLZ"]) {
    assert.deepEqual(parseAlias(`AT02326 · ${route}`), {
      trackingCode: "AT02326",
      originAgency: route.split("-")[0],
      destinationAgency: route.split("-")[1]
    });
  }
  assert.match(identity, /parseForwardingAlias/);
  assert.match(resolver, /alias\.destinationAgency !== agency/);
  assert.match(resolver, /candidate\.originAgency === alias\.originAgency/);
  assert.match(resolver, /candidate\.destinationAgency === alias\.destinationAgency/);
});

test("native codes and suffixes remain canonical", () => {
  for (const code of ["AT15326", "AT15326B", "AT15326C", "AT15326D"]) assert.equal(parseAlias(code), null);
  assert.match(resolver, /alias\?\.trackingCode \?\? trackingCode/);
});

test("the UI validates the canonical code and the returned forwarding identity", () => {
  assert.match(workspace, /canonicalRequestedCode = requestedForwardingAlias\?\.trackingCode \?\? normalizedCode/);
  assert.match(workspace, /Boolean\(foundParcel\.parcelId\)/);
  assert.match(workspace, /Boolean\(foundParcel\.forwardingId\)/);
  assert.match(workspace, /returnedForwardingAlias\.originAgency === requestedForwardingAlias\.originAgency/);
  assert.match(workspace, /returnedForwardingAlias\.destinationAgency === requestedForwardingAlias\.destinationAgency/);
});

test("a forwarding must be physically present and arrival-confirmed before payment", () => {
  assert.match(resolver, /\.eq\("agency", agency\)/);
  assert.match(resolver, /\.in\("delivery_status", \["AVAILABLE", "PRESENT"\]\)/);
  assert.match(resolver, /forwarding\.status !== "ARRIVAL_CONFIRMED"/);
});

test("homonyms require an explicit forwarding route or parcel identity", () => {
  assert.match(resolver, /candidate\.forwarding_id/);
  assert.match(resolver, /parcelId \? candidates\.find/);
  assert.match(workspace, /foundParcel\.parcelId !== requestedParcelId/);
  assert.match(workspace, /foundParcel\.forwardingId \? null : await loadParcelAction\(foundParcel\.codeColis\)/);
});
