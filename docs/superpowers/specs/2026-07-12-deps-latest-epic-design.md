# Get on latest: every major dep — epic design (purses-9oxh)

**Status:** revised after adversarial review round 1 (QA/Test, Architect, Security — all
CONCERNS, no BLOCK; findings folded below, contradictions between personas resolved
against the artifacts). Pending owner review.
**Owner directive (2026-07-12):** "LETS GET OURSELVES ON LATEST" / "CHECK ALL THE MAJOR DEPS."
Scope is every outdated major. Do not present a menu — do them.

## Ground truth this spec was written against

- `package.json` read in full post-#329; `npm outdated` re-run fresh on the merged tree
  (2026-07-12) and it matches the epic's measured list exactly — 16 packages, nothing new
  hiding (posthog, sharp, resend, `@vercel/*` all current).
- All eight beads read (`purses-9oxh` + children). `9oxh.4` was scoped by a subagent against
  the official v15 + v16 upgrade guides; its numbers (49 routes / 65 params annotations /
  23 pages / one sync `cookies()`) are treated as measured, and re-verified by grep during
  execution.
- Graph checks: `generateId()` (`src/lib/id.ts`, ulid) reaches ~536 nodes at depth 2 — the
  "small" ulid bump underpins every id in the app. zod's boundary flows through
  `errorResponse()` (`src/server/api/http-errors.ts`) into the 400-body contract.
- **Inherited scope numbers are re-measured before each PR starts.** PR #329's body
  claimed a zod surface of 7 files; the measured surface is 19 (see PR 5). Prose in PR
  bodies, handoffs, and beads is a lead, not a fact — the code is the source of truth.

## Shape

**Six serial PRs, strictly one open at a time.**
Order: **.3 → .4 → .2 → .5 → .6 → .7** (`.7` absorbs `.1` — round 2 folded the
four-line Node alignment into the tooling batch; a config alignment does not earn a
full CI run under the July cost restraint, and round 1 already proved no ordering
dependency: Next 16 needs only node >=20.9.0 and `tsc` is not a gate).

Rationale:
- One PR at a time; no stacked PRs (memories `one-pr-at-a-time`, `serial-epic-prs`).
- CI cost restraint through July 2026: all gates run locally first, one push per PR, no
  force-push to re-trigger (memory `ci-cost-restraint-july-2026`).
- **Revertability is LIFO, not independent** (round 1 corrected the draft's overclaim):
  each PR reverts cleanly only while it is the top of the sequence. Once a successor
  lands, some reverts become one-way — reverting `.4` after `.2` restores `next ^14`
  against `react ^19` (peer-uninstallable), and reverting `.3` after `.4` restores sync
  `params.id` under a runtime that passes real Promises (mass 404). Revert in reverse
  order or roll forward. **No DB migrations anywhere in this epic** — every change is
  dep/code only.
- Four majors landing together means bisecting four majors when something breaks
  (epic rationale; the drizzle precedent `purses-mebk` produced three latent bugs from
  "just a version bump").

zod (.5) and tailwind (.6) are independent of the Next chain. They stay after it because
the Next chain is the P0/P1 spine and serial order must pick something; if the Next chain
stalls on an upstream bug, .5/.6 can be pulled forward without design change.

## PR 1 — `9oxh.3`: route async-params migration + test-oracle hardening (P0)

**One atomic change, on Next 14.** Both halves in the same PR because each half alone is
either app-breaking or unfalsifiable:

- (a) **All 49 route handlers** (65 param annotations) move to
  `{ params }: { params: Promise<{ … }> }` + `const { … } = await params`.
- (b) **Every route-invoking test call site** that passes a bare `params: {…}` object
  moves to `Promise.resolve(params)`. Measured surface: **51 test files** match the
  pattern (36 `src/lib/db/*.integration.test.ts`, 3 API-route unit tests, 12
  `page.test.tsx`) — the 12 page-test files migrate in PR 3 with the pages; the rest
  migrate here. Re-measure at execution.

Why atomic: (b) alone → routes still read `params.id` synchronously → `.id` off a Promise →
`undefined` → every dynamic route 404s. (a) alone → tests still pass a plain object →
`await plainObject` no-ops and proves nothing.

**Where falsifiability actually lives (review round 1 corrected this — the original
draft mis-attributed it):** the stranger-enumeration suite **cannot fail on a params
mistake**: a mis-migrated handler resolves `undefined` → 404, and 404 is an *accepted*
status (`route-authz-enumeration.integration.test.ts:775`). Its hardening preserves the
authz oracle's integrity; it does not falsify the migration. The migration's real
oracles are, in order:
1. **the owner-happy-path 2xx suites** (a missed `await` 404s where 200 is asserted),
2. **full e2e** (drives real routes through the real runtime),
3. at PR 3, **Next 16's typegen + the zero-sync-survivors grep** (Next 14 accepts both
   param forms, so `npm run build` here cannot prove completeness — it only proves the
   Promise form is *accepted*).

