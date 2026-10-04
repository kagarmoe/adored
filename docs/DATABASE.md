# Database

How **this** repo uses Postgres, as it is today. Every claim below is traceable to a file in the tree —
this is not a normalization primer. When the code and this page disagree, the code wins and this page is
the bug.

Stack: Postgres (Neon in every deployed environment), Drizzle ORM + drizzle-kit, `postgres-js` driver.
Schema: `src/lib/db/schema.ts` — 17 tables, one file, no per-table splits.

*Why the schema is the shape it is — the decisions behind it — lives in `docs/ARCHITECTURE.md`'s decision
log, not here.*

---

## 1. Schema conventions

### Primary keys are text, app-generated, and prefixed

Every table declares `id: text("id").primaryKey()` — no `serial`, no `uuid`, no DB default. The id is
minted in the app by `generateId(prefix)` (`src/lib/id.ts:10`), which returns
`` `${prefix}_${nextUlid().toLowerCase()}` `` from one module-level ULID `monotonicFactory()`.

**The ULID's lexicographic time-ordering is load-bearing.** Decision-event replay sorts by `createdAt`,
then breaks same-millisecond ties by *code-unit id comparison* (`compareByCreatedAtThenId`,
`src/lib/decision-order.ts:12`) — so that tie-break is chronological *only because* a ULID sorts
lexicographically in time order. The contract is pinned by a test, not folklore:
`src/lib/decision-order.test.ts:42` (`"ulid ids are lexicographically time-ordered (the tie-break's
chronology contract)"`). Lowercasing is order-preserving for Crockford base32; the fixed prefix keeps all
ids of a kind in one ordering regime.

`generateId` mints from one process-wide ULID monotonic factory, so ids minted in one process sort in
creation order even within a millisecond (bare `ulid()` randomizes within a millisecond, which ordered
same-ms rows by chance — `purses-w7ss.16`). Ids minted concurrently on two instances are not ordered.
`generateOrderedIdFactory()` (`src/lib/id.ts:19`) remains for batch inserts (one factory per request/batch;
consolidating it is `purses-w7ss.20`). A module-level monotonic factory is safe because ids are not
capabilities: knowing or predicting one grants nothing — share and invite tokens come from `randomBytes`,
and every access check is server-side authz.

### Soft delete via `deletedAt`

`deletedAt: timestamp("deleted_at")` (nullable) is the soft-delete marker. It is on the four tables whose
entities are user-recoverable, and nowhere else:

| Has `deletedAt` | Does not |
|---|---|
| `collections` (`schema.ts:109`), `items` (`:142`), `photos` (`:171`), `sessions` (`:197`) | `sort_results`, `sort_result_items`, `sort_result_shares`, `preferences`, `item_dispositions`, `decision_events`, `audit_log`, `invitations`, `memberships`, and the four better-auth tables |

The reader split is the part that matters:

- **`findById(id)` filters soft-deleted rows** — e.g. `ItemRepository.findById`
  (`src/server/repositories/implementations/ItemRepository.ts:75`): `and(eq(id), isNull(deletedAt))`.
- **`findByIdIncludingDeleted(id)` exists for purge paths** (`ItemRepository.ts:83`; same pair on
  `CollectionRepository` and `SessionRepository`). An owner-only destructive route that runs *after* a
  soft delete **must** resolve through it: the access gate's `findById` filters `deletedAt`, so a
  soft-deleted entity would otherwise be un-purgeable and would leak its blobs.

`photos` also indexes the marker (`photos_deleted_at_idx`, `schema.ts:177`).

### The per-collection catalog-number pattern

User-facing URLs use a small per-collection number (`/collections/{id}/items/{number}`), not the opaque
id. The invariant is a composite unique index, once per catalog table:

- `items_collection_number_unique` on `(collection_id, number)` — `schema.ts:146`
- `sessions_collection_number_unique` on `(collection_id, number)` — `schema.ts:211`
- `sort_results_collection_number_unique` on `(collection_id, number)` — `schema.ts:354`

Numbers are allocated MAX+1, which races. The race is resolved by **letting the index reject the loser and
retrying**, not by locking: `allocateWithRetry(attempt, isRetryableConflict, attempts = 5)`
(`src/server/repositories/allocateWithRetry.ts`) recomputes MAX+1 inside `attempt` and retries only the one
constraint a fresh value can actually resolve (`SessionRepository.ts:249`, `ItemRepository.ts:211`).
Bounded, so a persistent conflict surfaces instead of spinning.

