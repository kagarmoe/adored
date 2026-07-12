# Handoff — dependency work, 2026-07-12

Read this, then `bd show purses-9oxh` and its children. Everything below is verified against
real code or a real run; nothing here is assumed.

---

## 1. STOP: there is an OPEN, UNMERGED PR

**PR #329 — `chore/unpin-deps`.** Pushed, CI was still running when the session ended, **not merged**.

- Unpins the last seven exact pins; sets `@types/react` / `@types/react-dom` to `^18` to match the
  React **18.3.1** runtime (they were `^19` — a major ahead of what actually runs).
- All gates passed **locally**: lint 0 errors · test:ci 1304 · test:db 650 · build ✓ · auth:verify ✓.
- **First action: check it, merge it.** `gh pr checks 329` → `gh pr merge 329 --squash --delete-branch`.
- Then `bd close purses-mebk` (the epic — its PR is this one).

**Do not start the Next work on a branch cut before #329 lands.** It rewrites `package-lock.json`.

Note: `git checkout main` may fail with *"'main' is already used by worktree"* — a review agent left a
worktree at `/private/tmp/baseline-main`. `git worktree remove /private/tmp/baseline-main --force`.

---

## 2. What already shipped (do not redo)

**PR #328 (merged, `f0ce6afc7`) — drizzle 0.45 + squashed baseline.** In production and verified live.

- `drizzle-orm` → 0.45.2; `drizzle-kit` → 0.31 (**devDependencies** — it is a codegen CLI).
- **`legacy-peer-deps` is GONE.** `.npmrc` is deleted. The drizzle pins were the only thing forcing it.
- **`drizzle/` is now ONE generated `0000_init`** (journal v7). The 17 old migrations are gone from
  disk — that history is in git. Migration numbers cited in `docs/ARCHITECTURE.md` (`0005`, `0006`,
  `0007`, …) **no longer exist as files.**
- **Both Neon branches were reset** and re-derived from the new baseline. Production is live on it
  (verified: a bogus sign-in returns `401 INVALID_EMAIL_OR_PASSWORD`, so the DB is reachable and the
  schema is correct — a broken schema would 500).

### Three latent bugs it exposed — these are the flavour of what to expect

1. **drizzle 0.45 WRAPS driver errors.** It throws a plain `Error` (`"Failed query: …"`) with the real
   `PostgresError` — carrying `code` and `constraint_name` — demoted to **`.cause`**. All five conflict
   detectors read `error.code` at the *top level*, so they silently returned `false`: a session-slot
   collision stopped being a gentle **409** and became a **500**, and two MAX+1 allocation retries
   stopped retrying. Fixed with `src/server/repositories/pg-conflict.ts` `isUniqueViolation()`, which
   walks the cause chain. **Anything inspecting a Postgres error must unwrap `.cause`.**
2. **`schema.ts` was a LOSSY view of the applied schema.** `memberships_role_check` existed **only in
   migration SQL** (drizzle 0.30 had no `check()` API), so a naive regeneration would have shipped
   `memberships.role` as **free text** and quietly dissolved the authz role model. Now declared via
   `check()`.
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
deliberate: an echo-back prompt alone is not a lock (`echo "host/db" | npm run db:reset` satisfies it,
which is exactly what a CI job or an agent does when a prompt looks hung). **The owner must run it in a
real terminal.** Do not add a `--force`/`--confirm` flag to make it scriptable — that is the footgun,
not a fix. See memory `db-reset-requires-a-real-terminal-and-that`.

Neon: `development` = host `ep-old-meadow-…` (local dev **and all preview deploys**). **Production's
host is NOT recorded** — an old memory claimed `ep-empty-mode`; that is stale and I repeated it as fact
and was wrong. Get it from the Vercel dashboard (Settings → Environment Variables → `DATABASE_URL`,
Production scope) or Neon's `main` branch. `vercel env pull --environment=production` is blocked by the
safety classifier, correctly.

⚠️ The owner pasted the **dev** database password in plaintext in the 2026-07-12 session transcript.
**It should be rotated** (Neon → `development` → reset password → update `.env.local` + Vercel Preview).

---

## 4. The work: `purses-9oxh` — "Get on latest: every major dep"