**Oracle-integrity invariants (Security round 1) — PR 1 rewrites the file that proves
authz, so the hardening itself must be provably non-weakening:**
- **Key-set diff, one-time (round 2 demoted this from a permanent snapshot test):**
  capture the sorted stranger-case keys and sorted `PUBLIC_OR_SELF_KEYS` before and
  after, diff, paste in the PR body; re-run the same diff once at PR 3 (must be
  byte-identical). A permanent literal snapshot in the same file that defines the
  allowlist forces no independent scrutiny and breaks on every legitimate future route.
  The existing count floors (lines 746/790) stay untouched, and the structural
  exhaustiveness gate (lines 726–739, throws on any uncategorized route) already fails
  hard on a dropped case — the diff covers what those cannot see: a key quietly moving
  between sets.
- **Allowlist frozen:** PR 1 adds zero entries to `PUBLIC_OR_SELF_KEYS` and changes zero
  rationales — any allowlist edit is out of scope by rule (and visible in the key-set
  diff).
- **Predicate frozen:** the `403/404` status assertion and the exhaustiveness logic stay
  byte-identical apart from params plumbing.
- **Diff-shape rule for every rewritten test file:** changed lines match only
  `params: X` → `params: Promise.resolve(X)`; **zero `expect()` lines change** (the
  cross-parent IDOR suites in `sort-results-authz.integration.test.ts` are in this set
  and are equally load-bearing). This rule — not the key-set diff — is what catches a
  seeded-id → `nonexistent-*` downgrade.
- **Test-side exhaustiveness check, twice-run script (round 2 demoted this from a
  permanent test):** the bare-params grep runs pre-migration (**expect N > 0** — the
  prove-it-can-fail discipline), then post-migration (N = 0, output in the PR body),
  and once more at PR 3. It is load-bearing only while un-migrated handlers can exist
  (a bare-params test cannot *falsify a missed handler*; it still drives a migrated one
  correctly) — after PR 3, Next 16 typegen dominates it, and a gate that can no longer
  fail is not a gate.
- **Owner-2xx coverage statement:** enumerate which of the 49 route+method pairs lack an
  owner happy-path 2xx test and record the gaps in the PR body. QA round 1 sampled
  broadly and found dense coverage; the known thin spot is `POST
  collections/[id]/pool/upload`, whose entire params proof is one `tokenPayload`
  assertion in a mocked unit test.

**Gates:** full `test:db`, `test:ci`, `lint`, build, e2e. **`auth:verify` currently runs
nowhere automatically** (not in `ci.yml`, not in the pre-push hook — CLAUDE.md's claim
that the hook mirrors it is wrong). PR 1 adds it as a CI gate step (seconds, no matrix
cost) and corrects the CLAUDE.md sentence; the PR body carries the revert-coupling note
*"on revert, preserve the auth:verify CI step"* (the gate is auth-surface; only its
vehicle is this PR). `tsc` is NOT a gate (96 pre-existing errors); the tightened
`importHandler` ctx type is developer convenience, not verification.

**CI cost tuning rides the same `ci.yml` touch** (owner-driven, 2026-07-12 — CI is
billed in build minutes and July is under restraint). Four changes, none altering what
is tested: (1) drop `chromium` from the Playwright install — dead weight since PR #312
made tablet/WebKit the sole CI viewport; (2) cache `~/.cache/ms-playwright` keyed on the
Playwright version; (3) cache `.next/cache` — the gate job builds Next and the e2e
webServer builds it again; (4) `timeout-minutes` on every job (the GitHub default is
360 minutes; one hung e2e bills ~$3 — this repo has recorded hang modes). Expected
effect: roughly 2–4 minutes off every UI-PR run plus the hang cap. (A fifth idea —
one-viewport PR e2e — was withdrawn: PR #312 already did it; the stale
`e2e-harness-shape` memory that claimed otherwise has been corrected.)

