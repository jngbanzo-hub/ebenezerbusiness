import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import vm from "node:vm";

import {
  buildStorageExitReport,
  readAllStorageExitPages,
  resolveStorageExitPeriod
} from "./admin-storage-exits-model.ts";

const now = new Date("2026-10-27T12:00:00Z");
const period = (name, options = {}) => resolveStorageExitPeriod(name, { now, ...options });

function exit(eventId, agency = "FIH", code = "OT12926", weight = 8, type = "SORTIE_APRES_PAIEMENT_TOTAL_DESTINATION") {
  return {
    event_id: eventId, event_type: type, agency, tracking_code: code,
    parcel_count_delta: -1, weight_kg_delta: -weight,
    occurred_at: "2026-10-26T13:14:00Z", business_date: "2026-10-26",
    source_type: "PAYMENT_ENGINE", source_request_id: eventId, metadata: {}
  };
}

const report = (events, corrections = [], extra = {}) => buildStorageExitReport({
  agency: "FIH", events, corrections, parcels: [], forwardings: [], page: 1, pageSize: 25, ...extra
});

test("periods use inclusive Porto-Novo calendar days and Monday-Sunday week", () => {
  assert.deepEqual([period("today").fromDate, period("today").toDate], ["2026-10-27", "2026-10-27"]);
  assert.deepEqual([period("yesterday").fromDate, period("yesterday").toDate], ["2026-10-26", "2026-10-26"]);
  assert.deepEqual([period("week").fromDate, period("week").toDate], ["2026-10-26", "2026-11-01"]);
  assert.deepEqual([period("month").fromDate, period("month").toDate], ["2026-10-01", "2026-10-31"]);
  assert.deepEqual([period("year", { year: 2027 }).fromDate, period("year", { year: 2027 }).toDate], ["2027-01-01", "2027-12-31"]);
  assert.deepEqual([period("custom", { from: "2026-10-12", to: "2026-10-12" }).fromIso, period("custom", { from: "2026-10-12", to: "2026-10-12" }).toExclusiveIso], ["2026-10-11T23:00:00.000Z", "2026-10-12T23:00:00.000Z"]);
  assert.deepEqual([period("custom", { from: "2026-10-12", to: "2026-10-18" }).fromDate, period("custom", { from: "2026-10-12", to: "2026-10-18" }).toDate], ["2026-10-12", "2026-10-18"]);
  assert.throws(() => period("custom", { from: "2026-02-30", to: "2026-03-01" }), /INVALID_DATE_RANGE/);
  assert.throws(() => period("custom", { from: "2026-10-18", to: "2026-10-12" }), /INVALID_DATE_RANGE/);
});

test("each real exit remains distinct after re-arrival, never deduplicated by code", () => {
  const result = report([exit("exit-before-rearrival"), exit("exit-after-rearrival")]);
  assert.equal(result.summary.count, 2);
  assert.equal(result.summary.weightKg, 16);
  assert.equal(result.pagination.total, 2);
});

test("decimal kilogram totals use three-decimal storage precision", () => {
  assert.equal(report([exit("a", "FIH", "A", 0.1), exit("b", "FIH", "B", 0.2)]).summary.weightKg, 0.3);
});

test("same code in another agency cannot enter the requested agency", () => {
  assert.throws(() => report([exit("other-agency", "LSHI")]), /EXIT_SCOPE_CONFLICT/);
  assert.equal(report([exit("fih"), exit("lshi", "LSHI")].filter((row) => row.agency === "FIH")).summary.count, 1);
});

test("FIH, KLZ and LSHI are summarized independently", () => {
  const all = [exit("fih", "FIH", "AT05826", 8), exit("klz", "KLZ", "AT05826", 9), exit("lshi", "LSHI", "AT05826", 10)];
  for (const [agency, expected] of [["FIH", 8], ["KLZ", 9], ["LSHI", 10]]) {
    const result = report(all.filter((item) => item.agency === agency), [], { agency });
    assert.equal(result.summary.count, 1);
    assert.equal(result.summary.weightKg, expected);
  }
});

test("delivery and forwarding departure are counted as distinct types", () => {
  const departure = { ...exit("forwarding", "FIH", "AT02326", 3, "SORTIE_POUR_ACHEMINEMENT"),
    source_type: "INTER_AGENCY_FORWARDING", source_request_id: "forwarding-1" };
  const result = report([exit("delivery"), departure], [], { forwardings: [{ forwarding_id: "forwarding-1", forwarding_reference: "AT02326-FIH-LSHI", original_tracking_code: "AT02326", origin_agency: "FIH", destination_agency: "LSHI" }] });
  assert.equal(result.summary.count, 2);
  assert.equal(result.summary.weightKg, 11);
  assert.equal(result.items.find((item) => item.eventId === "forwarding")?.type, "ACHEMINEMENT");
  assert.equal(result.items.find((item) => item.eventId === "forwarding")?.forwardingId, "forwarding-1");
});

