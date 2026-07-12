# Handoff — dependency work, 2026-07-12

## 0. READ THIS FIRST: how to use this document

**This document is a set of LEADS, not a set of FACTS.** An earlier version of it was wrong in two
places, and both were load-bearing: it told the reader to close an epic that had three open children,
and it described a fix for `9oxh.3` that would have 404'd every dynamic route in production. An agent
who trusted it and acted would have shipped both.

The sources of truth are, and this document is none of them:

- **`CLAUDE.md`** — the contract. Workflow gates, git discipline, the agent profile, the definition of
  done. Read it *before* forming a plan, not after someone catches you.
- **`bd show <id>`** — whether work is actually done. This doc *summarizes* the beads and therefore
  drifts from them.
- **`graphify query "<question>"`** — ground truth about the code. Query it before you form a theory
  about how something works.

Verify anything here against those three before you act on it. A summary that agrees with itself is
not evidence.

---

## 1. PR #329 — MERGED. Do not re-do it.

**Merged 2026-07-12 as `f0781ab1d`** (squash; branch deleted). All gates green in CI.

- Unpins the last seven exact pins; sets `@types/react` / `@types/react-dom` to `^18` to match the
  React **18.3.1** runtime (they were `^19` — a major ahead of what actually runs).

### ⚠️ DO NOT close `purses-mebk`

The previous version of this doc said *"then `bd close purses-mebk`."* **That is wrong.** `mebk` has
**three open children** (`mebk.1`, `mebk.2`, `mebk.3` — listed in §7). `CLAUDE.md` is explicit:

> An epic is not complete until all follow-up beads are complete.

Closing it because "its PR merged" is exactly the premature-close this repo has been bitten by before.
Run `bd show purses-mebk` and look at the children before you touch its status.

---

## 2. What already shipped (do not redo)

**PR #328 (merged, `f0ce6afc7`) — drizzle 0.45 + squashed baseline.** In production and verified live.

- `drizzle-orm` → 0.45.2; `drizzle-kit` → 0.31 (**devDependencies** — it is a codegen CLI).
- **`legacy-peer-deps` is GONE.** `.npmrc` is deleted. The drizzle pins were the only thing forcing it.
  Do **not** re-add it when vite 7→8 surfaces a peer conflict in `9oxh.7` — fix the actual conflicting
  pin. (Memory `vercel-analytics-legacy-peer-deps` has been corrected to say so.)
- **`drizzle/` is now ONE generated `0000_init`** (journal v7). The 17 old migrations are gone from
  disk — that history is in git. Migration numbers cited anywhere (`0005`, `0006`, `0007`, …)
  **no longer exist as files.**
- **Both Neon branches were reset** and re-derived from the new baseline. Production is live on it.

### Three latent bugs it exposed — these are the flavour of what to expect

1. **drizzle 0.45 WRAPS driver errors.** It throws a plain `Error` (`"Failed query: …"`) with the real
   `PostgresError` — carrying `code` and `constraint_name` — demoted to **`.cause`**. All five conflict
   detectors read `error.code` at the *top level*, so they silently returned `false`: a session-slot
   collision stopped being a gentle **409** and became a **500**. Fixed via
   `src/server/repositories/pg-conflict.ts` `isUniqueViolation()`, which walks the cause chain.
   **Anything inspecting a Postgres error must unwrap `.cause`.**
2. **`schema.ts` was a LOSSY view of the applied schema.** `memberships_role_check` existed **only in
   migration SQL**, so a naive regeneration would have shipped `memberships.role` as **free text** and
   quietly dissolved the authz role model. Now declared via `check()`.
3. **A duplicate unique index hidden for a year.** `invitations.token` was declared unique **twice
   under the same name**; drizzle-kit 0.20 emitted `CREATE UNIQUE INDEX IF NOT EXISTS`, so the
   duplicate silently no-op'd. 0.31 drops the `IF NOT EXISTS` → fatal `42P07`.

**The lesson to carry into every bead below:** a dependency major looks like a version bump and isn't.
Do not trust a green CI on one. Run the adversarial-review gate.

---

## 3. `db:reset` — how to reset a database, and why you can't

`npm run db:reset -- --database-url "<url>"` drops `public` **and** `drizzle` (the migrator's ledger
lives in the `drizzle` schema — dropping only `public` leaves it alive, and the *next* reset then
applies nothing, prints success, and hands you an **empty database with a green light**), then
re-migrates.