**Review lenses:** QA/Test + Architect + Security (it rewrites the authz test oracle).

## ~~PR 2 — `9oxh.1`: Node version truth~~ — FOLDED INTO PR 7 (round 2)

Three declarations disagree today (all verified in the file): `engines.node: 24.x`,
`.nvmrc: 22`, `@types/node ^20.0.0` (installed 20.19.43). Real, but a four-line config
alignment does not earn a standalone PR + full CI run under the July restraint, and no
ordering dependency exists (round 1: Next 16 needs only node >=20.9.0; `tsc` is not a
gate). The work — verify Vercel production's actual Node major first (dashboard/deploy
logs, never guessed), then align `engines` + `.nvmrc` + CI + `@types/node` to it — moves
verbatim into PR 7, which closes bead `9oxh.1`. The `9oxh.4`-blocked-by-`9oxh.1` bd
dependency is removed. (Section kept, struck, so cross-references and PR numbering
elsewhere in this spec stay valid.)

## PR 3 — `9oxh.4`: Next 14 → 16 directly, React HELD at 18 (P1)

`next@16` peers `react "^18.2.0 || ^19.0.0"` — it still accepts React 18, which is what
makes Next and React separate steps. Bundled, you'd bisect a 65-file migration against a
React major.

- Codemod `npx @next/codemod@canary next-async-request-api .` for the **23 pages** taking
  `params`/`searchParams` and the **one sync `cookies()`**
  (`src/app/collections/page.tsx:36`). Routes are already migrated by PR 1.
- Hand-fix what the codemod misses (per the scoping agent): the 23 separately-declared
  page prop interfaces, any indirection it TODO-comments, and test files (it only walks
  App Router conventions).
- Config changes, all confirmed present in the repo:
  - `next.config.mjs` `eslint.ignoreDuringBuilds` — key REMOVED in 16; delete it
    (`npm run lint` is already the standalone gate).
  - `next.config.mjs` `experimental.staleTimes dynamic: 0` — 16's default; delete the
    no-op and its comment.
  - `eslint.config.mjs` FlatCompat bridge → `eslint-config-next@16` native flat export.
    **`eslint-config-next` ^15 → ^16 fixes a live mismatch: the lint config is a major
    AHEAD of the framework today (15-on-14)** — same drift class as the @types/react
    ^19-on-18 bug #329 fixed.
  - **Delete `@eslint/eslintrc`** — it exists only to power FlatCompat.

**Page-oracle hardening moves HERE (round 1 corrected the draft's false claim that
pages have no test oracle):** `src/lib/db/page-authz-enumeration.integration.test.ts:267`
invokes page default exports with a bare `{ params: tc.params }`, and 12 `page.test.tsx`
files do likewise. All get the same `Promise.resolve` treatment, same diff-shape rule and
key-set-snapshot invariants as PR 1's route tests.

**Middleware (round 1 — the draft was silent on the file guarding the login-redirect
boundary):** Next 16 deprecates/renames the `middleware.ts` convention (→ `proxy.ts`).
Verify the exact v16 status in the upgrade guide, migrate `src/middleware.ts` if
required, and treat the logged-out-redirect e2e (`auth-navigation.spec.ts`) as the named
oracle — a silently-dead matcher is a UX regression the DAL guards bound, but it must
not ship unnoticed.

**Verification:**
- `grep -rn "params: {" src/app` — zero survivors of the sync form — plus **Next 16's
  own typegen**: this build is the first that *rejects* un-migrated handlers, so it is
  the completeness proof PR 1 could not give. (The draft's "route count identical
  pre/post" was dropped: PR 3 changes no route exports, so a filesystem+regex count
  cannot fail — a gate that cannot fail is not a gate.)
- PR 1's key-set snapshot byte-identical after the bump.
- Full gates + **full e2e** (expect spec-copy/selector churn and possibly a real
  regression — memory `e2e-catches-real-ui-regressions`).

