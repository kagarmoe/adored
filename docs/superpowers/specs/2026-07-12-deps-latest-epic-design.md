# Get on latest: every major dep — epic design (purses-9oxh)

**Status:** draft — pending adversarial review (spec gate, CLAUDE.md Workflow step 2)
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

**Seven serial PRs, one bead each, strictly one open at a time.**
Order: **.3 → .1 → .4 → .2 → .5 → .6 → .7**

Rationale:
- One PR at a time; no stacked PRs (memories `one-pr-at-a-time`, `serial-epic-prs`).
- CI cost restraint through July 2026: all gates run locally first, one push per PR, no
  force-push to re-trigger (memory `ci-cost-restraint-july-2026`).
- Each PR is independently revertable with a clean `git revert` of its squash commit.
  **No DB migrations anywhere in this epic** — every change is dep/code only.
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
- (b) **All 39 test files** that pass a bare `params: {…}` object (34 are
  `src/lib/db/*.integration.test.ts`) move to `Promise.resolve(params)`;
  `importHandler`'s ctx type tightens to the Promise form.

Why atomic: (b) alone → routes still read `params.id` synchronously → `.id` off a Promise →
`undefined` → every dynamic route 404s. (a) alone → tests still pass a plain object →
`await plainObject` no-ops → the oracle cannot fail and proves nothing. Only both together
make a mis-migrated route genuinely fail in test, exactly as it would in prod.

**Pages are NOT touched here.** They have no test oracle to harden and belong to the
codemod in `.4`.

**Verification (the full-surface proof — a single-route build is NOT sufficient):**
- `npm run build` on Next 14 type-validates **every** route via `.next/types` — the
  Promise-params pattern was spike-verified on one route only; this PR is where the whole
  surface gets proven.
- Full `test:db` — the 34 owner-happy-path suites asserting 200 are the real backstop
  (a missed `await` 404s instead of 200).
- Sanity floors in `route-authz-enumeration.integration.test.ts` (line 746 `>= 40`,
  line 790 `>= 50`) bump to **exact equality** on actual counts, recorded in the PR body
  for the pre/post-Next diff in `.4`.
- Full `test:ci`, `lint`, `auth:verify`, e2e.
- `tsc` is NOT a gate (96 pre-existing errors on main); the runtime assertions carry the
  proof, the tightened type is developer convenience.

**Review lenses:** QA/Test + Architect + Security (it rewrites the authz test oracle).

## PR 2 — `9oxh.1`: Node version truth (P1)

Three declarations disagree today (all verified in the file): `engines.node: 24.x`,
`.nvmrc: 22`, `@types/node ^20.0.0` (installed 20.19.43). We type-check against Node 20's
API surface while declaring 24 and telling nvm 22.

**Verify what Vercel production actually runs first** (dashboard / deploy logs — not
guessed; expected 24.x since that is Vercel's default and engines already says 24), then
align all four — `engines`, `.nvmrc`, CI's node version, `@types/node` — to that one major.
Vite 8's peer (`@types/node ^20.19.0 || >=22.12.0`) is satisfied either way; re-check
after moving.

**Review lens:** Craftsman (small diff, config truth).

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

**Verification:**
- The PR-1 oracle: exact discovered-route count **identical pre/post** migration.
- `grep -rn "params: {" src/app` — zero survivors of the sync form.
- Full gates + **full e2e** (UI paths trigger it; expect spec-copy/selector churn and
  possibly a real regression — memory `e2e-catches-real-ui-regressions`).

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

**Rejects-still-reject first:** before flipping, pin the current reject behavior across
that surface (env.ts included) and the `errorResponse` 400-body shape built from
`.flatten()` (v4 changed the issue format). A validation boundary that silently accepts
MORE than it did is the failure mode to hunt.

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
- **Before/after light+dark screenshots of every surface, diffed** + `e2e/a11y.spec.ts`
  (axe) in both themes. Unit tests cannot prove a v4 migration didn't change what the
  user sees; screenshots + axe are the only honest gate.

**Review lenses:** Graphic Design (DESIGN.md) + UX + QA/Test.

## PR 7 — `9oxh.7`: tooling batch (P3, blocked by .4)

TypeScript 7, ESLint 10 (+ `@eslint/js`), Vite 8, `@vitejs/plugin-react` 6, dotenv 17,
ulid 3. Grouped because they share one gate and none touch user-visible runtime.
Split out any that turns out to be a real migration.

- **TypeScript 7 policy:** the repo carries 96 pre-existing `tsc` errors; `tsc` is not a
  gate. Re-baseline, confirm `npm run build` (the actual typechecking gate) passes, file
  a debt bead if the number grew. Do NOT chase zero here.
- **ESLint 10** after `.4` (eslint-config-next coupling) — config is already flat, should
  be small.
- **ulid 3:** `generateId()` reaches ~536 nodes — assert ids still sort lexicographically
  by time and the API is unchanged.
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

1. Vercel production's actual Node major (PR 2 — dashboard/deploy logs).
2. `@testing-library/react` React-19 support (PR 4 — before starting).
3. Tailwind v4's emission for the `selector` dark-mode strategy (PR 6 — before migrating).
4. Whether Next 16 requires a Node minimum that interacts with PR 2's choice (check the
   v16 upgrade guide during PR 3).
