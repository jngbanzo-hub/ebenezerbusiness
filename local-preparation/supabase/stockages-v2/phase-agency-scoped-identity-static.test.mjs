import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(new URL("./011_agency_scoped_parcel_identity.sql", import.meta.url), "utf8");
const rollback = fs.readFileSync(new URL("./011_agency_scoped_parcel_identity.rollback.sql", import.meta.url), "utf8");

assert.match(sql, /primary key \(agency, tracking_code\)/i);
assert.match(sql, /on public\.stockage_events\(agency, tracking_code\)/i);
assert.match(sql, /on conflict \(agency, tracking_code\) do nothing/i);
assert.match(sql, /agency=v_agency and tracking_code=v_code for update/i);
assert.match(sql, /agency=v_row\.agency and tracking_code=v_row\.tracking_code for update/i);
assert.match(sql, /agency=v_forwarding\.destination_agency and tracking_code=v_forwarding\.forwarding_reference for update/i);
assert.match(rollback, /ROLLBACK_BLOCKED_BY_CROSS_AGENCY_CODES/);
console.log("Agency-scoped parcel identity static checks passed.");