Constraint-name matching goes through `isUniqueViolation(error, name)`
(`src/server/repositories/pg-conflict.ts`), which **walks `.cause`**: drizzle 0.45 wraps the driver error,
so reading `error.code` off the top-level throw yields `undefined` and the conflict degrades into a 500
instead of a gentle 409. Never read `.code` directly — use the helper.

### Partial unique indexes (five)

A partial unique index encodes "unique *among the rows that count*". Each predicate here carries meaning:

| Index | Predicate | Means |
|---|---|---|
| `sessions_active_unique` on `(collection_id, curator_id)` (`schema.ts:206`) | `deleted_at is null and status in ('active','paused')` | **One in-progress session per (collection, curator).** Terminal or soft-deleted rows free the slot. |
| `preferences_order_rank_unique` on `(collection_id, curator_id, order_rank)` (`schema.ts:297`) | `order_rank is not null` | Manual ordering is unique per curator *where set*; unranked rows (NULL) don't collide. |
| `decision_events_client_key_unique` on `(session_id, client_key)` (`schema.ts:233`) | `client_key is not null` | Idempotency key, only for requests that supply one. |
| `sort_results_open_draft_unique` on `(collection_id, curator_id)` (`schema.ts:360`) | `status = 'draft'` | **One open draft per (collection, curator)** (migration 0003). The ranking writers (pin, unpin, save, revision, finalize, draft delete, legacy create) run under the `(collection, curator)` advisory lock (`SortResultService.inCuratorTx`), so the index is a backstop, never a 500 for them. Every draft writer in `SortResultService` is under the curator lock; the owner purge-prep (`removeItemFromDraftResults`) takes every curator's lock for the collection (`lockCollectionCurators`). (`AccountDeletionService`'s draft writes are `purses-w7ss.18`.) |
| `sort_results_save_key_unique` on `(curator_id, save_key)` (`schema.ts:363`) | `save_key is not null` | Save-and-share idempotency key (migration 0003); a retried save returns the same link. |

**The rule a partial unique index imposes on every writer** (memory:
`partial-index-every-writer-must-respect-slot`): the predicate means collisions are possible on **every
writer that can move a row INTO it** — not just the INSERT. For `sessions_active_unique` there are three:
create (INSERT), restore (UPDATE `deletedAt = null, status = active`), and PATCH-status-back-to-active. Each
must catch the 23505 on the index name and turn it into a typed error → a gentle 409, never a raw 500
(`SessionRepository.ts:255`). **If you add or change a partial predicate, enumerate every INSERT and every
UPDATE that sets a predicate column, and guard them identically.**

Two working constraints that follow from this:

- **drizzle-kit cannot serialize a partial-index predicate**, so `db:generate` emits nothing for one —
  hand-author the migration (`DROP` + `CREATE ... WHERE`), keep the index **name** (the conflict-catch
  matches on it), and re-run `db:generate` as a drift guard. The `.where()` in `schema.ts` records the
  intended truth (see the comment at `schema.ts:202`); the meta snapshot records the index as
  unconditional, so a later `db:generate` may show a spurious index diff — **the applied SQL governs.**
- **A partial unique (`WHERE col IS NOT NULL`) is behaviorally indistinguishable from a plain unique**
  under Postgres's default NULLS DISTINCT — insert/reject tests pass under both. The only honest CI proof
  that the predicate is partial is asserting `pg_indexes.indexdef` contains the `WHERE` clause (memory:
  `partial-index-test-indexdef`).

### CHECK constraints

One: `memberships_role_check` — `role in ('owner', 'curator')` (`schema.ts:464`).

**Declare CHECKs in `schema.ts` via `check()`, not only in migration SQL.** A constraint that exists only
in a `.sql` file is invisible to `drizzle-kit generate`, which will then happily emit a baseline that ships
the column as free text.

The other enum-ish columns (`status`, `disposition`, `rank_bucket`, `manual_bucket`, `usage`) are
deliberately **plain text with no CHECK**, guarded by typed writers instead. `sort_result_items.usage`
documents that choice at `schema.ts:376`: NULL means "unknown at snapshot time" and renders no chip, rather
than being an invalid value.

