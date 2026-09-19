# QR 250 — local validation, not deployed

## Contract

- POST `/api/agent/qr/batch-assign`: `{ batchId: UUID, lines: [...] }`, 1–250 commands.
- GET `/api/agent/qr/batch-status?batchId=UUID`: read-only; same active COO authorization as POST.
- DB RPCs accept active COO Agents/Admin; destination Agents have no new permission.
- A batch ID is owned by its actor and bound to its exact normalized payload. Never reuse it for edited input.
- Per-line `requestId` values and existing QR uniqueness constraints remain unchanged.
- One PostgreSQL transaction calls the existing assignment function for every line. There are no per-line network RPCs.
- Journal and advisory transaction lock coordinate all Vercel instances. Committed results are durable, not a memory cache.
- A rejected batch is terminal for its ID. Manual retry after prevalidation creates a **new batch ID**, preserving the original line IDs (rolled back, not committed).
- `IN_PROGRESS`/`NOT_OBSERVED` are not proof of failure or non-application. Use GET; never blindly replay successes.
- A committed journal receipt is historical execution evidence, not a claim that an Admin has never corrected the QR afterwards.

## Atomicity and limits

- Schema, duplicate, manifest/identity and version checks precede mutation.
- SQL independently validates the payload, actor, duplicates and row states, locks labels in stable order, then reuses `assign_qr_label_server`.
- Errors in the SQL subtransaction roll back all QR changes **and all associated audit inserts**. A separate batch rejection receipt is retained.
- Unexpected disconnect/query cancellation can roll back the entire transaction including the receipt: an absent receipt must remain uncertain until checked.
- A normal new confirmation uses **3 QR RPCs**: receipt read, registry read, single batch mutation; plus the existing manifest read and authorization. Counts do not scale with N.
- Bounded server phases: authorization 5s; receipt 3.5s; preflight 12s; batch RPC 12.5s maximum. Happy path upper budget 33s, client 45s unchanged.
- SQL lock waits: 2s. SQL checks an 8s execution deadline before each unit and before commit. It rolls back on exceeded budget.
- Deadline guards protect safety and responsiveness; they cannot promise availability during a database/network outage.

## Reproduce local PostgreSQL tests

Use a temporary directory with `embedded-postgres@17.9.0-beta.16` and `pg` installed, outside project dependencies.
Set `QR_TEST_RUNTIME` to that directory, and `QR_TEST_FOUNDATION` to the existing `001_qr_central_foundation.sql`.

```sh
node --test local-preparation/supabase/qr/qr-batch-postgres.test.mjs
node --experimental-strip-types --test src/server/qr-batch-capacity.test.mjs
pnpm exec tsc --noEmit
pnpm build
git diff --check
```

The PostgreSQL test creates its own temporary cluster, listens only on 127.0.0.1 on a free port, uses synthetic identities, and stops the server in `finally`. It never accepts a Production database URL and never uses Production credentials. Persistent temporary test data is retained for diagnosis.

## Deployment prerequisites (not executed)

1. Review the additive migration and test results. No existing table/index/function is replaced by the migration.
2. Obtain explicit Production authorization, back up/review schema, apply only the QR batch migration, verify grants.
3. Deploy the scoped site changes. The old single-association API remains unchanged.
4. Until the migration exists, the new code fails closed; it must **not** fall back to per-line mutation.
5. Validate authenticated COO operation in an approved isolated environment, then controlled Production checks without replaying historical lots.
6. For code rollback, stop use of the new UI and restore the preceding code version. Retain the durable journal; do not delete committed receipts or reverse business associations automatically.

No migration, remote commit, push or deployment was performed during this preparation.
