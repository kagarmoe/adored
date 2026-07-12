# Dependency hygiene — design

**Bead:** `purses-mebk` (epic) → `purses-c3je` (drizzle) + unpin + types
**Date:** 2026-07-12
**Status:** design — revised after adversarial review (3 lenses: data, architect+security, craftsman+QA)

## Purpose

One causal chain, not three chores. The exact `drizzle-orm` / `drizzle-kit` pins conflict
with `better-auth`'s peers, which forced `legacy-peer-deps=true` into `.npmrc` — and that
flag suppresses peer resolution for the **whole tree**.

Policy driving this (owner, 2026-07-11): do not pin without a reason; every surviving pin
carries a recorded justification. An audit found none of the nine had one — all entered in a
single scaffold commit (`7502432af`) whose message states no constraint.

## The governing fact

**All database data is disposable** (owner, 2026-07-12) — prod (Neon `main`) and `development`
alike. This is the single assumption the plan rests on. If it stops being true, revisit.

It downgrades the worst case from **data loss** to **a failed deploy**. The migrator's
already-applied test (`drizzle-orm/pg-core/dialect.js:56`) compares only timestamps —
`Number(lastDbMigration.created_at) < migration.folderMillis` — reading the newest applied row.
The `hash` column is written on insert and **never read back**.

## What adversarial review changed

The first draft had two blocking defects (each found independently by two reviewers) and one
critical one. They are corrected below. Recording them so the reasoning isn't re-derived:

1. **`schema.ts` is a LOSSY representation of the applied schema.** The first draft claimed a
   regenerated baseline is "by construction consistent with `schema.ts` — no drift possible."
   True, and substantively wrong: consistency with `schema.ts` was never the invariant that
   matters. Consistency with the **applied database** is. Anything in the migration history
   that `schema.ts` cannot express is invisible to `drizzle-kit generate` and is silently
   discarded by a squash. → Decisions 1a, 2.
2. **Drizzle's ledger is not in `public`.** → Decision 3.
3. **A destructive script must never read an ambient `DATABASE_URL`.** → Decision 3.

## Decisions

### 1. Squash `drizzle/` to a single baseline

Delete `drizzle/`; let the **new** drizzle-kit generate one `0000_init` natively in v7. No
v5→v7 translation of 17 snapshots, no `when` values to preserve byte-identically. That dance
existed purely to protect data we don't care about.

Rejected: `drizzle-kit up` in place — more work, and the translation is the step most likely to
go subtly wrong.

### 1a. Port the orphaned CHECK constraint FIRST — before generating anything

`drizzle/0006_authz_role_check.sql:7` adds:

```sql
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner','curator'));
```

`schema.ts:430` declares **no check** — and could not: drizzle-orm 0.30 has no `check()` API.
A baseline regenerated from `schema.ts` therefore ships `memberships.role` as **free text**,
silently deleting an authz-adjacent integrity guard from every DB built from it.

drizzle-orm ≥0.36 has `check()`. **Port it into `schema.ts` before regenerating.** This is the
one object in the entire history with no declarative home — everything else (partial indexes,
ADD COLUMNs) is either in `schema.ts` already or irrelevant on an empty DB (data-migration
UPDATEs/DELETEs).

`src/lib/db/role-constraint.integration.test.ts` asserts the 23514 rejection and runs in CI
from an empty DB, so omitting this turns **CI red, not prod silent**. That test failing is the
**correct signal, not a flake to route around.**

### 2. Prove the baseline with a schema diff — the test suite is a necessary but INCOMPLETE oracle

`e2e/fixtures/test-db.sh:64`, `ci.yml:99` (db-tests) and `ci.yml:510` (bench) all build their
schema with the **real migrator from an empty DB**. That is genuine from-zero exercise of the
baseline, and PR 1 trips both the `code` and `ui` path filters, so both gates fire.

But it proves "the app runs against whatever the baseline creates" — **not** "the baseline equals
the schema we have today." The missing CHECK is caught only because someone happened to write a
test for it; a lost `sessions_active_unique` predicate would **not** be caught. The suite is an
accidental oracle.