### Foreign keys — and where they are deliberately absent

- **Cascade: only the better-auth tables.** `account.userId` and `session.userId` are
  `references(() => user.id, { onDelete: "cascade" })` (`schema.ts:43`, `:67`).
- **No cascade: every domain FK** — `collections.ownerId`, `items.collectionId`, `photos.collectionId`,
  `sessions.collectionId`/`curatorId`, `preferences.*`, `sort_results.*`, and the rest. Deletion is
  therefore explicit and ordered: `CollectionPurgeService` deletes deepest-child-first across the FK graph.
  To extend a purge, enumerate the referrers from the schema (`grep 'references(() => Table'`) — the DB
  will not do it for you.
- **No FKs at all, by design: `audit_log`** (`schema.ts:244`). It is the permanent-purge trail; its targets
  (item, collection) are *being deleted*, so it references them by bare id as a standalone historical record
  that outlives them. Append-only — no UPDATE/DELETE path. Its one index,
  `audit_log_collection_created_idx` on `(collection_id, created_at, id)`, is a **total** order (id
  tie-breaks a same-millisecond `createdAt`) so a keyset cursor over it is safe.
- **`photos.itemId` is nullable and un-cascaded on purpose:** `item_id IS NULL` **is** the photo pool
  (unassigned photos for a collection).

### NOT NULL vs nullable

The rule: **structural columns are NOT NULL; user-supplied metadata is nullable.**

- **NOT NULL** — every FK that scopes a row (`collection_id`, `curator_id`, `session_id`,
  `sort_result_id`); `status` (with a `.default()`); `created_at` / `updated_at`
  (`.defaultNow().notNull()`); computed values (`preferences.score`, `confidence`, `rankBucket`,
  `comparisonCount`, `lastSeen`; `sort_result_items.computedRank`, `computedBucket`); the catalog numbers
  `sessions.number` (`schema.ts:192`) and `sort_results.number` (`schema.ts:344`); and `photos.isHero`
  (`schema.ts:167`, defaults `false`).
- **Nullable** — the metadata a person may simply not have entered yet: `items.name`, `brand`, `style`,
  `color`, `material`, `category`, `height`/`width`/`depth`/`weight`, `notes`, `story`;
  `collections.slug`, `description`; `sessions.goal`; `preferences.orderRank` (unranked);
  `sort_result_items.manualRank` / `manualBucket` / `usage`.

A nameless item is a **first-class state** — the bulk-upload flow defers metadata on purpose. Do not
"tighten" those columns to NOT NULL.

---

## 2. Migration workflow

```bash
npm run db:generate    # drizzle-kit: diff schema.ts → a new drizzle/NNNN_*.sql + journal + snapshot
npm run db:migrate     # tsx scripts/migrate.ts: apply pending migrations to DATABASE_URL
```

**Adding a migration:** edit `src/lib/db/schema.ts` → `npm run db:generate` → **read the generated SQL**
(it is the artifact under review, not the schema diff) → commit it → it **auto-applies at the next deploy**.
Migrations are **append-only**: to change the schema, add a new `.sql`; never edit an applied one.

`drizzle/` currently holds `0000_init.sql`, `0001_clumsy_ser_duncan.sql`, `0002_illegal_the_watchers.sql`,
`0003_blushing_shape.sql` (`sort_results.save_key` + partial uniques `sort_results_open_draft_unique` and
`sort_results_save_key_unique`, after a data step that keeps only the newest open draft per (collection, curator)),
plus `meta/_journal.json`. Code comments elsewhere may cite migration numbers that are not files on disk —
`drizzle/` is the truth.