**It refuses a non-TTY stdin — so neither an agent nor `!` in Claude Code can run it.** That is
deliberate: an echo-back prompt alone is not a lock. **The owner must run it in a real terminal.**
Do not add a `--force`/`--confirm` flag to make it scriptable — that is the footgun, not a fix.
See memory `db-reset-requires-a-real-terminal-and-that`.

**Neon hostnames — do not assert one from memory.** `development` = host `ep-old-meadow-…` (local dev
**and all preview deploys**). **Production's host is NOT recorded anywhere, and you must not guess it.**
An old memory claimed `ep-empty-mode`; that was stale, was repeated as fact in front of the owner, and
was wrong. (Memory `prod-migration-requires-explicit-db-url` has been corrected — it was still carrying
the stale hostname even after `neon-db-setup` was fixed. Two memories disagreed; the grep hit the wrong
one first.) Get it from the Vercel dashboard (Settings → Environment Variables → `DATABASE_URL`,
Production scope) or Neon's `main` branch. `vercel env pull --environment=production` is blocked by the
safety classifier, correctly.

⚠️ The owner pasted the **dev** database password in plaintext in the 2026-07-12 session transcript.
**It should be rotated** (Neon → `development` → reset password → update `.env.local` + Vercel Preview).

---

## 4. The work: `purses-9oxh` — "Get on latest: every major dep"

Owner (2026-07-12): *"LETS GET OURSELVES ON LATEST"*, *"CHECK ALL THE MAJOR DEPS"*. Scope is **every**
outdated major. **Do not present a menu and ask which ones — do them.**