**The gap is already closed by enumeration, not by a gate.** Review read all 17 `.sql` files and
found exactly ONE object that exists in migration SQL but not in `schema.ts`: `memberships_role_check`
(decision 1a). Everything else is either declared in `schema.ts` already — including all three
partial-index predicates (`schema.ts:205,232,296`, each with its `.where()`) — or is a data-migration
`UPDATE`/`DELETE` that is meaningless on an empty DB.

So: **no `pg_dump` diff gate.** Run the diff ONCE locally while implementing, as a sanity check that
the enumeration was right. Do not build it into CI. (Cut on owner's instruction, 2026-07-12: we ship
ONE migration and the final schema is `schema.ts`; a permanent gate re-proving a known fact is
ceremony.)

### 3. `db:reset` — declarative, fail-closed, and it drops BOTH schemas

Per owner directive (2026-07-12): configuration needed in dev belongs in **declarative form**.
A reset is not "drop things and hope"; it is **re-derive the database from the declared schema**.

`scripts/db-reset.ts` + `npm run db:reset`. Thin (~40 lines incl. guard); no arg-parsing framework.

**It drops `drizzle` too.** The ledger lives at `drizzle.__drizzle_migrations`
(`dialect.js:40` defaults `migrationsSchema` to `"drizzle"`; `scripts/migrate.ts` never overrides
it). `DROP SCHEMA public CASCADE` alone leaves the 17 rows **alive**, and then:

- 1st reset happens to work — the new baseline's `when` is newer than the last old entry. *Luck of the clock.*
- 2nd reset onward: `created_at == folderMillis`, so `<` is **false** → migrator applies **nothing**,
  prints `✅ Migrations completed successfully`, exits 0 — **an empty database with a green light.**

A reset script that empties the DB and reports success is worse than no script.
→ `DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`

**It runs `db:migrate`** — which, after decision 3a, is the whole of `vercel-build`'s DB half.

**Guard — fail closed. `dotenv` does NOT override an already-set env var**, so a stray exported
`DATABASE_URL` silently wins over `.env.local`. With a destructive payload that cuts both ways:
reset "dev" and drop **prod**; or drop **dev**, believe prod is done, merge, serve 500s.

Neither existing precedent covers this: `seed-load-core.ts resolveLocalUrl()` whitelists localhost
(we must hit remote DBs); `blob-orphans.ts deleteRefusal()` counts results (a schema drop has
nothing to count). So:

- **Never read a bare `DATABASE_URL`.** Require an explicit `--database-url`. An ambient var is a
  **hard refusal** — that is the line between "reset dev" and "dropped prod".
- **Echo-back confirmation.** Print the resolved `host/database`; require it typed back exactly. A
  `--force` flag is re-runnable from shell history against the wrong target; an echoed host is not.

That is the whole guard. (Trimmed on owner's instruction, 2026-07-12: an `ALLOW_PROD_RESET` var and
a `CI`/`VERCEL` refusal were belt-and-braces on top of a script that already cannot fire without a
URL typed on the command line and a host typed back.)

Note: `db-reset.ts` must **not** call `migrate(getDb(), …)` — `getDb()` returns the widened base
type (decision 4), which won't typecheck against `migrate()`. Shell out to `npm run db:migrate` or
construct a local `drizzle()`.

### 3a. DELETE `backfill-numbers` — don't test dead code, remove it (owner, 2026-07-12)

Adversarial review flagged `db:backfill-numbers` as the one deploy step **no gate exercises**:
`scripts/backfill-session-result-numbers.ts` is the only caller of `drizzle(client)` with no schema
arg, and it does `backfillNumbers(db as any)` — that `as any` compiles straight through the
0.30→0.45 API change. We would discover a break on the prod deploy, *right after dropping prod's
schema*. The reviewer's fix was to make `db:reset` run it, so it finally gets exercised.

**The owner's fix is better: delete it.** `backfillTable` only touches rows `WHERE number IS NULL`
(`backfill-numbers.ts:19`), but `SessionRepository` and `SortResultRepository` assign `number` at
INSERT via `allocateWithRetry` (MAX+1, retry on the unique violation). So on any DB built from now
on, **a NULL `number` cannot exist**. It is a one-shot legacy data migration that healed rows
created *before* the numbering feature — and it has been a no-op on every prod deploy since.

