# Coverage Phase 2 — the 17 untested routes (real-DB integration) + harness

**Goal:** every untested API route gets a lightly-mocked integration test (real DB/repos/handler; mock only `getSession` + `@vercel/blob`). Ratchet the coverage floor at the end.

**Branch:** `feat/coverage-phase2-routes` → PR. **Constraints:** vitest 4.1.9; `// @vitest-environment node`; gate with `RUN_DB_TESTS`; reset+seed per test; mock policy = `getSession`/`@vercel/blob` only; never `importActual` `@/lib/auth`. DB tests run **serially** (one ephemeral Postgres) — do not run route-test groups in parallel.

## Recipe (every route test)
Use the shared harness (Task 0). Per route assert: **authz matrix** (401 unauthenticated; 403 wrong principal — member-not-owner / non-member / non-curator as the route requires; 404 absent-or-hidden) driven by varying the mocked session against **real** rows; **happy path** with a real **DB-state** assertion (row created/updated/deleted — not a mock call-count); **validation/error** branches (400 bad body, 409 conflict where applicable). Blueprints: `collection-purge`, `file-route-authz`, `sort-results-authz` integration tests. Read each route handler first to get its exact guards/status codes.

## Task 0 — Harness (do first)
- `e2e/fixtures/mock-auth.ts`: `mockAuth()` → object with `getSession` spy + matching `requireAuth` (both exports), for `vi.mock("@/lib/auth", () => mockAuth())`. Shape from `collection-purge.integration.test.ts:39-46`.
- `e2e/fixtures/seed.ts`: extract `seedFullCollection(ownerId: string)` from `collection-purge.integration.test.ts:151-273` (parameterize the `ownerId`/name closure); export the returned ids type. Keep its existing helpers.
- Smoke (`src/lib/db/seed-harness.integration.test.ts`, `RUN_DB_TESTS`): call `seedFullCollection(owner)`, assert the row counts it claims (non-vacuous). Confirms the helper itself.

## Route groups (each a sequential implementer; new file `src/lib/db/<area>-routes.integration.test.ts`)
**A — invitations (public/IDOR; overlaps purses-nj7):** `invitations/[id]` GET/PATCH/DELETE, `invitations/[id]/resend` POST, `invitations/accept` GET/POST. Read `src/app/api/invitations/**` + `src/server/api/invitations.ts`. Cover token validity, belongs-to/IDOR, accept → membership row created.
**B — public + account:** `shared-results/[token]` GET (public; valid/invalid/revoked token → result shape vs 404), `users/me` GET/PATCH/**DELETE** (self only; DELETE cascades — assert account gone).
**C — collection/item lifecycle:** `collections/[id]/members` GET/POST, `collections/[id]/archive` POST, `collections/[id]/restore` POST, `items/[id]/restore` POST. Owner/manager tiers; archive↔restore status transitions asserted in the DB.
**D — preferences:** `collections/[id]/preferences/items` GET, `collections/[id]/preferences/recalculate` POST. Member access; recalc writes preference rows.
**E — UI-wired core:** `auth/signup` POST (creates user; dup-email 409/400; mock no email), `collections` GET/POST, `collections/[id]` GET/PATCH/DELETE, `collections/[id]/items/[itemId]` PATCH, `items` POST. (`auth/[...nextauth]` is e2e-covered — note, skip.)

## Close
- Run `npm run test:db` (all groups green serially).
- Re-measure merged coverage locally (unit blob + db blob → merge); **ratchet `--coverage.thresholds.lines`** in `.github/workflows/ci.yml` up to just under the new merged number.
- Whole-branch adversarial review (QA + Security: real authz coverage, no mock theater, every route's 401/403/404 + happy + validation asserted against real rows). PR; merge when green.

## Verification
- `npm run test:db` green; each new route file present + gated by `RUN_DB_TESTS`.
- Merged coverage rises; floor ratcheted and still passes.
- The connectivity test (Phase 1) + these integration tests together: UI→route (Phase 1) + route→storage (here) = full chain proven.
</content>