test("uncertified forwarding identity or missing weight suspends totals", () => {
  const departure = { ...exit("forwarding", "KLZ", "AT02326", 3, "SORTIE_POUR_ACHEMINEMENT"), source_type: "INTER_AGENCY_FORWARDING", source_request_id: "missing" };
  const forwardingResult = buildStorageExitReport({ agency: "KLZ", events: [departure], corrections: [], parcels: [], forwardings: [], page: 1, pageSize: 25 });
  assert.equal(forwardingResult.summary.complete, false);
  assert.equal(forwardingResult.summary.count, null);
  assert.equal(report([exit("no-weight", "FIH", "AT14526", Number.NaN)]).summary.complete, false);
  const wrongOrigin = buildStorageExitReport({ agency: "KLZ", events: [departure], corrections: [], parcels: [], forwardings: [{ forwarding_id: "missing", forwarding_reference: "AT02326-FIH-KLZ", original_tracking_code: "AT02326", origin_agency: "FIH", destination_agency: "KLZ" }], page: 1, pageSize: 25 });
  assert.equal(wrongOrigin.summary.complete, false);
});

test("verified correction adjusts contribution, cancellation stays visible but excluded", () => {
  const corrections = [
    { event_id: "c1", target_event_id: "e1", agency: "FIH", occurred_at: "2026-10-27T10:00:00Z", reason: "Poids corrigé", metadata: { correctedParcelDelta: -1, correctedWeightDelta: -6 } },
    { event_id: "c2", target_event_id: "e2", agency: "FIH", occurred_at: "2026-10-27T11:00:00Z", reason: "Sortie annulée", metadata: { correctedParcelDelta: 0, correctedWeightDelta: 0 } }
  ];
  const result = report([exit("e1"), exit("e2")], corrections);
  assert.equal(result.summary.count, 1);
  assert.equal(result.summary.weightKg, 6);
  assert.equal(result.pagination.total, 2);
  assert.equal(result.items.find((item) => item.eventId === "e2")?.correction, "CANCELLED");
});

test("a correction recorded after the selected exit day still changes that day's totals", () => {
  const selected = period("custom", { from: "2026-10-26", to: "2026-10-26" });
  const original = exit("e1");
  const laterCorrection = {
    event_id: "later-correction", target_event_id: "e1", agency: "FIH",
    occurred_at: "2026-10-27T10:00:00Z", reason: "Annulation postérieure",
    metadata: { correctedParcelDelta: 0, correctedWeightDelta: 0 }
  };
  assert.ok(original.occurred_at >= selected.fromIso && original.occurred_at < selected.toExclusiveIso);
  assert.ok(laterCorrection.occurred_at >= selected.toExclusiveIso);
  const result = report([original], [laterCorrection]);
  assert.equal(result.items[0].correction, "CANCELLED");
  assert.equal(result.summary.count, 0);
  assert.equal(result.summary.weightKg, 0);

  const reader = readFileSync(new URL("../../server/admin-storage-exits.ts", import.meta.url), "utf8");
  const correctionQuery = reader.slice(reader.indexOf('client.from("stockage_events")', reader.indexOf("const correctionRows")), reader.indexOf("if (error) throw new StockagesV2Error(\"STORAGE_EXIT_CORRECTION_READ_INCOMPLETE\""));
  assert.match(correctionQuery, /\.in\("target_event_id", ids\)/);
  assert.match(correctionQuery, /\.lt\("occurred_at", asOf\)/);
  assert.doesNotMatch(correctionQuery, /\.gte\("occurred_at", interval\.fromIso\)|\.lt\("occurred_at", upper\)/);
});

test("multiple or unprovable corrections fail closed instead of exposing partial totals", () => {
  const correction = { event_id: "c1", target_event_id: "e1", agency: "FIH", occurred_at: "2026-10-27T10:00:00Z", reason: "Correction", metadata: {} };
  assert.equal(report([exit("e1")], [correction]).summary.complete, false);
  assert.equal(report([exit("e1")], [{ ...correction, metadata: { correctedParcelDelta: null, correctedWeightDelta: null } }]).summary.complete, false);
  assert.equal(report([exit("e1")], [correction, { ...correction, event_id: "c2" }]).summary.weightKg, null);
});

test("paginated history reads every page beyond 100 and totals use all rows", async () => {
  const source = Array.from({ length: 1201 }, (_, index) => exit(`event-${String(index).padStart(4, "0")}`, "FIH", `AT${String(index).padStart(5, "0")}`, 2));
  const calls = [];
  const rows = await readAllStorageExitPages(async (from, to) => { calls.push([from, to]); return source.slice(from, to + 1); }, (row) => row.event_id, 1000);
  const result = report(rows, [], { page: 2, pageSize: 25 });
  assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
  assert.equal(result.pagination.total, 1201);
  assert.equal(result.items.length, 25);
  assert.equal(result.summary.count, 1201);
  assert.equal(result.summary.weightKg, 2402);
  await assert.rejects(() => readAllStorageExitPages(async () => [exit("same"), exit("same")], (row) => row.event_id, 100), /DUPLICATE_EVENT_ID/);
});