Wipe the data and it is dead code, permanently. Remove:

- the `db:backfill-numbers` step from `vercel-build` (→ `vercel-build` = `db:migrate && next build`)
- the `db:backfill-numbers` npm script
- `scripts/backfill-session-result-numbers.ts`
- `src/lib/db/backfill-numbers.ts` + `backfill-numbers.integration.test.ts`

This **dissolves the finding rather than testing around it** — the untested deploy step, and its
`as any`, stop existing. The only honest fix for an untested deploy step is for it not to be there.

### 4. Widen the `Database` type — 1 file

The bead predicted 0.45's generics would ripple through `transactions.ts` + 16 repositories via a
`DbOrTx` union ("budget a day"). **False.** Verified against the drizzle-orm 0.45.2 tarball:
`PgDatabase` is public API (`pg-core/index.d.ts:4`); `PostgresJsDatabase extends PgDatabase`
(`postgres-js/driver.d.ts:6`); `PgTransaction extends PgDatabase` (`pg-core/session.d.ts:49`);
the `TSchema` defaults line up.

`src/lib/db.ts:28` declares `export type Database = typeof db` — a *concrete* `PostgresJsDatabase`
— which is why `withTransaction`'s `async (tx: Database)` breaks. Widen that one alias to
`PgDatabase<PostgresJsQueryResultHKT, typeof schema>`; all ~41 consumers keep compiling.

**Precise reason (the first draft got this wrong):** it works because of the **class hierarchy plus
matching generic defaults**. "Nothing reads `$client`" is why there is no *fallout* — a different
claim. Stated sloppily, a future reader "simplifies" the alias and breaks it.

`PgDatabase` carries a `protected authToken`, so object-literal mocks typed as `Database` are
impossible. Today's mocks all use `as unknown as Database` and survive; `satisfies Database` will
not work. One comment to that effect.

### 5. Journal guard — CUT (YAGNI)

A re-baseline is invisible to every existing gate (a regenerated `drizzle/` still builds a perfect
schema from empty, so CI goes green and only the prod deploy goes red). A content-hash pin would
catch it.

**Cut anyway** (owner, 2026-07-12). It guards a scenario that only bites once there is data worth
keeping. Today the data is disposable and the app is pre-launch, so the worst case is a failed
deploy. Add it when there is a real user — and note the reason here so the next person doesn't have
to re-derive it.


## Scope

### PR 1 — the drizzle upgrade (inseparable; `npm ci` breaks if split)

1. Port `memberships_role_check` into `schema.ts` via `check()` — **before** regenerating (1a)
2. `drizzle-orm 0.30.10 → ^0.45`; `drizzle-kit 0.20.17 → ^0.31`, moved to **devDependencies**
   (it is a codegen CLI; the runtime migrator imports from `drizzle-orm`, never the kit)
3. Squash `drizzle/` to one generated `0000_init`; **`pg_dump --schema-only` diff as the gate** (2)
4. Drop `legacy-peer-deps=true` from `.npmrc`
5. `scripts/db-reset.ts` + `npm run db:reset` (3)
6. **Delete `backfill-numbers`** — script, module, test, npm script, and its `vercel-build` step (3a)

| Confirmed break | Fix |
|---|---|
| `drizzle.config.ts` — `driver: "pg"` removed | `dialect: "postgresql"`; `dbCredentials.connectionString` → `.url` |
| `db:generate` — the `generate:pg` family removed in 0.21 | config-driven `drizzle-kit generate` |
| `withTransaction` passes `tx` as a concrete `Database` | widen the alias (4) |
| `memberships_role_check` has no declarative home | `check()` in `schema.ts` (1a) |