**Review lenses:** QA/Test + Architect + Security.

## PR 4 — `9oxh.2`: React 18 → 19 (P1, blocked by .4)

- Pre-check `@testing-library/react` (^16.3.2) supports React 19 **before starting**.
- `react`/`react-dom` → ^19; `@types/react`/`@types/react-dom` back to ^19 — correct only
  now (PR #329 set them to ^18 to match the 18 runtime; this step is what makes ^19 right).
- Watch: ref-as-prop (forwardRef no longer needed), removed legacy APIs.

**Review lenses:** QA/Test + Craftsman.

## PR 5 — `9oxh.5`: zod 3 → 4 (P2) — the security-relevant one

zod IS the input-validation boundary. **The scope is 19 non-test files, not the "four
files plus three routes" PR #329's body claimed** (measured 2026-07-12 by
`grep -rl 'from "zod"' src`, tests excluded):

- **11** `src/server/api/*.ts` (collections, dispositions, http-errors, invitations,
  items, members, result-items, results, sessions, shares, users)
- 3 route handlers (`collections/[id]/purge`, `items/[id]/purge`,
  `sessions/[id]/decisions`)
- **3 client form components** (`CollectionForm`, `InviteForm`, `ItemForm`) — zod ships
  in the browser bundle; v4's behavior/size changes reach the client
- **`src/lib/env.ts`** — zod validates the whole env contract **at module load**; a v4
  semantic change here fails every route at boot, not at request time. Migrate and
  verify this file first.
- `src/lib/decision-batch-schema.ts`

**Rejects-still-reject first — and round 1 established most of these pins must be
WRITTEN, not found:** the executor will find green tests and be tempted to check the box;
these are the traps, named:

- **`http-errors.test.ts:70` is tautological for this migration:** it asserts
  `b.details` equals `err.flatten()` — both sides computed by the *same installed zod*,
  so under v4's changed issue format the test auto-adapts and stays green while the wire
  400-body contract changes. **Convert it to a literal shape assertion before the bump.**
- **`env.ts:104` reads `error.errors` — removed in zod 4** (alias of `.issues` dropped).
  Fail-closed (boot still dies) but the catch would throw a masking TypeError; rename to
  `.issues` as part of the migration.
- **"Verify env.ts first" means:** the existing `src/lib/env.test.ts` reject-matrix green
  before the bump and unchanged after — **extended first** to the currently-unpinned
  constraints (invalid `AUTH_URL`, invalid `EMAIL_FROM`, bad `NODE_ENV`/`VERCEL_ENV`
  enum values, empty-string `AUTH_SECRET`/`DATABASE_URL`). Verification by executable
  test, not by reading the diff.
- **Client-form pins CUT (round 2):** round 1 verified all three forms' constraints are
  mirrored server-side — the server schema is the guard, and those pins stay. A client
  zod drift under v4 degrades to "server 400 instead of inline message": UX copy, not a
  boundary breach, and no memory records this repo bitten by client-validation drift.
  Net-new `CollectionForm`/`InviteForm` zod-path tests would be a redundant permutation
  of one guard. Cheap form: during PR 5, manually trigger one inline validation error
  per form and note it in the PR body.
- **The 19-file surface is proven by grep output in the PR body (round 2 demoted this
  from a permanent inventory test):** `grep -rl 'from "zod"' src` pasted next to the
  touched-file list. A permanent inventory assertion is a register-scan that fires on
  every innocent future zod import; the #329 burn was *stale prose*, and the antidote is
  the re-measure rule plus review-time evidence, not a treadmill test.

Then flip directly to zod@4. The zod/v4-subpath incremental path (available since 3.25.x)
is the **fallback** if the diff explodes, not the default. better-auth already carries a
nested zod@4; moving root to 4 lets them dedupe.

**Review lens:** Security (`vibe-security`) + QA/Test.

## PR 6 — `9oxh.6`: tailwind 3 → 4 (P2) — the visual-regression one

v4 is CSS-first: `tailwind.config.ts` largely dissolves into CSS `@theme`, PostCSS setup
changes. This repo's design system rides on it.

