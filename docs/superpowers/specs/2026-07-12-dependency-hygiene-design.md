# Dependency hygiene — design

**Bead:** `purses-mebk` (epic) → `purses-c3je` (drizzle) + unpin + types
**Date:** 2026-07-12
**Status:** design, pending review

## Purpose

One causal chain, not three chores. The exact `drizzle-orm` / `drizzle-kit` pins conflict
with `better-auth`'s peers, which forced `legacy-peer-deps=true` into `.npmrc` — and that
flag suppresses peer resolution for the **whole tree**. Unpinning while the flag is still on
is theater: you widen the ranges while the thing that ignores range conflicts stays on.

So: upgrade drizzle → drop the flag → unpin → the `@types/react` mismatch becomes visible.

Policy driving this (owner, 2026-07-11): do not pin without a reason; every surviving pin
carries a recorded justification. An audit found none of the nine pins had one — all entered
in a single scaffold commit (`7502432af`) whose message states no constraint.

## The governing fact

**All database data is disposable** (owner, 2026-07-12) — prod (Neon `main`) and
`development` alike. This is what makes the design below possible, and it is the single
assumption the whole plan rests on. If it stops being true, this design must be revisited.

### What that retires

The bead's headline danger was a **silent replay against live prod**. `vercel-build` runs
`db:migrate` on every deploy, and the migrator's already-applied test
(`drizzle-orm/pg-core/dialect.js:56`) is:

```js
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) {
```

It reads only the newest applied row and compares **timestamps**. The `hash` column is
written on insert and *never read back for comparison*. So the journal's `when` values are
the only thing preventing a re-baselined `drizzle/` from replaying the entire schema history.

With disposable data, the worst case downgrades from **data loss** to **a failed deploy**
(the replay aborts on `CREATE TABLE "user" already exists`). Recoverable, not catastrophic.

## Decisions

### 1. Squash `drizzle/` to a single baseline — do not carry the history

The fiddly part of this upgrade was never the version bump; it was translating **17 hand-carried
v5 snapshots to v7** via `drizzle-kit up`, then diff-proving all 17 `when` values survived
byte-identical. That dance exists *purely* to protect data we don't care about.

Instead: delete `drizzle/`, let the **new** drizzle-kit generate one clean `0000_init` natively
in v7. No translation, no legacy format, nothing to preserve. Seventeen fragile snapshots
become one file the current tool wrote itself, which is *by construction* consistent with
`schema.ts` — no drift possible.

Rejected: `drizzle-kit up` in place. More work, and the translation step is the one most likely
to go subtly wrong.

### 2. The proof already exists — do not build a verification harness

`e2e/fixtures/test-db.sh:64` builds the test schema by running `npm run db:migrate` — the
**real migrator, against `drizzle/`, from an empty database**, on every run.

So the DB-integration suite and the E2E suite each construct their schema from scratch out of
the squashed baseline. A green `test:db` + `test:e2e` **is** the end-to-end proof that the new
baseline builds a working schema the app runs against. No bespoke rehearsal, no prod restore.

### 3. The reset is declarative and committed — not a hand-run operation

Per owner directive (2026-07-12): configuration needed in dev belongs in **declarative form**.

A reset is not "drop things and hope"; it is **re-derive the database from the declared
schema** — the same path `test-db.sh` already takes from empty, pointed at a long-lived DB.

`npm run db:reset` (`scripts/db-reset.ts`): drop the public schema, re-run `db:migrate`.
One operation for dev, preview, and prod. It **fails closed**, following the precedent already
set by `scripts/seed-load-core.ts` `resolveLocalUrl()` (refuses any non-localhost host) and
`scripts/blob-orphans.ts` `deleteRefusal()` (aborts when the deletion looks too big):

- Refuses unless the target is explicitly acknowledged.
- Refuses the **production** host unless separately and explicitly authorized — pointing it at
  prod must require proving intent, not merely remembering to be careful.

The guard is the point. A destructive script whose safety depends on the operator being careful
is not safe.

