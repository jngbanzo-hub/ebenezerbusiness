// Real PostgreSQL, synthetic data only. Requires QR_TEST_RUNTIME (embedded-postgres + pg)
// and QR_TEST_FOUNDATION pointing to the existing QR foundation SQL, not a database URL.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import net from "node:net";
import test from "node:test";

if (!process.env.QR_TEST_RUNTIME || !process.env.QR_TEST_FOUNDATION) throw Error("Isolated test runtime and foundation required");
const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve(process.env.QR_TEST_RUNTIME, "node_modules/embedded-postgres/dist/index.js")));
const sql = name => readFileSync(new URL(name, import.meta.url), "utf8");
const actor = "10000000-0000-4000-8000-000000000001";
const agent = "10000000-0000-4000-8000-000000000002";
const admin = "10000000-0000-4000-8000-000000000003";
const lines = n => Array.from({ length: n }, (_, i) => ({ lineNumber: i + 1, displayNumber: i + 1,
  agency: ["FIH", "LSHI", "KLZ"][i % 3], trackingCode: `AT${10000 + i}26`, expectedVersion: 1, requestId: randomUUID() }));

test("QR batch — isolated PostgreSQL transactions and concurrent connections", async t => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const pg = new EmbeddedPostgres({ databaseDir: join(mkdtempSync(join(tmpdir(), "eeb-qr-batch-test-")), "db"),
    port, user: "postgres", password: randomUUID(), persistent: true, createPostgresUser: false,
    postgresFlags: ["-h", "127.0.0.1"], onLog() {}, onError() {} });
  const clients = [];
  try {
    await pg.initialise(); await pg.start(); await pg.createDatabase("qr_batch_test");
    const a = pg.getPgClient("qr_batch_test", "127.0.0.1"), b = pg.getPgClient("qr_batch_test", "127.0.0.1");
    clients.push(a, b); await a.connect(); await b.connect();
    await a.query(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      create table public.agents(id uuid primary key, nom text, role text, agence text, actif boolean);`);
    await a.query(readFileSync(process.env.QR_TEST_FOUNDATION, "utf8"));
    await a.query(sql("003_qr_server_initial_assignment.sql"));
    await a.query(sql("005_qr_initial_assignment_coo_only.sql"));
    await a.query(sql("../../../supabase/migrations/20260916180000_qr_atomic_assignment_batches.sql"));
    await a.query("insert into auth.users values ($1),($2),($3)", [actor, agent, admin]);
    await a.query("insert into agents values ($1,'TEST COO','AGENT','COTONOU',true),($2,'TEST LSHI','AGENT','LSHI',true),($3,'TEST ADMIN','ADMIN','COO',true)", [actor, agent, admin]);
    async function seed() {
      await a.query("truncate qr_assignment_batches, qr_audit_events, qr_labels, qr_series");
      for (let start = 1; start <= 500; start += 100) {
        const id = randomUUID();
        await a.query("insert into qr_series(series_id,first_number,last_number,quantity,request_id,created_by) values($1,$2,$3,100,$4,$5)", [id, start, start + 99, randomUUID(), actor]);
        await a.query("insert into qr_labels(qr_id,display_number,series_id,created_by) select 'EEBQR'||lpad(i::text,6,'0'),i,$1,$2 from generate_series($3::int,$4::int) i", [id, actor, start, start + 99]);
      }
    }
    async function counts() {
      return (await a.query(`select (select count(*)::int from qr_labels where status='ASSIGNED') labels,
        (select count(*)::int from qr_audit_events) audits,(select count(*)::int from qr_assignment_batches) batches`)).rows[0];
    }
    async function call(client, batch, rows, who = actor) {
      return (await client.query("select assign_qr_batch_server($1,$2,$3::jsonb) result", [who, batch, JSON.stringify(rows)])).rows[0].result;
    }
    for (const n of [99, 100, 101, 249, 250]) await t.test(`${n} valid: one RPC, exact label/audit effects`, async () => {
      await seed(); const started = performance.now();
      const result = await call(a, randomUUID(), lines(n));
      assert.equal(result.status, "COMPLETED"); assert.equal(result.lines.length, n);
      assert.deepEqual(await counts(), { labels: n, audits: n, batches: 1 });
      console.log(JSON.stringify({ test: "real-local-postgres", n, rpc: 1, ms: +(performance.now() - started).toFixed(2), qrUpdates: n, auditInserts: n }));
    });
    await t.test("two independent connections: concurrent same batch, then lost-response read/retry", async () => {
      await seed(); const batch = randomUUID(), rows = lines(250);
      await a.query(`create function test_delay() returns trigger language plpgsql as $$begin perform pg_sleep(0.001); return new; end;$$;
        create trigger test_delay before update on qr_labels for each row execute function test_delay();`);
      const started = performance.now();
      const results = await Promise.all([call(a, batch, rows), call(b, batch, rows)]);
      assert(results.some(r => r.status === "COMPLETED"));
      assert(results.every(r => ["COMPLETED", "IN_PROGRESS"].includes(r.status)));
      assert.deepEqual(await counts(), { labels: 250, audits: 250, batches: 1 });
      const stored = (await b.query("select read_qr_assignment_batch_server($1,$2) r", [actor, batch])).rows[0].r;
      assert.equal(stored.result.status, "COMPLETED"); assert.equal(stored.result.lines.length, 250);
      assert.deepEqual(await call(b, batch, rows), stored.result);
      assert.deepEqual(await counts(), { labels: 250, audits: 250, batches: 1 });
      console.log(JSON.stringify({ test: "concurrent-250", statuses: results.map(r => r.status), ms: +(performance.now() - started).toFixed(2), realExecutions: 1, duplicateEffects: 0 }));
      await a.query("drop trigger test_delay on qr_labels; drop function test_delay()");
      const altered = structuredClone(rows); altered[0].trackingCode = "DIFFERENT26";
      await assert.rejects(call(a, batch, altered), /QR_IDEMPOTENCY_CONFLICT/);
      await assert.rejects(call(a, batch, rows, admin), /QR_IDEMPOTENCY_CONFLICT/);
    });
    for (const kind of ["used", "duplicate", "invalid", "251", "ambiguous-request"]) await t.test(`${kind}: no association written`, async () => {
      await seed(); const rows = lines(kind === "251" ? 251 : 250);
      if (kind === "used") {
        await a.query("select assign_qr_label_server($1,null,125,'LSHI','ALREADY26',1,$2)", [actor, randomUUID()]);
        const result = await call(a, randomUUID(), rows); assert.equal(result.status, "REJECTED");
        assert(result.lines.every(l => l.application === "NOT_APPLIED"));
        assert.deepEqual(await counts(), { labels: 1, audits: 1, batches: 1 });
      } else {
        if (kind === "duplicate") rows[249].displayNumber = rows[0].displayNumber;
        if (kind === "invalid") rows[249].trackingCode = "<bad>";
        if (kind === "ambiguous-request") rows[249].requestId = rows[0].requestId;
        await assert.rejects(call(a, randomUUID(), rows), /INVALID_QR_BATCH|DUPLICATE_IN_LIST/);
        assert.deepEqual(await counts(), { labels: 0, audits: 0, batches: 0 });
      }
    });
    await t.test("error at row 125: global rollback including first 124 audit entries", async () => {
      await seed();
      await a.query(`create function test_fail() returns trigger language plpgsql as $$begin if new.display_number=125 then raise exception 'SYNTHETIC_FAILURE'; end if; return new; end;$$;
        create trigger test_fail before update on qr_labels for each row execute function test_fail();`);
      const rows = lines(250), batch = randomUUID(), result = await call(a, batch, rows);
      assert.equal(result.status, "REJECTED"); assert.equal(result.lines.length, 250);
      assert(result.lines.every(l => l.application === "NOT_APPLIED" && l.retrySafe));
      assert.deepEqual(await counts(), { labels: 0, audits: 0, batches: 1 });
      assert.deepEqual(await call(b, batch, rows), result);
      await a.query("drop trigger test_fail on qr_labels; drop function test_fail()");
      assert.equal((await call(a, randomUUID(), rows)).status, "COMPLETED");
      assert.deepEqual(await counts(), { labels: 250, audits: 250, batches: 2 });
    });
    await t.test("cancelled RPC: QR writes and journal roll back, same ID remains safe", async () => {
      await seed();
      await a.query(`create function test_cancel_slow() returns trigger language plpgsql as $$begin perform pg_sleep(0.003); return new; end;$$;
        create trigger test_cancel_slow before update on qr_labels for each row execute function test_cancel_slow();`);
      const pid = (await a.query("select pg_backend_pid() pid")).rows[0].pid;
      const batch = randomUUID(), rows = lines(250);
      const pending = call(a, batch, rows);
      const rejected = assert.rejects(pending, /canceling statement/);
      await new Promise(resolve => setTimeout(resolve, 50));
      await b.query("select pg_cancel_backend($1)", [pid]);
      await rejected;
      assert.deepEqual(await counts(), { labels: 0, audits: 0, batches: 0 });
      assert.equal((await b.query("select read_qr_assignment_batch_server($1,$2) r", [actor, batch])).rows[0].r, null);
      await a.query("drop trigger test_cancel_slow on qr_labels; drop function test_cancel_slow()");
      assert.equal((await call(b, batch, rows)).status, "COMPLETED");
      assert.deepEqual(await counts(), { labels: 250, audits: 250, batches: 1 });
    });
    await t.test("overlapping batches with different IDs: no duplicate association", async () => {
      await seed(); const rows = lines(250);
      const result = await Promise.all([call(a, randomUUID(), rows), call(b, randomUUID(), rows.map(l => ({ ...l, requestId: randomUUID() })))]);
      assert.equal(result.filter(r => r.status === "COMPLETED").length, 1);
      assert.deepEqual(await counts(), { labels: 250, audits: 250, batches: 2 });
    });
    await t.test("bound SQL work: deadline rolls back the entire slow batch", async () => {
      await seed();
      await a.query(`create function test_slow() returns trigger language plpgsql as $$begin perform pg_sleep(0.04); return new; end;$$;
        create trigger test_slow before update on qr_labels for each row execute function test_slow();`);
      const started = performance.now(), result = await call(a, randomUUID(), lines(250));
      const ms = performance.now() - started;
      assert.equal(result.status, "REJECTED"); assert(result.lines.some(l => l.code === "QR_BATCH_DEADLINE"));
      assert(ms < 12000); assert.deepEqual(await counts(), { labels: 0, audits: 0, batches: 1 });
      console.log(JSON.stringify({ test: "deadline-rollback", ms: +ms.toFixed(2), labels: 0, audits: 0 }));
      await a.query("drop trigger test_slow on qr_labels; drop function test_slow()");
    });
    await t.test("COO/Admin only, status ownership and service-only RPCs", async () => {
      await seed(); const batch = randomUUID(), rows = lines(1);
      await assert.rejects(call(a, batch, rows, agent), /QR_ACCESS_DENIED/);
      assert.equal((await call(a, batch, rows, admin)).status, "COMPLETED");
      assert.equal((await b.query("select read_qr_assignment_batch_server($1,$2) r", [actor, batch])).rows[0].r, null);
      const grants = (await a.query(`select grantee from information_schema.routine_privileges where routine_name='assign_qr_batch_server'`)).rows.map(r => r.grantee);
      assert(!grants.includes("anon") && !grants.includes("authenticated") && !grants.includes("PUBLIC"));
      assert(grants.includes("service_role"));
      const access = (await a.query("select has_table_privilege('service_role','public.qr_assignment_batches','INSERT') allowed")).rows[0].allowed;
      assert.equal(access, false);
    });
  } finally {
    for (const client of clients) await client.end().catch(() => {});
    await pg.stop();
  }
});