**Auth-stack resolution change — must be stated, not buried.** Dropping the flag re-hoists the
better-auth subtree: `better-call` moves from root to nested, and the zod it resolves goes from
root **`zod@3.23.8`** to sibling **`zod@4.4.3`**. `better-call` declares
`peerDependencies: { zod: "^4.0.0" }` — the flag has been making it run against a major it declares
incompatible. Scope-checked: `better-call` imports zod only in its OpenAPI module, so the
request-validation hot path is not zod-driven and this is **not** a direct authz weakening. Also
newly nested: 8 `@better-auth/*` packages + `jose`. New at root from drizzle-kit 0.31: `preact`,
`object-hash`, `@drizzle-team/brocli`; esbuild `0.19 → 0.25` across ~26 platform packages.

→ PR 1's gates therefore include an **un-mocked auth exercise** (`auth:verify` + an e2e sign-in),
not just a typecheck. → The **lockfile diff gets reviewed**, deliberately. "Just the npm fix" is
how a supply-chain change sneaks through.

### PR 2 — hygiene

Unpin the seven; `@types/react` / `@types/react-dom` `^19` → `^18` (they sit a major ahead of the
React 18.3.1 runtime — the actual React inconsistency in this repo).

**Rationale corrected:** PR 2 has **no hidden dependency** on PR 1 beyond ordering — a flag-off
resolve with all seven pins still in place resolves cleanly. The real reason to sequence is simply
that PR 1 regenerates the lock anyway. (The first draft claimed unpinning "cannot be meaningfully
verified" until the flag is gone. Not true. Fixed.)

Per the audit, unpinning is near-inert: `^18.3.1` resolves bit-identically; `^14.2.35` cannot reach
Next 15; `^3.4.1` cannot reach the Tailwind 4 rewrite. Only **zod** moves (3.23.8 → 3.25.76), and
`^` still cannot reach zod 4. 3.25.x is additive (ships `zod/v4` as a subpath; the classic v3
surface is unchanged); our zod use is confined to four `src/server/api/*.ts` files and three route
handlers, none crossing better-auth's zod-4 copy. **No boundary weakening.**

## Sequencing

The residual risk is not data — it is that **`npm install` runs before `vercel-build`**. The fatal
case is prod reset → merge → **ERESOLVE at install** → migrate never runs → prod has no schema, and
the recovery tool is the very script whose guard we just (correctly) made hard to fire.

So: **prove the install on a preview before prod is ever touched.**

1. Gates green locally.
2. **Reset `development`** with the new script (drop + migrate).
   ⚠️ Must happen **before pushing the branch** — otherwise the first preview build runs the new
   baseline against an un-reset dev DB and dies on `relation "user" already exists`.
   ⚠️ **Land this with no other branches open.** Preview deploys migrate the *shared* `development`
   DB; once it is reset, any other open branch (old 17-entry journal) sees the newer baseline row,
   **no-ops its migrate**, and boots against a schema it never applied — failing at *runtime*, not
   migrate time. We currently have no other branches open.
3. Push. The preview build **proves Vercel's `npm ci` resolves without the flag** (the install runs
   before `vercel-build`) and that migrate no-ops cleanly. This is the full rehearsal against a
   throwaway target — prod is never the first time we run it.
4. CI green (incl. `auth:verify` + e2e sign-in).
5. **Reset prod** (drop + migrate in one command — seconds, not a build cycle).
6. Merge. The deploy's `db:migrate` finds the `0000` row present → no-op → build succeeds.

Prod serves 500s between (5) and (6) completing. With disposable data on a pre-launch app that is
acceptable — stated plainly rather than sprung.

## Success criteria

- `.npmrc` has no `legacy-peer-deps`; `rm -rf node_modules && npm ci` succeeds clean.
- `drizzle/` is one v7 migration, generated by the new kit.
- `memberships_role_check` survives (`role-constraint.integration.test.ts` proves it in CI).
- `npm run db:reset` is committed, drops **both** schemas, runs migrate, refuses an ambient
  `DATABASE_URL`, refuses prod without explicit authorization, and refuses to run in CI.
- `backfill-numbers` is gone — script, module, test, npm script, and its `vercel-build` step.
  `vercel-build` = `db:migrate && next build`.
- Gates green: `lint`, `test:ci`, `build`, `auth:verify`, `test:db`, e2e.
- No exact pin survives without a recorded justification.
