# Test-coverage initiative — design spec

**Date:** 2026-06-21 · **Status:** draft (pending adversarial review) · **Epic:** test-coverage initiative

## Problem / context

Coverage reads **54%**, and that number is both understated and hiding real gaps:

- It is **unit-tier only**. The DB integration tests (`src/lib/db/*.integration.test.ts`, gated by `RUN_DB_TESTS=1`) exercise the repository layer — the largest "untested" chunk (`src/server/repositories` ≈ 31%) — but run in a **separate CI job with no coverage instrumentation**, so that coverage is invisible (`vitest.config.mts` `include:["src/**"]`, no exclude; `.github/workflows/ci.yml` `gate` vs `db-tests`).
- **CI enforces no coverage threshold** — coverage can silently regress.
- **17 of 46 API routes have no test of any kind**; several back live UI flows.
- **No broken UI→route wires today** (all ~30 client `fetch()` sites map to a real route+method), but nothing guards that against future drift.
- Genuinely-dark layers (0%): `src/lib/auth.ts`, `middleware.ts`, auth/share **pages**, and upload/form **components** (`PhotoUpload`, `PoolUpload`, `ItemForm`, `ItemEditForm`, `InviteForm`, `SessionAnalytics`).

## Goal / intended outcome

Every route and handler has a real test; every UI interaction point is provably connected to handler → API → storage; the 0% component/page layer is covered; and the coverage number reflects reality and cannot regress.

## Non-goals

- Not changing product behavior or routes.
- Not adding a blob emulator or new test framework (reuse vitest + the existing ephemeral-Postgres harness + Playwright).
- Not pursuing 100% — pursue *honest* coverage with a ratcheting floor, prioritizing auth/permission/public surfaces.

## Locked decisions

1. **Mock `getSession` only** at the integration tier (caller identity). Real authz/DAL/repos/DB run un-mocked; real login + middleware are covered by e2e. (Forging a JWT doesn't work for direct-handler calls — `getServerSession` reads Next request scope, not the `Request`; HTTP-real route tests can't mock blob. So `getSession` is the lightest mock that still tests the app.)
2. **Instrument + merge + threshold**: collect coverage in the `db-tests` job, merge with the unit report, add a CI threshold that ratchets up per phase.
3. **Delete dupes, convert the rest**: drop heavily-mocked sibling tests already covered by integration tests; convert non-duplicated ones to lightly-mocked integration; keep only pure-validation (400-path) cases as fast unit tests.
4. **Full scope**: routes + UI-connectivity contract test + the 0% component/page layer.

**Mock policy (everywhere):** the only acceptable mocks are true external boundaries — **`@vercel/blob` / `@vercel/blob/client`** and **`getSession`** (identity). Email is a no-op stub (`auth.ts:77-81`, `invitations.ts:91`); analytics is render-time only. Everything else real. "Test the app, not the mock."

## Approach / architecture

**Test tiers (existing, reused):**
- *Unit/component* (`vitest`, jsdom/node) — counts toward coverage in the `gate` job.
- *Integration* (`vitest`, node, `RUN_DB_TESTS=1`, ephemeral Postgres via `e2e/fixtures/db.ts`+`seed.ts`) — real route→repo→DB; now to be instrumented.
- *e2e* (Playwright) — real auth/login + UI flows; unchanged.

**Minimal-mock recipe.** **Canonical blueprint = `collection-purge.integration.test.ts` / `sort-results-authz.integration.test.ts`** (they flat-mock **both** `@/lib/auth` exports). `file-route-authz.integration.test.ts` mocks **only `getSession`** — that is a special case for a route that doesn't call `requireAuth`; **do NOT copy it** (33 route files use `requireAuth`, so the both-exports form is the common case). Recipe: `// @vitest-environment node`; flat-mock both `@/lib/auth` exports from one spy (importActual pulls nodemailer via `EmailProvider` at module-eval and breaks); `vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }))`; mock `@vercel/blob` only for blob routes; import the **real** handler; gate with `RUN_DB_TESTS`; `resetDb()`+seed per test. **Extract a shared `mockAuth()` test helper** (exports both `getSession` + `requireAuth` spies) so no per-test author re-derives a partial mock. Each route test asserts the **authz matrix** (401/403/404 against real rows by varying the session), the **happy path** with a real DB-state assertion, and **validation/error** branches. Extract `collection-purge`'s `seedFullCollection` into `e2e/fixtures/seed.ts` as **`seedFullCollection(ownerId: string)`** (it currently closes over a test-scoped `ownerId` — this is a parameterize refactor, not a move; `seed.ts` is already the shared module).