**Lock timeout and retry.** `scripts/migrate.ts` sets `lock_timeout = 5s` as a connection startup
parameter; `ensureLockTimeout` (`scripts/lock-timeout.ts`) reads it back and refuses to migrate unless it
is `5s`. Neon silently drops `lock_timeout` as a startup parameter on **both** its pooled and direct
endpoints (observed 2026-10-03), so on a direct (non-`-pooler`) host the migrator falls back to a session
`SET lock_timeout = '5s'` on its single (`max: 1`) session, which the migration transaction inherits —
`lock_timeout: applied-after-set` is the normal line on Vercel (`applied` where the startup parameter is
honoured, e.g. local Postgres). On a pooled host it refuses instead (under PgBouncer a `SET` can stick to
a pooled backend that later serves app traffic). It logs
`migrate: using <DATABASE_URL|non-pooling|derived-direct> connection (<hostname>)` first — hostname only,
never the URL. `pickMigrationUrl` (`scripts/migration-url.ts`) only leaves `DATABASE_URL` when its host
contains `-pooler`, so a pulled Vercel var never overrides a local/test URL. For a `-pooler`
`DATABASE_URL` it **derives the direct host** by dropping `-pooler` (Neon's convention: same credentials,
database and params), so `POSTGRES_URL_NON_POOLING` is optional. A `POSTGRES_URL_NON_POOLING` naming the
same endpoint, database and user is used as-is; a mismatched or unparseable one is ignored with a warning
(naming the mismatched part) and the derived host is used instead. An unparseable `DATABASE_URL` still
throws, and `ensureLockTimeout` still refuses if the setting is not applied. A
migration that cannot get its lock within 5 s fails with SQLSTATE 55P03 and rolls back (drizzle applies
pending migrations in one transaction), so the Vercel build fails loudly instead of queueing reads behind it.
**Retry:** redeploy (or re-run `db:migrate`) once the blocking traffic has passed; there is no automatic
retry. A repeat failure means a long-held lock — find it in `pg_locks`/`pg_stat_activity` before retrying.

### Trap 1 — `db:migrate` silently targets **dev**

`scripts/migrate.ts:10` does `dotenv.config({ path: ".env.local" })`, and `.env.local` points
`DATABASE_URL` at the Neon **development** branch. dotenv does *not* override an already-set variable, so
the only way to target another database is to set it explicitly:

```bash
DATABASE_URL=<prod-url> npm run db:migrate
```

If `<prod-url>` is a `-pooler` host, the migrator migrates over the direct host derived from it (same
credentials and database). dotenv may fill `POSTGRES_URL_NON_POOLING` from `.env.local` (e.g. by
`vercel env pull` — the **dev** direct URL) when it is not set in the shell; that mismatch is **ignored
with a warning** (`POSTGRES_URL_NON_POOLING points at a different endpoint than DATABASE_URL — ignoring
it — using the direct host derived from DATABASE_URL instead`), never a silent database switch, and
`ensureLockTimeout` still refuses if `lock_timeout` is not applied. The `migrate: using …` line names the
host it took.

The symptom of forgetting is nasty, because the build never touches the DB: **the build passes, and every
page using the new column 500s at runtime with `column X does not exist`** (memory:
`prod-migration-requires-explicit-db-url`).

### Trap 2 — a committed migration auto-applies to prod **at build time**

`package.json` sets `"vercel-build": "npm run db:migrate && next build"`. Every Vercel deploy runs the
migrator against that environment's DB *before* building — production deploy → production DB. Migrations
are **not** a manual owner step (memory: `vercel-build-auto-migrates`).

The consequence: the migration runs while the **old** deployment is still serving, for the build window.
Additive migrations (ADD COLUMN/CONSTRAINT, SET NOT NULL on an already-populated column) are old-code-safe.
A **destructive** one is not — the repositories' drizzle `.select()` emits an explicit column list naming
every schema column, so a `DROP COLUMN` shipped in the same deploy as the code that stops using it will
500 the live old code. **Use a two-deploy expand/contract split:** deploy A ships the column-free *code*
(schema.ts / types / repos / UI) and keeps the DB columns; a later, separate deploy B ships the
`DROP COLUMN`.

### Trap 3 — the migrator never re-checks the hash

drizzle's migrator compares **only the journal's `when` timestamp** against the newest applied row. The
SHA-256 it writes into `drizzle.__drizzle_migrations` is **never read back.** So editing an
already-applied `.sql` — or re-baselining `drizzle/` — is invisible to every gate: CI builds the schema
from empty and goes green, and only the production deploy, which replays against a real DB, goes red.

That is why **`scripts/migration-hashes.test.ts`** exists: it pins the SHA-256 of every committed migration
in an `APPLIED` map (`scripts/migration-hashes.test.ts:21`) and asserts both that the files on disk match
that set and that each file's content is unchanged — moving the failure from deploy time to review time.
**If you deliberately re-baseline, update `APPLIED` in the same commit.** The point is that it cannot happen
silently.