- Official upgrade tool (`npx @tailwindcss/upgrade`), then hand-verify:
- **The `[data-theme=dark]` selector semantics**: Tailwind 3.4 emits `dark:` via
  zero-specificity `:where()`, so dark overrides win by SOURCE ORDER (memory
  `tailwind-dark-selector-override`). Verify v4 preserves that, or every `dark:` override
  silently flips.
- **Targeted improvement in scope** (per the bead): make
  `src/lib/design/contrast.test.ts` read `globals.css` directly, killing the
  `tokens.ts` mirror drift that has produced a false-green AA gate before (memory
  `design-aa-tokens-mirror`).
- **Before/after light+dark screenshots, diffed, against a COUNTED inventory** — "every
  surface" is bound to the enumerated screenshot-capture surface list plus the 29
  `page.tsx` files, with the count stated in the PR body. An empty diff over an
  unenumerated set analyzes nothing (round 1; cf. memory
  `prove-no-violation-gates-ran`). Plus `e2e/a11y.spec.ts` (axe) in both themes. Unit
  tests cannot prove a v4 migration didn't change what the user sees.

**Review lenses:** Graphic Design (DESIGN.md) + UX + QA/Test.

## PR 7 — `9oxh.7`: tooling batch (P3, blocked by .4)

TypeScript, ESLint 10 (+ `@eslint/js`), Vite 8, `@vitejs/plugin-react` 6, dotenv 17,
ulid 3. Grouped because they share one gate and none touch user-visible runtime.
Split out any that turns out to be a real migration.

- **TypeScript lands at 6.0.x, NOT 7 — re-scoped by round 1.** TS 7 is a *certain* peer
  wall today: `@typescript-eslint/eslint-plugin@8` (in the tree via `eslint-config-next`,
  which stays at 16) peers `typescript >=4.8.4 <6.1.0`, so `typescript@7` ERESOLVEs on
  `npm ci`, and this spec's own "no legacy-peer-deps, ever" makes that a hard stop. Land
  **6.0.3**, record TS 7 as a deliberate hold (revisit when typescript-eslint supports
  it), and let the close-out `npm outdated` gate carry that recorded hold rather than
  inherit it silently.
- **TypeScript baseline policy:** the repo carries 96 pre-existing `tsc` errors; `tsc` is
  not a gate. Re-baseline under 6.0.x, confirm `npm run build` (the actual typechecking
  gate) passes, file a debt bead if the number grew. Do NOT chase zero here.
- **ESLint 10** after `.4` (eslint-config-next coupling) — config is already flat, should
  be small.
- **Node version truth (absorbed bead `9oxh.1`, round 2):** verify Vercel production's
  actual Node major (dashboard/deploy logs — never guessed), then align `engines`
  (says 24.x) + `.nvmrc` (says 22) + CI + `@types/node` (^20) to that one major. Vite 8's
  peer (`@types/node ^20.19.0 || >=22.12.0`) is satisfied either way. This PR closes
  `9oxh.1`.
- **ulid 3:** `generateId()` reaches ~536 nodes, and ULID lexicographic-time ordering is
  **load-bearing, verified**: `compareByCreatedAtThenId()` (`src/lib/decision-order.ts:11`)
  ties the canonical decision-event ordering on id, so a ulid-3 format/ordering change
  would reorder tied decisions and change ranking replay. The permanent
  sorts-lexicographically-by-time assertion is earned (round 2 conditioned it on exactly
  this check; the condition is met — extend `decision-order.test.ts` if it doesn't
  already pin it).
- **dotenv 17:** check for behavior/log changes on load.

**Review lens:** Craftsman.

## Cross-cutting rules

- **Range hygiene:** every PR rewrites the version ranges of packages it touches to the
  actually-installed floor (current lower bounds are stale: `typescript ^5.3.0` vs 5.9.3
  installed, `tailwindcss ^3.4.1` vs 3.4.19, `zod ^3.23.8` vs 3.25.76, etc.). No
  dedicated churn PR.
- **`tsx` stays a production dependency** — `vercel-build` runs `tsx scripts/migrate.ts`
  at build time. Do not "clean it up" into devDependencies; that breaks prod builds.
- **Clean-install verification** on every dep-changing PR: `rm -rf node_modules && npm ci`
  + gates. A local install passing on stale `node_modules` while CI's `npm ci` fails is a
  known trap (memory `vercel-analytics-legacy-peer-deps`).