### 4. Widen the `Database` type — 1 file, not 16

The bead predicted 0.45's tightened transaction generics would ripple through
`src/lib/transactions.ts` + 16 repositories via a new `DbOrTx` union ("budget a day, not an hour").

That is **false**. `PgTransaction extends PgDatabase` — a transaction *is-a* database in drizzle's
own hierarchy. `src/lib/db.ts:28` currently declares `export type Database = typeof db`, a
*concrete* `PostgresJsDatabase`, which is why `withTransaction`'s `async (tx: Database)` breaks.

Widening that one alias to the shared base class — `PgDatabase<PostgresJsQueryResultHKT, typeof schema>`
— satisfies both the root db and a `tx`, and all 41 consumers keep compiling untouched. Nothing
in the codebase reads `$client` or any root-only member, which is *why* the base class suffices.

### 5. Journal guard — a checked-in invariant

Once squashed, the underlying footgun still exists for the future: `drizzle/` is a file tree with
no integrity check, and the migrator compares only timestamps. Today that is harmless because the
data is worthless. The moment there is a real user, a casual `drizzle-kit generate` re-baseline
silently arms the same replay.

A test pins the journal's `(tag, when)` pairs, so a future re-baseline turns **CI red** instead of
failing a prod deploy. Cheap, permanent, and declarative — the invariant lives in the repo rather
than in a bead nobody reads.

## Scope

### PR 1 — the drizzle upgrade (causally inseparable; `npm ci` breaks if split)

1. `drizzle-orm 0.30.10 → ^0.45`, `drizzle-kit 0.20.17 → ^0.31`
2. Squash `drizzle/` to a single generated `0000_init`
3. Drop `legacy-peer-deps=true` from `.npmrc`
4. `scripts/db-reset.ts` + `npm run db:reset` (declarative, fail-closed)
5. Journal guard test

Confirmed breaks:

| Break | Fix |
|---|---|
| `drizzle.config.ts` — `driver: "pg"` removed | `dialect: "postgresql"`; `dbCredentials.connectionString` → `.url` |
| `db:generate` — `generate:pg` family removed in 0.21 | config-driven `drizzle-kit generate` |
| `withTransaction` passes `tx` as a concrete `Database` | widen the alias to `PgDatabase<…>` (decision 4) |
| `drizzle-kit` sits in `dependencies` | move to `devDependencies` — it is a codegen CLI; the runtime migrator imports from `drizzle-orm`, never the kit |

### PR 2 — hygiene, once peer resolution is honest again

Unpin the seven; `@types/react` / `@types/react-dom` `^19` → `^18` to match the React 18.3.1
runtime. Grouped because neither can be *meaningfully verified* until PR 1 removes the resolver
override.

Per the recorded audit, unpinning is near-inert: `^18.3.1` resolves bit-identically, `^14.2.35`
cannot reach Next 15, `^3.4.1` cannot reach the Tailwind 4 rewrite. Only `zod` moves
(3.23.8 → 3.25.76), and `^` still cannot pull zod 4.

## Sequencing and the one residual risk

The risk is no longer data — it is a **deploy-ordering window**. Migrations run at *build* time
while the previous deployment stays live, so a reset prod serves 500s until the new build
finishes (~2–3 min). Acceptable for a pre-launch app with disposable data; stated plainly rather
than sprung.

1. Land PR 1's code; gates green (`test:db` + e2e prove the baseline from scratch).
2. Reset `development` first; confirm a preview deploy comes up clean. This **rehearses the exact
   prod operation against a throwaway target** — prod is never the first time we run it.
3. Reset prod; merge deploy rebuilds it.

## Success criteria

- `.npmrc` has no `legacy-peer-deps`; a clean `rm -rf node_modules && npm ci` succeeds.
- `drizzle/` is one migration, generated by the new kit, in v7.
- `npm run db:reset` exists, is committed, and refuses prod without explicit authorization.
- Gates green: `lint`, `test:ci`, `build`, `auth:verify`, `test:db`, e2e.
- No exact pin survives without a recorded justification.