Owner (2026-07-12): *"LETS GET OURSELVES ON LATEST"*, *"CHECK ALL THE MAJOR DEPS"*. Scope is **every**
outdated major. **Do not present a menu and ask which ones — do them.** (I did that and was rightly
told off.)

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
| **9oxh.3** P0 | **Harden the route-test oracle** | **DO FIRST.** Lands green on Next 14. Without it the Next migration is *unverifiable*. |
| **9oxh.1** P1 | Node version truth | Everything type-checks against it. |
| **9oxh.4** P1 | Next 14 → 16, **holding React 18** | blocked by .3 and .1 |
| **9oxh.2** P1 | React 18 → 19 | blocked by .4 |
| **9oxh.5** P2 | zod 3 → 4 | independent; it's the validation boundary — security lens |
| **9oxh.6** P2 | tailwind 3 → 4 | independent; it's the design system — visual-regression risk |
| **9oxh.7** P3 | tooling batch (TS 7, ESLint 10, Vite 8, …) | blocked by .4 (eslint-config-next coupling) |

`bd ready` shows **9oxh.3, 9oxh.1, 9oxh.5, 9oxh.6** as startable now.

---

## 5. THE most important thing in this handoff

**`9oxh.3` is not bookkeeping. Read it before you touch Next.**

`src/lib/db/route-authz-enumeration.integration.test.ts:767` invokes handlers with `params` as a
**plain object**. After the Next 15 async-params migration a route does `const { id } = await params` —
and **`await` on a plain object resolves to itself**. So the test keeps passing whether or not the route
was correctly migrated.

Concretely: a route whose *type* was flipped to `Promise<…>` but which still reads `params.id`
synchronously would, in production, read `.id` off a Promise → `undefined` → the guard receives
`undefined` as the collection id → 403/404 instead of 200. **The stranger-403 assertion still goes
green.** Green CI, dead app: every legitimate owner request 404s.

The regex *extractor* is safe (it keys on the **export form**, `export async function GET(`, which
async-params doesn't touch). It is the **handler invocation** that silently degrades into an oracle
that cannot fail.

Fix: `Promise.resolve(params)` at every call site (~46 files; 34 are `src/lib/db/*.integration.test.ts`),
tighten `importHandler`'s ctx type so `tsc` enforces it, and assert the **exact** discovered route count
pre/post migration. The 34 owner-happy-path suites asserting `200` are the real backstop — a missed
`await` 404s instead of 200 — so they must get the same treatment or they too become unfalsifiable.

This codebase has been fooled by exactly this class of bug before: better-auth's
`export const { GET, POST } = toNextJsHandler(auth)` made the **entire auth surface invisible** to that
same enumeration test (`purses-ct0`). See memory `prove-no-violation-gates-ran` — an absence check over
an empty set is a false green.

---

## 6. Working agreements learned the hard way this session

- **One PR at a time.** No stacked PRs (memory `one-pr-at-a-time`).
- **CI costs money through July** (memory `ci-cost-restraint-july-2026`). Reproduce locally; don't
  force-push to re-trigger. Use `npx vercel redeploy <url>` to rebuild without burning a CI matrix.
- **Don't ask for approval on things you can decide.** The owner's repeated correction all session was
  that I was adding ceremony and asking permission instead of doing the work.
- **Don't assert from memory.** I claimed a prod DB hostname from a stale note and was wrong in front of
  the owner. Check, then speak.
- **`tsc` is not a gate here** — not in `package.json`, not in CI, not in the pre-push hook. It carries
  **96 pre-existing errors** (verified identical on `main` via a clean worktree). `npm run build` is the
  typechecking gate. Don't panic at the number; don't chase it to zero inside another bead.

## 7. Open follow-ups from the drizzle epic (`purses-mebk`)

- `mebk.1` — pin migration content hashes. **Before the first real user.** A re-baseline is invisible to
  every gate: a regenerated `drizzle/` still builds a perfect schema from empty, so CI goes **green** and
  only the prod deploy goes red.
- `mebk.2` — `sessions.number` / `sort_results.number` → `NOT NULL`. Cheapest while the DB is empty.
- `mebk.3` — `db:backfill-slugs` is dead code (same class as the deleted `backfill-numbers`).