- **No `legacy-peer-deps`, ever.** If a peer conflict appears (most likely vite 7→8 in
  .7), fix the actual conflicting version; do not re-add the resolver override.
- **Every PR through `adversarial-review`** with the lenses named per PR above, wrapped in
  requesting/receiving-code-review, before merge. The drizzle precedent: a green CI on a
  dependency major proves little.
- **Epic close-out:** re-run `npm outdated` and assert it is **empty** (or every remaining
  line is a deliberate, recorded hold). The inverse of `prove-no-violation-gates-ran` —
  prove the scan ran and found nothing, on a set known to be non-empty at the start.
- Epic is complete only when **all seven beads plus any follow-up beads filed during the
  work are closed** (CLAUDE.md definition of done — cf. `purses-mebk`, still open on its
  children).

## Rejected alternatives

- **Fold .3 into .4 (one PR):** bisects a 65-annotation migration against a framework
  major; exactly what the epic forbids.
- **Oracle-only first with a dual-mode test shim** (invoke handlers with both plain object
  and Promise): over-engineered, leaves the shim as permanent debt, and still can't fail
  until routes migrate.
- **Batch zod/tailwind with the tooling PR:** zod is the security boundary and tailwind is
  the design system — each needs its own review lens and its own revert point.

## Open facts to verify during execution (not guesses to carry)

1. Vercel production's actual Node major (PR 7, absorbed from `.1` — dashboard/deploy
   logs).
2. `@testing-library/react` React-19 support (PR 4 — before starting).
3. Tailwind v4's emission for the `selector` dark-mode strategy (PR 6 — before migrating).
4. ~~Next 16's Node minimum~~ **CLOSED by round 1:** `next@16.2.10` engines
   `node >=20.9.0` — both 22 and 24 satisfy it; no interaction with PR 2's choice.
5. Next 16's `middleware.ts` → `proxy.ts` convention status: deprecation warning or
   silent no-op, and whether the matcher semantics change (PR 3 — upgrade guide, before
   migrating; the logged-out-redirect e2e is the named oracle either way).
6. Exact zod-4 `error.errors` removal semantics against the official migration guide
   (PR 5 — reviewer confidence 8, verify before relying).

## Adversarial review — round 1 record (2026-07-12)

Three personas (QA/Test, Architect, Security), all **CONCERNS**, no BLOCK. Major folds:
falsifiability re-attributed from the stranger enum (which accepts 404 and thus cannot
fail on a params mistake) to the owner-2xx suites + e2e + PR-3 typegen; oracle-integrity
invariants upgraded from exact counts to key-set snapshot + frozen allowlist/predicate +
diff-shape rule + test-side exhaustiveness gate; test surface corrected 39 → 51 files;
the page oracle (draft claimed none existed) routed to PR 3; `auth:verify` found running
nowhere automatically (fixed in PR 1); TS 7 re-scoped to 6.0.x on a verified peer wall;
revertability corrected to LIFO; zod pins identified as mostly net-new with one
tautological pin to convert. Persona contradictions (env.test.ts existence) were resolved
against the artifacts, not by vote.

## Adversarial review — round 2, Craftsman/ponytail (2026-07-12)

Verdict **CONCERNS** — nothing unsafe; four round-1 additions were more than they needed
to be. Folds: key-set snapshot and test-side exhaustiveness gate demoted from permanent
tests to one-time PR-body evidence (each re-run once at PR 3; the structural
exhaustiveness gate, frozen-allowlist/predicate rules, diff-shape rule, and owner-2xx
enumeration — the protections that make the demotions safe — all stay); the 19-file zod
inventory test demoted to PR-body grep output; net-new client-form zod pins cut (server
mirrors verified in round 1; the server pins stay); PR 2 (Node truth) folded into PR 7,
saving a CI run under the July restraint (owner confirmed). Declined cuts, on safety:
`contrast.test.ts`→globals.css stays in PR 6 (the migration is the drift moment;
`design-aa-tokens-mirror` records a real prior false green), counted screenshot
inventory, middleware e2e oracle, env reject-matrix extension, and the .3/.4 and
zod/tailwind PR splits. One demotion reversed against the artifacts: the ulid ordering
assertion is permanent — `compareByCreatedAtThenId()` proves id ordering is load-bearing.