---

## 3. `db:reset` — destructive, owner-only, on purpose

```bash
npm run db:reset -- --database-url <url>
```

`scripts/db-reset.ts` drops the schema and re-derives it by running the real migrator (it shells out to
`db:migrate` with an explicit `DATABASE_URL` rather than reimplementing it). Three behaviors look like
friction and are the design:

1. **It drops BOTH `public` AND `drizzle`** (`db-reset.ts:60`). The migrator's ledger is
   `drizzle.__drizzle_migrations`, not `public`. Dropping only `public` leaves those rows alive — the next
   `db:migrate` finds its newest journal entry already recorded, **applies nothing, and reports success
   against an empty database.** A green light on an empty DB is the worst available outcome, so both go.
2. **It refuses a non-TTY stdin** (`db-reset.ts:35`). An echo-back prompt is not a lock on its own:
   `echo "host/db" | npm run db:reset` satisfies it with zero interaction — exactly what CI, a Makefile, or
   **an agent** does the first time a prompt looks like it is hanging. Requiring a TTY subsumes a
   CI/VERCEL env check (no builder has one) *and* the agent case. **Neither an agent nor CI can run
   `db:reset`. The owner runs it, in a real terminal.**
3. **It refuses an ambient `DATABASE_URL`** (`db-reset.ts:26`) — the target must be typed on the command
   line and echoed back. Because `migrate.ts` lets a stray exported `DATABASE_URL` beat `.env.local`, an
   ambient var is survivable for a migration and catastrophic for a DROP.

**Do not add a `--force` flag.** The docblock says why (`db-reset.ts:11`): a flag is re-runnable from shell
history against the wrong database; typing the host is not. `--force` is the footgun, not the fix.

Two things to know when running it:

- **Read the host the script echoes back before typing it.** It is the only reliable discriminator between
  dev and prod (memory: `neon-db-setup`).
- **Reset with the same connection string the app uses** — copy it from Vercel, do not hand-assemble one.
  The re-created `public` schema is owned by whatever role *that* URL connects as and carries none of the
  original grants, so the app can hit `permission denied for schema public` at runtime after a green
  migrate (`db-reset.ts:56`).

---

## 4. Environments

Neon project `proud-surf-45496548`. **Two Neon branches = two genuinely separate databases**, not two views
of one (memory: `neon-db-setup`).

| Neon branch | Used by | Host |
|---|---|---|
| `development` | **local dev** *and* **all Vercel preview deploys** | `ep-old-meadow-aqnhjbxg-pooler.c-8.us-east-1.aws.neon.tech`, db `neondb` — the URL in `.env.local` |
| `main` (production) | Vercel **Production** | **deliberately not recorded anywhere — do not guess it** |

Vercel env scoping: **Production → Neon `main`; Preview → Neon `development`.** So a preview deploy and your
laptop share one database: a migration applied from either is visible to the other, and deploying a preview
of a branch that carries a migration applies it to the dev DB.

**The production hostname is deliberately absent from this doc, from memory, and from the repo.** Neon
endpoint hostnames change when a compute endpoint is recreated, so any recorded value rots into a
confidently-wrong one. Get it from the **Vercel dashboard** (Settings → Environment Variables →
`DATABASE_URL`, Production scope) or the Neon dashboard (branch `main`), or ask the owner. Note that
`vercel env pull --environment=production` is blocked by the safety classifier — correctly; it would
materialize live prod credentials to disk.

Neither branch is ever the e2e database: that is an ephemeral local container (§5).

---

## 5. Testing tiers

**Unit** (`npm run test:ci`) — no database. DB-gated files skip themselves, so this is safe anywhere.

**DB integration** — real Postgres, no mocks. Lives in `src/lib/db/*.integration.test.ts` (~60 files), each
gated by:

```ts
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
```

Run them with **`npm run test:db`** → `e2e/fixtures/run-db-tests.sh`, which **self-manages Docker**: it
starts the container via `test-db.sh up` if it is not already running, traps EXIT/INT/TERM, and tears it
down **only if it started it** (`run-db-tests.sh:14–28`) — so it never kills a container you were already
using. It holds the shared test-DB lock (`scripts/with-db-lock.ts`, ARCHITECTURE decision 11), so it waits
for a running e2e or screenshot run instead of truncating under it.