test("admin-only route and ordered UI filters are read-only by construction", () => {
  const route = readFileSync(new URL("../../app/api/admin/stockages/v2/exits/route.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("./admin-storage-exits-page.tsx", import.meta.url), "utf8");
  const reader = readFileSync(new URL("../../server/admin-storage-exits.ts", import.meta.url), "utf8");
  assert.match(route, /export async function GET/);
  assert.match(route, /authorizeAdminRequest\(request\)/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(reader, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  const order = ["Aujourd’hui", "Hier", "Cette semaine", "Ce mois", "Année", "Personnalisé"];
  assert.deepEqual([...ui.matchAll(/\{ value: "[^"]+", label: "([^"]+)" \}/g)].map((match) => match[1]), order);
});

test("reversed custom dates are blocked in the UI before the authenticated read", () => {
  const ui = readFileSync(new URL("./admin-storage-exits-page.tsx", import.meta.url), "utf8");
  assert.match(ui, /customRangeReversed = period === "custom" && from !== "" && to !== "" && from > to/);
  assert.match(ui, /const canRead = .* !customRangeReversed/);
  assert.match(ui, /if \(customRangeReversed\) \{ setMessage\("La date de début doit être antérieure ou égale à la date de fin\."\); return; \}/);
  assert.ok(ui.indexOf("if (customRangeReversed)") < ui.indexOf("void authenticatedRead("));
});

test("exit API rejects anonymous and non-Admin sessions, permits Admin, and blocks reversed dates before reading", async () => {
  const compile = (source) => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const authExports = {};
  vm.runInNewContext(compile(readFileSync(new URL("../../server/admin-authorization.ts", import.meta.url), "utf8")), {
    exports: authExports,
    require: (name) => {
      if (name === "server-only") return {};
      if (name === "@supabase/supabase-js") return { createClient: () => { throw new Error("No production auth access in this test"); } };
      throw new Error(`Unexpected authorization dependency: ${name}`);
    }
  });
  const identities = {
    admin: { userId: "admin-test", email: "admin@example.invalid", profile: { id: "admin-test", actif: true, role: "ADMIN", agence: "FIH" } },
    agent: { userId: "agent-test", email: "agent@example.invalid", profile: { id: "agent-test", actif: true, role: "AGENT", agence: "FIH" } }
  };
  const reads = [];
  const routeExports = {};
  vm.runInNewContext(compile(readFileSync(new URL("../../app/api/admin/stockages/v2/exits/route.ts", import.meta.url), "utf8")), {
    exports: routeExports, URL, Set, Number, Error,
    require: (name) => {
      if (name === "next/server") return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
      if (name === "@/server/admin-authorization") return {
        authorizeAdminRequest: (request) => authExports.authorizeAdminRequest(request, async (token) => identities[token] ?? null)
      };
      if (name === "@/server/admin-storage-exits") return { readAdminStorageExits: async (input) => { reads.push(input); return { state: "OK" }; } };
      if (name === "@/server/stockages-v2") return {
        isStockagesV2Enabled: () => true,
        requireStorageAgency: (value) => { if (!["FIH", "KLZ", "LSHI"].includes(value)) throw new Error("INVALID_AGENCY"); return value; },
        StockagesV2Error: class StockagesV2Error extends Error {}
      };
      throw new Error(`Unexpected route dependency: ${name}`);
    }
  });
  const request = (query, token) => new Request(`https://example.invalid/api/admin/stockages/v2/exits?agency=FIH&${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  assert.equal((await routeExports.GET(request("period=today"))).status, 401);
  assert.equal((await routeExports.GET(request("period=today", "agent"))).status, 403);
  assert.equal(reads.length, 0);
  assert.equal((await routeExports.GET(request("period=today", "admin"))).status, 200);
  assert.equal(reads.length, 1);

  const reversed = await routeExports.GET(request("period=custom&from=2026-10-27&to=2026-10-26", "admin"));
  assert.equal(reversed.status, 400);
  assert.equal(reversed.body.code, "INVALID_DATE_RANGE");
  assert.equal(reversed.body.message, "La date de début doit être antérieure ou égale à la date de fin.");
  assert.equal(reads.length, 1);

  assert.equal((await routeExports.GET(request("period=custom&from=2026-10-26&to=2026-10-26", "admin"))).status, 200);
  assert.equal(reads.length, 2);
  assert.equal(reads[1].from, "2026-10-26");
  assert.equal(reads[1].to, "2026-10-26");
});