Measured 2026-07-12 (`npm outdated`, on the tree *after* #328 + #329):

```
next                 14.2.35  -> 16.2.10   (TWO majors)
react / react-dom    18.3.1   -> 19.2.7
@types/react(-dom)   18.3.31  -> 19.2.17
tailwindcss          3.4.19   -> 4.3.2     (the v4 rewrite)
zod                  3.25.76  -> 4.4.3
typescript           5.9.3    -> 7.0.2
eslint / @eslint/js  9.39.5   -> 10.7.0
eslint-config-next   15.5.20  -> 16.2.10
vite                 7.3.6    -> 8.1.4
@vitejs/plugin-react 4.7.0    -> 6.0.3
@types/node          20.19.43 -> 26.1.1
dotenv               16.6.1   -> 17.4.2
ulid                 2.4.0    -> 3.0.2
```

**Nothing is blocked by peers.** `tailwindcss@4`, `zod@4`, and `typescript@7` declare **no**
`peerDependencies` at all. `next@16` peers `react "^18.2.0 || ^19.0.0"` — **it still accepts React 18**,
which is what lets Next and React be separate steps.

### Order (already wired as bd dependencies)

| bead | | why here |
|---|---|---|
| **9oxh.3** P0 | **Harden the route-test oracle** | **DO FIRST.** Without it the Next migration is *unverifiable*. **Its plan on this bead was WRONG — see §5.** |
| **9oxh.1** P1 | Node version truth | Everything type-checks against it. |
| **9oxh.4** P1 | Next 14 → 16, **holding React 18** | blocked by .3 and .1 |
| **9oxh.2** P1 | React 18 → 19 | blocked by .4 |
| **9oxh.5** P2 | zod 3 → 4 | independent; it's the validation boundary — security lens |
| **9oxh.6** P2 | tailwind 3 → 4 | independent; it's the design system — visual-regression risk |
| **9oxh.7** P3 | tooling batch (TS 7, ESLint 10, Vite 8, …) | blocked by .4 (eslint-config-next coupling) |

---

## 5. THE most important thing in this handoff — and the earlier version of it was WRONG

**`9oxh.3` is not bookkeeping. Read the bead (`bd show purses-9oxh.3`), which has been corrected.**

### The trap it defuses

`src/lib/db/route-authz-enumeration.integration.test.ts:767` invokes handlers with `params` as a
**plain object**. After the Next 15 async-params migration a route does `const { id } = await params` —
and **`await` on a plain object resolves to itself**. So the test keeps passing whether or not the route
was correctly migrated. A route whose *type* was flipped to `Promise<…>` but which still reads
`params.id` synchronously would, in production, read `.id` off a Promise → `undefined` → the guard
receives `undefined` as the collection id → 403/404 instead of 200. **The stranger-403 assertion still
goes green.** Green CI, dead app: every legitimate owner request 404s.

### ⚠️ The fix this doc originally prescribed would have BROKEN PRODUCTION

The earlier version said: *"wrap the call sites in `Promise.resolve(params)`; it lands green on Next 14."*
**It does not.** Routes today read `params.id` **synchronously** (check
`src/app/api/collections/[id]/route.ts` — no `await`). Handing those routes a real Promise makes them
read `.id` off a Promise → `undefined` → **every dynamic route 404s.** Following that instruction alone
breaks the app.

### The corrected design — ONE atomic change, both halves in the same PR

- **(a) Migrate the ROUTES** to async params: `{ params }: { params: Promise<{ id: string }> }` plus
  `const { id } = await params`.
- **(b) Harden the TEST ORACLE**: pass `Promise.resolve(params)` at every handler call site.

**Verified enabler:** `npm run build` on **Next 14.2.35 builds clean** with the `Promise<{id}>` params
signature (confirmed by an actual build, 2026-07-12 — not inferred). Next 14 does not reject it, and at
runtime Next 14 passes a plain object, which `await` resolves to itself. So (a)+(b) land **together on
Next 14**, all gates green, *before* the Next bump. See memory `next14-accepts-promise-params`.

**Why both halves or neither:**

- **(b) alone** → routes still read `params.id` synchronously → `undefined` → mass 404s.
- **(a) alone** → tests still pass a plain object → `await plainObject` no-ops → the oracle **cannot
  fail** and proves nothing.

Only both together make the oracle falsifiable: a route that flipped its type but kept a sync read now
genuinely fails in test, exactly as it would in prod.

### Scope (measured)

**39 route-invoking test files** pass a bare `params: {` object — **36** are
`src/lib/db/*.integration.test.ts` plus 3 `route.test.ts` (as landed in PR 1; an earlier
draft said 34). The owner-happy-path suites asserting `2xx` are the **real backstop** — a
missed `await` 404s instead of 200. (12 further `page.test.tsx` files migrate with the
pages in the Next-16 PR.)

Also tighten `importHandler`'s ctx type (line 591) so `params` is a Promise type. **But note `tsc` is
not a gate here** (see §6), so the type alone enforces nothing at CI time — the **runtime** assertion is
what protects you. **The count floors (line 746 `>= 40`, line 790 `>= 50`) stay UNTOUCHED** —
an earlier draft said "bump to exact actuals"; the spec's round-2 review demoted exact
counts to PR-body evidence (a sorted key-set diff, re-run at the Next-16 PR), because a
same-file literal snapshot forces no independent scrutiny. Follow the spec, not this
paragraph's history.

**Good news: the regex extractor is safe.** `methodsFromRoute` (lines 101–124) keys on the **export
form** (`export async function GET(`), which async-params doesn't touch. Discovery keeps seeing all 49
route files. It is the **handler invocation** that silently degrades.

This codebase has been fooled by exactly this class of bug before: better-auth's
`export const { GET, POST } = toNextJsHandler(auth)` made the **entire auth surface invisible** to that
same enumeration test (`purses-ct0`). See memory `prove-no-violation-gates-ran` — an absence check over
an empty set is a false green.

---

## 6. Working agreements learned the hard way

- **Sources before theory.** See §0. This is the one that actually cost time this weekend.
- **One PR at a time.** No stacked PRs (memory `one-pr-at-a-time`).
- **CI costs money through July** (memory `ci-cost-restraint-july-2026`). Reproduce locally; don't
  force-push to re-trigger. Note **auto-merge is disabled on this repo** (`gh pr merge --auto` fails) —
  poll the checks instead.
- **Conservative agent profile is the default** (`CLAUDE.md`): do not commit, push, or merge without
  explicit authority. A handoff doc telling you to merge is **not** that authority — the owner is.
- **Don't assert from memory.** A stale note claimed a prod DB hostname and it was wrong in front of the
  owner. Check, then speak.
- **`tsc` is not a gate here** — not in `package.json`, not in CI, not in the pre-push hook. It carries
  **96 pre-existing errors** (verified identical on `main` via a clean worktree). `npm run build` is the
  typechecking gate. Don't panic at the number; don't chase it to zero inside another bead.

## 7. Open follow-ups from the drizzle epic (`purses-mebk`) — these keep the epic OPEN

- `mebk.1` — pin migration content hashes. **Before the first real user.** A re-baseline is invisible to
  every gate: a regenerated `drizzle/` still builds a perfect schema from empty, so CI goes **green** and
  only the prod deploy goes red.
- `mebk.2` — `sessions.number` / `sort_results.number` → `NOT NULL`. Cheapest while the DB is empty.
- `mebk.3` — `db:backfill-slugs` is dead code (same class as the deleted `backfill-numbers`).