It runs **serially — `npx vitest run --no-file-parallelism src/lib/db`** (`run-db-tests.sh:34`). Not a
performance preference: vitest parallelizes *files*, every DB test file calls `resetDb()` →
`TRUNCATE ... CASCADE` (`e2e/fixtures/db.ts:60`), and two concurrent TRUNCATEs on the same Postgres
**deadlock** (memory: `db-test-parallel-deadlock`). The directory is passed whole, so a new DB test file is
auto-included.

In CI these run in a dedicated **`db-tests` job** against a `postgres:16` **service container** on `:5432`
(`.github/workflows/ci.yml:96`, env at `:122`), with the same `--no-file-parallelism` invocation
(`ci.yml:135`). `auth:verify` runs in this job too, because it queries the live auth tables and the DB-less
`gate` job cannot.

**E2E** — its own **ephemeral Postgres**, never Neon. `e2e/fixtures/test-db.sh` runs a disposable
`postgres:16` container named **`pi-e2e-db`** on a **fixed port `5433`** (5433 avoids clashing with a local
Postgres on 5432), bound to `127.0.0.1` only, and applies the schema with the real migrator
(`DATABASE_URL=… npm run db:migrate`, `test-db.sh:64`). Subcommands: `up`, `down`, `reset`. Connection
string: `postgresql://postgres:test@localhost:5433/app_test`. Playwright's `globalSetup`
(`e2e/global-setup.ts:8`) calls the script, so `npx playwright test` brings its own DB up. The e2e job in
`ci.yml` pins the same URL (`ci.yml:482`).

The e2e DB helper **fails closed**: `e2e/fixtures/db.ts` allowlists `localhost` / `127.0.0.1` / `::1` and
throws on any other host — an allowlist, not a denylist of known Neon hostnames, so a recreated Neon branch
with a fresh hostname is refused too. It is what stands between `resetDb()`'s TRUNCATE and a real database.

---

## 6. Backup / restore, and monitoring

**Backup and restore are Neon's** — there is no backup script in this repo, and no down-migrations. Use Neon
branch snapshots / point-in-time restore from the Neon dashboard (project `proud-surf-45496548`).

**Snapshot before a risky migration.** Per §2's trap 2, a migration reaches prod *automatically* at build
time, so the snapshot has to exist **before the merge**, not after the deploy goes red. Recovery from a bad
migration is Neon PITR on the affected branch — the repo has no down-migration to run, and the migrator
would not run one.

**Monitoring** is the Neon dashboard (slow queries, connection/pooling counts) plus Vercel runtime logs. Two
things the repo does itself:

- **`getDb()`** (`src/lib/db.ts:38`) returns one module-level `postgres-js` client carrying a server-side
  **`statement_timeout` of 25 s** (`db.ts:19`) — generous, but deliberately *under* Vercel's 30 s function
  cap. A pathological query (an O(N²) recompute, a missing index, a stuck lock) then aborts with SQLSTATE
  57014 — which `logDbError` classifies as `statement_timeout` and flags as a rolled-back write — instead of
  eating the whole budget and surfacing as an opaque function timeout. Normal recomputes are tens of ms.
- **Drizzle's query logger is OFF by default and must never be enabled in production** (`db.ts:22–27`): it
  logs every query's SQL *and its parameter values* (emails, tokens, PII), and Vercel caps runtime logs at
  256 lines per request. Opt in locally, per shell, with `DB_QUERY_LOG=1`.

**Pooled vs direct endpoint.** The app connects through Neon's **pooled** endpoint — the `-pooler` host in
`.env.local` (§4) — because serverless functions open many short-lived connections. Anything needing a
session-scoped feature the pooler does not support belongs on the direct (non-`-pooler`) host. `db:reset`
uses whatever URL you hand it; `db:migrate` does too, except that a `-pooler` `DATABASE_URL` migrates
over the direct host (a matching `POSTGRES_URL_NON_POOLING`, else the host derived by dropping `-pooler`;
a mismatched var is ignored with a warning). Neon drops `lock_timeout` as a startup parameter on both
endpoints (observed 2026-10-03); the migrator sets it per session on the direct one and refuses on a
pooled one (§2). Pass the same string the app uses unless you have a
specific reason not to — and see §3 on the grant trap if you hand-assemble one.