**Coverage merge (corrected — `--merge-reports`/`blob` do NOT exist in vitest 1.6.1; they're 2.x).** PRIMARY mechanism = **`istanbul-lib-coverage`** (3.2.2, already installed) merging the two tiers' **`coverage-final.json`** (a **union** of hit counts — not a sum, so a file run in both tiers is not double-counted). Add `"json"` to `coverage.reporter` in `vitest.config.mts` so `coverage-final.json` is emitted; both tiers must share `coverage.include:['src/**']` and the same path base. **Do NOT put the merged-baseline number in `vitest.config.thresholds`** — the `gate` job runs unit-only and would fail it. Instead the **threshold lives as a node check in the merge job** (assert merged-total ≥ floor, fail the job). (Bumping vitest→2.x to get native merge is an explicit alternative, deferred — keep the toolchain pinned for this initiative.)

**Connectivity contract test** (`src/lib/__tests__/ui-route-connectivity.test.ts`, unit-speed): an **AST-based** extractor (use the `@typescript-eslint`/`ts-morph` parser already available via eslint deps — **not a line regex**) that walks `"use client"` files, resolves intra-file `const` bindings (e.g. `ImageViewer.tsx` builds `patchUrl` as a separate const, then `fetch(patchUrl)`), collects every `fetch`/`apiGet|apiPost|apiPatch` call's URL+method, normalizes `${…}`→`[param]`, and asserts a matching `route.ts` exports that method. **Fail-loud** on any URL it cannot statically resolve (print "annotate this call site"), never silently skip. Acceptance fixture: `ImageViewer.tsx`'s `patchUrl` must be resolved. Paired with per-route integration (handler→storage), this proves UI → handler → API → storage. (Longer-term simpler alternative noted: a typed API client of named per-route functions the compiler checks — out of scope for this initiative.)

## Phases (one PR each; threshold ratchets)

**Committed deliverable = Phases 0–3.** Phase 4 is a prioritized, ratchet-gated backlog (auth/upload security paths first; trivial getters/framework re-exports are not worth testing).

0. **Coverage honest** — (a) `db-tests` job runs `--coverage` (json reporter, `include:['src/**']`) to a distinct dir; (b) `gate` job already emits coverage — add the json reporter; (c) both jobs **upload their coverage dir as a CI artifact**; (d) a new **merge job** (`needs: [gate, db-tests]`) downloads both, runs an `istanbul-lib-coverage` merge script → union `coverage-final.json` + summary, and **asserts merged-total ≥ floor** (the threshold lives here, not in vitest.config). Verify the merge locally first. (Foundation; biggest number win.)
1. **Harness + connectivity contract test.**
2. **17 untested routes** — real-DB integration, auth/public/IDOR first (`invitations/*`, `shared-results/[token]`, `users/me`, `members`), then lifecycle (`archive`/`restore`/`preferences`), then UI-wired (`auth/signup`, `collections` GET/POST, `collections/[id]`, `items/[itemId]` PATCH, `items` POST). `auth/[...nextauth]` is e2e-covered (NextAuth re-export) — noted, not separately tested.
3. **Rationalize 25 mocked siblings** — **convert-then-delete in the SAME PR** so the merged coverage report is the gate (not narrative review): add the integration test, confirm the merged report shows the deleted sibling's branch set is covered, then delete the sibling. Delete `sort-results/**` + photo-cascade dupes; convert non-dupes (`sessions*`, `members/[mid]`, `collections/[id]/invitations`, `collections/[id]/items`, `photos/reassign`, `pool/group`, `pool/photos`, `set-hero`, `items/[id]`); keep 400-path units + `pool/upload` token-gen unit; blob routes → blob-mock integration.
4. **0% component/page layer (prioritized backlog, ratchet-gated)** — upload/form components (mock only `fetch`/`@vercel/blob/client`/`heic`); `login`/`signup` (mock `signIn`); server-component pages via await-render pattern; pure modules (`middleware-auth`, `env`, `api-client`, `auth.ts` callbacks). Do the security-relevant (auth/upload) ones first; skip trivia.

## Risks / tradeoffs

- **Coverage-merge plumbing** is the riskiest mechanical bit. The pinned vitest 1.6.1 has **no** `--merge-reports`/`blob` (those are 2.x) — so the merge is `istanbul-lib-coverage` over both tiers' `coverage-final.json`, run in a dedicated merge job that consumes uploaded artifacts from `gate` + `db-tests`. Mitigation: build + verify the merge script locally (real numbers) before wiring CI.
- **Threshold placement**: the floor is asserted in the **merge job**, never in `vitest.config.thresholds` (which would fail the unit-only `gate`).
- **Integration tests need Docker/Postgres** and don't count in the fast `gate` until merged — hence Phase 0 first.
- **Deleting mocked siblings** could drop a branch integration doesn't cover — mitigation: **convert-then-delete in one PR**; the merged coverage report (not eyeballing) is the gate.
- **`requireAuth` import hazard**: always flat-mock **both** `@/lib/auth` exports via the shared `mockAuth()` helper (never importActual — it evaluates `EmailProvider`/nodemailer + `getDb` at import).
- **Connectivity test brittleness**: a regex would false-pass on variable-bound URLs; use an AST extractor that resolves const bindings and fails loud on anything unresolvable.

## Acceptance criteria

- Merged coverage total computed and published; CI threshold present and blocks a deliberate regression.
- All 46 routes have a real test (integration for DB routes, blob-mock integration for blob routes, e2e for NextAuth) — or a documented reason.
- Connectivity contract test exists and passes; fails when a UI `fetch` URL has no matching route+method.
- The 0% component/page layer has behavioral tests (real behavior, external-only mocks).
- No test asserts only a mock; every UI-wired route has an integration test reaching storage.
</content>
