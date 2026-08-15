import assert from "node:assert/strict";
import test from "node:test";

import { parseQrBatchInput } from "./qr-batch-parser.ts";

test("parse chaque correspondance indépendamment sans décalage", () => {
  assert.deepEqual(parseQrBatchInput("014 | klz | AT09526\nligne invalide\n16|FIH|MR12326"), [
    { lineNumber: 1, displayNumber: "014", agency: "KLZ", trackingCode: "AT09526" },
    { lineNumber: 2, displayNumber: "", agency: "", trackingCode: "" },
    { lineNumber: 3, displayNumber: "16", agency: "FIH", trackingCode: "MR12326" }
  ]);
});

test("préserve strictement les suffixes métier B C D", () => {
  const lines = parseQrBatchInput("15|KLZ|AT09626B\n16|KLZ|AT09626C\n17|KLZ|AT09626D");
  assert.deepEqual(lines.map((line) => line.trackingCode), ["AT09626B", "AT09626C", "AT09626D"]);
});
