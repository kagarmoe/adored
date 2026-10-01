# Test-coverage Phase 3 — rationalize 25 mocked route siblings (convert-then-delete)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task = one fresh subagent, TDD (failing test first).

**Goal:** Replace the 25 heavily-mocked `src/app/api/**/route.test.ts` siblings with honest real-DB integration tests (mock only `getSession` + `@vercel/blob`), deleting each sibling in the same PR, so the merged coverage report — not narrative — is the gate. Net effect: route handlers keep (or improve) coverage while every authz/permission branch is exercised against real rows.

**Architecture:** Lightly-mocked integration tests under `src/lib/db/*.integration.test.ts`, gated by `RUN_DB_TESTS=1`, driving the **real** route handler → service → repo → ephemeral Postgres. The canonical blueprint is `src/lib/db/collection-purge.integration.test.ts` and `src/lib/db/sort-results-authz.integration.test.ts`. Shared seed helpers live in `e2e/fixtures/seed.ts`; the shared auth mock is `e2e/fixtures/mock-auth.ts` (`mockAuth`).

**Tech Stack:** vitest 4.1.9 (`forks` pool, v8 coverage, native `--merge-reports`), Drizzle ORM, ephemeral Postgres via `e2e/fixtures/db.ts` + `e2e/fixtures/test-db.sh` (Docker).

## Global Constraints

- **Mock ONLY `getSession` + `@vercel/blob`/`@vercel/blob/client`.** Everything else — handler, DAL, repos, DB — runs un-mocked. "Test the app, not the mock."
- **Never `importActual("@/lib/auth")`** — the spread form evaluates `EmailProvider`/nodemailer + `getDb` at import and breaks. Flat-replace BOTH exports via one hoisted spy (see Shared Recipe).
- **Every integration test file** starts with `// @vitest-environment node`, gates with `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;`, and `resetDb()` + seeds per test.
- **Non-vacuous guards:** every "is 0 / is gone after" assertion is paired with a "was non-zero / present before" assertion. A table never seeded must not make an assertion pass vacuously.
- **Convert-then-delete in the SAME task/PR.** Add/extend the integration test, confirm via coverage the route's lines+branches are still covered, THEN delete the mocked sibling. Never delete first.
- **DB tests run SERIALLY** (`--no-file-parallelism`): concurrent `RUN_DB_TESTS` files deadlock on the one shared Postgres. Do not run integration files in parallel.
- **Node ≥ 22.12.** vitest-4 constructor mocks must use `vi.fn(function () { return spy; })`, never an arrow (`vi.fn(() => spy)` → "X is not a constructor"). (Integration tests rarely mock constructors — real repos are used — but keep this in mind if mocking blob client classes.)
- **YAGNI does not apply to tests** (user override): every authz branch (401/403/404), happy path (with a real DB-state assertion), and error/validation branch (400/500) gets a real test. Real assertions over mocks.
- Floor currently 70 in `.github/workflows/ci.yml` job "Merged coverage floor" (`--coverage.thresholds.lines=70`). Merged baseline before Phase 3 = **71.52%**. Ratchet only in the finalize task, only after measuring.

---

## Empirical baseline (why each task exists)

DB-tier-**alone** coverage of each sibling's `route.ts` (measured 2026-06-22, 247 DB tests). This is the coverage that survives after the unit sibling is deleted — gaps here are what each task must close:

| route.ts | methods | DB-alone L% | DB-alone B% | already-covering integration test |
|---|---|---|---|---|
| `collections/[id]/invitations` | GET POST | 0 | 0 | none (invitations-routes covers `/api/invitations/[id]`, a different route) |
| `collections/[id]/items` | GET POST | 0 | 0 | none |
| `items/[id]` | GET PATCH DELETE | 0 | 0 | none (item-purge tests the service, not this route) |
| `collections/[id]/members/[mid]` | GET PATCH DELETE | 0 | 0 | none |
| `collections/[id]/items/[itemId]/photos` | POST | 0 | 0 | none |
| `collections/[id]/items/[itemId]/photos/[photoId]` | PATCH DELETE | 0 | 0 | none |
| `.../photos/[photoId]/set-hero` | POST | 0 | 0 | none |
| `.../photos/[photoId]/file` | GET | 86.9 | 85.7 | file-route-authz (gap = a couple branches) |
| `collections/[id]/photos/reassign` | POST | 0 | 0 | none |
| `collections/[id]/pool/group` | POST | 0 | 0 | none |
| `collections/[id]/pool/photos` | GET | 0 | 0 | none |
| `collections/[id]/pool/photos/[photoId]/file` | GET | 0 | 0 | none |
| `collections/[id]/pool/upload` | POST | 0 | 0 | none (token-gen; KEEP-UNIT) |
| `sessions` | POST | 0 | 0 | none |
| `sessions/[id]` | GET PATCH DELETE | 0 | 0 | none |
| `sessions/[id]/decisions` | POST | 95 | 50 | triage-decision (gap = branches) |
| `sort-results` | POST | 92.3 | 62.5 | sort-results-authz + sort-pipeline |
| `sort-results/[id]` | GET PATCH DELETE | 73.7 | 31.3 | sort-results-authz (authz only) + sort-pipeline |
| `sort-results/[id]/finalize` | POST | 50 | 12.5 | sort-results-authz (403 only) |
| `sort-results/[id]/items` | GET | 50 | 12.5 | sort-results-authz (403 only) |
| `sort-results/[id]/items/[rid]` | GET PATCH DELETE | 73.8 | 38.1 | sort-results-authz (belongs-to-parent) + sort-pipeline (DELETE) |
| `sort-results/[id]/items/[rid]/reset` | POST | 60 | 35.7 | sort-results-authz (belongs-to-parent only) |
| `sort-results/[id]/shares` | GET POST | 65.2 | 16.7 | sort-results-authz (403 + one scoped GET) |
| `sort-results/[id]/shares/[sid]` | GET PATCH DELETE | 64.1 | 31.6 | sort-results-authz (IDOR 404 only) |
| `sort-results/[id]/supersede` | POST | 0 | 0 | **none** (no integration imports it) |

**Conclusion (overturns the initial survey):** there are *no* clean mechanical deletes — a mocked sibling reaches every branch (fake repos make happy + error both run), while integration today reaches mostly the guard branches. Each task must add happy-path + error coverage to match what the sibling covered, then delete. KEEP-UNIT is only `pool/upload` (pure token-gen, no DB).

---

## Shared Recipe (every integration task uses this)

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow /* + others as needed */ } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
// ...repos you assert against...

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace BOTH @/lib/auth exports from one spy (spread/importActual pulls nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));
// Blob routes ONLY:
// const { mockPut, mockDel } = vi.hoisted(() => ({ mockPut: vi.fn(), mockDel: vi.fn() }));
// vi.mock("@vercel/blob", () => ({ put: mockPut, del: mockDel, list: vi.fn().mockResolvedValue({ blobs: [], hasMore: false }) }));

import { /* GET, POST, ... */ } from "@/app/api/<route>/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("<route> (route -> repo -> DB)", () => {
  let ownerId: string;
  beforeEach(async () => { await resetDb(); vi.clearAllMocks(); ownerId = await seedBaseline(); });
  afterAll(async () => { await closeDb(); });
  // ...cases...
});
```

**Calling a handler:** handlers take `(req: Request, ctx?: { params })`. Build requests with `new Request("http://localhost/x", { method, headers: {"content-type":"application/json"}, body: JSON.stringify(body) })` and pass `{ params: { id, ... } }` as the 2nd arg. Cast `as any` on req/ctx to satisfy the Next types (the blueprint does this).

**Authz matrix every protected route asserts** (vary ONLY `mockGetSession`):
- **401** — `mockGetSession.mockResolvedValue(null)` (or `{}`): unauthenticated → 401.
- **403** — a real authenticated user with no access (non-member / wrong-role / not-the-curator): forbidden, and the target row is UNCHANGED (assert via repo read).
- **404** — authenticated owner, absent/foreign id (belongs-to-parent): not found, no information leak.
- **happy** — the entitled principal: 2xx **and** a real DB-state assertion (row created/updated/deleted, read back via a repo).
- **400/error** — invalid body / wrong confirm / bad enum: 400, nothing mutated.

**Seed helpers available in `e2e/fixtures/seed.ts`:** `seedBaseline()→ownerId`, `seedBareCollection(ownerId)→collectionId`, `seedFullCollection(ownerId)→{collectionId,name,memberId,itemAId,itemBId,sessionId}`, `seedUserRow(label)→userId`, `seedCollections`, `seedTriageScenario`, `seedSortScenario`, `seedJourneyScenario`, `seedRemovalScenario`, plus `FULL_SEED_HTTP_KEY_ACTIVE/SOFT`. Add new helpers here if a task needs a new shape (parameterize, don't inline-duplicate).

**Run a single integration file** (the shared Postgres is ALREADY UP on :5433; `run-db-tests.sh` appends `"$@"` to a hardcoded `src/lib/db`, so passing a file runs the whole tier — for fast single-file iteration drive vitest directly):
```bash
RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test \
  npx vitest run --no-file-parallelism src/lib/db/<file>.integration.test.ts
```
**Run the whole DB tier (serial, CI-style; manages its own container):**
```bash
RUN_DB_TESTS=1 bash e2e/fixtures/run-db-tests.sh
```

---

## Task ordering & deletions

Each task: (a) read the route handler(s) + any existing integration test that partially covers it; (b) TDD the integration cases (authz matrix + happy + error); (c) run the file green; (d) delete the named mocked sibling(s); (e) re-run the file + `npm run lint`; (f) commit. Tasks 1–7 are independent and may be reviewed independently; Task 8 is the gate.

---

### Task 1: Sessions routes

**Files:**
- Create: `src/lib/db/sessions-routes.integration.test.ts`
- Modify: `src/lib/db/triage-decision.integration.test.ts` (close the `decisions` branch gap: add happy-path POST that records a decision + a 400/invalid-body case if not present)
- Delete: `src/app/api/sessions/route.test.ts`, `src/app/api/sessions/[id]/route.test.ts`, `src/app/api/sessions/[id]/decisions/route.test.ts`
- Handlers under test: `sessions` POST; `sessions/[id]` GET/PATCH/DELETE.

**Interfaces:**
- Consumes: `seedBaseline`, `seedBareCollection`, `seedUserRow`, `mockGetSession` recipe.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Read** `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/route.ts`, the deleting siblings, and `src/lib/db/triage-decision.integration.test.ts`. Note the exact authz rule each handler enforces (member-or-owner? curator-scope `session.curatorId`? `canSort`?) and the 400 validation (e.g. missing `collectionId`).
- [ ] **Step 2: Write failing tests** in `sessions-routes.integration.test.ts` covering, for `POST /api/sessions`: 401 unauth; 403 non-member of `collectionId`; 400 missing `collectionId`; happy → 201/200 with a real `sessions` row whose `curatorId === caller` (read back via `SessionRepository`). For `sessions/[id]` GET/PATCH/DELETE: 401; 403 non-curator/non-member; 404 absent id; happy GET returns the session; happy PATCH mutates and persists; happy DELETE removes it (assert via repo: present before, gone after).
- [ ] **Step 3: Run, verify FAIL** (handlers not yet imported / assertions unmet):
  `RUN_DB_TESTS=1 bash e2e/fixtures/run-db-tests.sh src/lib/db/sessions-routes.integration.test.ts` → expect failures (or, if all pass immediately, tighten an assertion until one fails, then proceed — a test that never failed proves nothing).
- [ ] **Step 4: Make green** — fix imports/seed/assertions until the file passes. Do NOT change product code; if a handler genuinely misbehaves on an authz path, PIN current behavior and file a bead (do not fix — that is the pv9 epic).
- [ ] **Step 5: Close decisions gap** in `triage-decision.integration.test.ts` — add the missing happy/error branch(es) for `decisions` POST so its branch% rises (target: the sibling's branches are reproduced). Run that file green.
- [ ] **Step 6: Delete** the three sibling files listed above.
- [ ] **Step 7: Run** the new file + `triage-decision` green again, then `npm run lint`.
- [ ] **Step 8: Commit** `test(sessions): real-DB integration for sessions routes; drop mocked siblings (Phase 3)`.

---

### Task 2: Collection items + top-level item routes

**Files:**
- Create: `src/lib/db/collection-items-routes.integration.test.ts`
- Delete: `src/app/api/collections/[id]/items/route.test.ts`, `src/app/api/items/[id]/route.test.ts`
- Handlers: `collections/[id]/items` GET/POST; `items/[id]` GET/PATCH/DELETE.

**Interfaces:**
- Consumes: `seedBaseline`, `seedBareCollection`, `seedFullCollection`, `ItemRepository`.

- [ ] **Step 1: Read** `src/app/api/collections/[id]/items/route.ts`, `src/app/api/items/[id]/route.ts`, and both deleting siblings. Note: the top-level `items/[id]` is the route a Phase-2 bead flagged as requireAuth-only IDOR (purses-3al) — PIN the current behavior (e.g. a non-member CAN read today), do not fix it; assert what it actually does and add a `// purses-3al: pins current (gap) behavior` comment.
- [ ] **Step 2: Write failing tests.** `collections/[id]/items`: GET 401/403-non-member/200-lists-real-items (seed 2 via `ItemRepository`, assert count); POST 401/403/400-invalid-body/201-creates-row (read back). `items/[id]`: GET 401 + the **404-not-500** regression for an absent id (this is the case the sibling pinned) + 200 for a present item; PATCH happy + authz-as-implemented; DELETE happy + authz-as-implemented (present before / gone after).
- [ ] **Step 3: Run, verify FAIL.**
- [ ] **Step 4: Make green** (pin, don't fix, any authz gap).
- [ ] **Step 5: Delete** the two siblings.
- [ ] **Step 6: Run green + `npm run lint`.**
- [ ] **Step 7: Commit** `test(items): real-DB integration for collection-items + items/[id]; drop mocked siblings (Phase 3)`.

---

### Task 3: Collection invitations route

**Files:**
- Create: `src/lib/db/collection-invitations-routes.integration.test.ts`
- Delete: `src/app/api/collections/[id]/invitations/route.test.ts`
- Handlers: `collections/[id]/invitations` GET/POST.

**Interfaces:**
- Consumes: `seedBaseline`, `seedBareCollection`, `seedUserRow`, `InvitationRepository`, `MembershipRepository`.

- [ ] **Step 1: Read** `src/app/api/collections/[id]/invitations/route.ts` + the sibling. Note who may list/create (owner? `canInviteMembers`?), the 400 validation (missing email / bad permissions), and whether email send is a no-op stub (it is — `invitations.ts:91`; no mock needed).
- [ ] **Step 2: Write failing tests.** GET: 401; 403 non-member (or non-`canInviteMembers`, per the handler); 200 lists this collection's invitations only (seed 1 here + 1 on another collection; assert scoping). POST: 401; 403 non-entitled; 400 missing/invalid email; happy → creates a real `invitations` row (read back via `InvitationRepository`, assert `collectionId` + `email` + token present).
- [ ] **Step 3: Run, verify FAIL.**
- [ ] **Step 4: Make green** (pin any authz gap, e.g. purses-nj7 family).
- [ ] **Step 5: Delete** the sibling.
- [ ] **Step 6: Run green + `npm run lint`.**
- [ ] **Step 7: Commit** `test(invitations): real-DB integration for collection invitations; drop mocked sibling (Phase 3)`.

---

### Task 4: Members route

**Files:**
- Create: `src/lib/db/members-routes.integration.test.ts`
- Delete: `src/app/api/collections/[id]/members/[mid]/route.test.ts`
- Handlers: `collections/[id]/members/[mid]` GET/PATCH/DELETE.

**Interfaces:**
- Consumes: `seedBaseline`, `seedFullCollection` (gives a `memberId`), `seedUserRow`, `MembershipRepository`.

- [ ] **Step 1: Read** `src/app/api/collections/[id]/members/[mid]/route.ts` + the sibling. Note belongs-to-parent (the `[mid]` membership must belong to `[id]`), the role gate on PATCH/DELETE (`canManageCollection`?), and self-vs-other rules if any.
- [ ] **Step 2: Write failing tests.** Using `seedFullCollection(ownerId)` (has a curator `memberId`): GET 401/403-non-member/404-foreign-membership/200. PATCH 401/403-non-manager/404/200-mutates-role-or-flags (read back via `MembershipRepository`). DELETE 401/403/404/200-removes (present before, gone after). Add a belongs-to-parent 404: a membership id from a DIFFERENT collection under `[id]`.
- [ ] **Step 3: Run, verify FAIL.**
- [ ] **Step 4: Make green** (pin gaps; purses-55c family is about reads — do not fix).
- [ ] **Step 5: Delete** the sibling.
- [ ] **Step 6: Run green + `npm run lint`.**
- [ ] **Step 7: Commit** `test(members): real-DB integration for member management; drop mocked sibling (Phase 3)`.

---

### Task 5: Item-photo routes (blob)

**Files:**
- Create: `src/lib/db/item-photo-routes.integration.test.ts`
- Modify: `src/lib/db/file-route-authz.integration.test.ts` (close the item `/file` branch gap — add the missing 1–2 branches so deleting the sibling loses nothing)
- Delete: `src/app/api/collections/[id]/items/[itemId]/photos/route.test.ts`, `.../photos/[photoId]/route.test.ts`, `.../photos/[photoId]/set-hero/route.test.ts`, `.../photos/[photoId]/file/route.test.ts`
- Handlers: item `photos` POST (blob `put`), `photos/[photoId]` PATCH (rotate)/DELETE (blob `del`), `set-hero` POST, `photos/[photoId]/file` GET.

**Interfaces:**
- Consumes: `seedBaseline`, `seedFullCollection`, `ItemRepository`, `PhotoRepository`; **blob mock** (`put`, `del`).

- [ ] **Step 1: Read** the four route handlers + four siblings + `file-route-authz.integration.test.ts`. Note: `photos` POST validates file size + writes a `photos` row + calls `put`; `[photoId]` PATCH validates a rotation enum; DELETE calls `del` on the blob key + removes the row; `set-hero` flips `isHero` (only one hero per item). Mock `@vercel/blob` `put`→`{url}` and `del`.
- [ ] **Step 2: Write failing tests.** For each handler: 401/403-non-member/404-foreign-or-absent/happy + the route-specific branch:
  - POST photos: 400 oversize/invalid; happy → real `photos` row created, `put` called once.
  - PATCH rotate: 400 bad rotation value; happy → row's rotation persists.
  - DELETE photo: happy → row gone (present before) AND `del` called with the photo's `blobKey`.
  - set-hero: happy → target `isHero=true`, prior hero `isHero=false` (assert both via `PhotoRepository`).
- [ ] **Step 3: Run, verify FAIL.**
- [ ] **Step 4: Make green.** Add the missing `/file` branch(es) to `file-route-authz.integration.test.ts` (or cover `/file` here and delete its sibling either way). Pin any authz gap.
- [ ] **Step 5: Delete** the four siblings.
- [ ] **Step 6: Run** new file + `file-route-authz` green + `npm run lint`.
- [ ] **Step 7: Commit** `test(photos): real-DB integration for item-photo routes (blob-mock); drop mocked siblings (Phase 3)`.

---

### Task 6: Pool routes (blob) + keep pool/upload unit

**Files:**
- Create: `src/lib/db/pool-routes.integration.test.ts`
- Modify: `src/app/api/collections/[id]/pool/upload/route.test.ts` (KEEP-UNIT — trim to the token-generation + authz cases only; remove anything that belongs in integration)
- Delete: `src/app/api/collections/[id]/pool/group/route.test.ts`, `.../photos/reassign/route.test.ts`, `.../pool/photos/route.test.ts`, `.../pool/photos/[photoId]/file/route.test.ts`
- Handlers: `pool/photos` GET, `pool/group` POST, `photos/reassign` POST, `pool/photos/[photoId]/file` GET. **Keep** `pool/upload` POST as a unit (token-gen via `@vercel/blob/client` `handleUpload`, no DB write).

**Interfaces:**
- Consumes: `seedBaseline`, `seedFullCollection`, `PhotoRepository`, `ItemRepository`; **blob mock** where the route touches blob.

- [ ] **Step 1: Read** the four route handlers + four deleting siblings + `pool/upload` route + its sibling. A "pool photo" is `itemId === null`. `pool/group` merges pool photos into a new item; `photos/reassign` moves photos between items; `pool/photos` lists `itemId === null` photos; `/file` serves a pool photo (404 if the photo is assigned).
- [ ] **Step 2: Write failing tests** in `pool-routes.integration.test.ts`: for each handler, 401/403-non-member/404 + happy with a real DB-state assertion:
  - `pool/photos` GET: lists only `itemId === null` photos (seed one pooled + one assigned; assert only the pooled returns).
  - `pool/group` POST: 400 empty/invalid `photoIds`; happy → a new `items` row created and the named photos now point to it (assert via `PhotoRepository`).
  - `photos/reassign` POST: 400 invalid; happy → photos' `itemId` updated.
  - `pool/photos/[photoId]/file` GET: 404 for an assigned (non-pool) photo; happy serves the pooled one.
- [ ] **Step 3: Run, verify FAIL.**
- [ ] **Step 4: Make green.** Trim `pool/upload/route.test.ts` to keep ONLY: 401/403 (no `canAddPhotos`) and the happy token-generation case (assert `handleUpload` invoked / token shape). Confirm it still runs in the unit `gate` (it has no `RUN_DB_TESTS` gate — it is a plain unit test). Run it: `npm run test:ci -- src/app/api/collections/\[id\]/pool/upload`.
- [ ] **Step 5: Delete** the four pool siblings.
- [ ] **Step 6: Run** new integration file green + the trimmed unit green + `npm run lint`.
- [ ] **Step 7: Commit** `test(pool): real-DB integration for pool routes; keep upload token-gen unit; drop mocked siblings (Phase 3)`.

---

### Task 7: Sort-results happy + error branches; delete the 9 sort-results siblings

**Files:**
- Create: `src/lib/db/sort-results-pipeline.integration.test.ts` (happy + error branches not covered by `sort-results-authz` or `sort-pipeline`)
- Delete (all 9): `src/app/api/sort-results/route.test.ts`, `sort-results/[id]/route.test.ts`, `.../finalize/route.test.ts`, `.../items/route.test.ts`, `.../items/[rid]/route.test.ts`, `.../items/[rid]/reset/route.test.ts`, `.../shares/route.test.ts`, `.../shares/[sid]/route.test.ts`, `.../supersede/route.test.ts`
- Handlers: the whole `sort-results/**` subtree.

**Interfaces:**
- Consumes: `seedBaseline`, `SortResultRepository`, `SortResultItemRepository`, `SortResultShareRepository`, `ItemRepository`, `CollectionPreferenceItemRepository`.

- [ ] **Step 1: Read** `src/lib/db/sort-results-authz.integration.test.ts` (authz/belongs-to-parent already covered — do NOT duplicate) and `src/lib/db/sort-pipeline.integration.test.ts` (covers `createResult`, `[id]` PATCH/DELETE, `items/[rid]` DELETE happy). Read each of the 9 route handlers to enumerate the happy + error branches NOT yet executed (per the baseline table: finalize body/happy, items list happy, items/[rid] GET/PATCH happy, reset happy, shares GET/POST/[sid] happy, **supersede entirely**, and each route's 400/state-guard branch).
- [ ] **Step 2: Write failing tests** covering ONLY the uncovered branches:
  - `finalize` POST happy: draft → finalized (status persists, read back); 400/409 if already finalized or not draft (per handler).
  - `items` GET happy: returns the result's items in rank order.
  - `items/[rid]` GET happy; PATCH happy: manual bucket/rank override persists; 400 bad bucket/rank.
  - `items/[rid]/reset` POST happy: clears manual overrides (set one, reset, assert cleared).
  - `[id]` GET happy (returns the result); (PATCH/DELETE happy already in sort-pipeline — only add if a branch is still uncovered).
  - `shares` GET happy (already partly covered — add only the create/list branch that's missing); POST happy: creates a share row (read back); `shares/[sid]` PATCH happy (e.g. revoke status persists), DELETE happy (gone after).
  - `supersede` POST: 401/403/404 + state guard (must be finalized) + happy clone → a new draft result derived from the finalized one (assert the new row + that the original is unchanged).
- [ ] **Step 3: Run, verify FAIL.**
- [ ] **Step 4: Make green** (pin, don't fix, any gap).
- [ ] **Step 5: Delete** all 9 sort-results siblings.
- [ ] **Step 6: Run** `sort-results-pipeline` + `sort-results-authz` + `sort-pipeline` green + `npm run lint`.
- [ ] **Step 7: Commit** `test(sort-results): cover happy/error branches; drop 9 mocked siblings (Phase 3)`.

---

### Task 8: Gate — merged coverage, ratchet floor, verify, document

**Files:**
- Modify: `.github/workflows/ci.yml` (bump `--coverage.thresholds.lines=70` to the new floor)
- Modify: `.superpowers/sdd/progress.md` (mark Phase 3 DONE with the new merged %)

- [ ] **Step 1: Run the FULL merged coverage locally, CI-style.** Unit blob, DB blob, then merge:
  ```bash
  rm -rf coverage .vitest-reports
  npm run test:ci -- --coverage --reporter=blob --outputFile=.vitest-reports/blob-unit.json
  RUN_DB_TESTS=1 bash e2e/fixtures/run-db-tests.sh --coverage --reporter=blob --outputFile=.vitest-reports/blob-db.json
  npx vitest --merge-reports --coverage --coverage.reporter=json-summary --coverage.reporter=text-summary
  ```
  Record merged **lines%** from the summary.
- [ ] **Step 2: Verify NO regression.** Merged lines% MUST be ≥ 71.52 (the pre-Phase-3 baseline). If lower, a sibling's branch was dropped without replacement — find the regressed `route.ts` in `coverage/coverage-summary.json` (compare to baseline) and add the missing case to the relevant task's integration file before proceeding. **This is the convert-then-delete gate.**
- [ ] **Step 3: Ratchet the floor** in `.github/workflows/ci.yml` to `floor(new merged lines%)` (e.g. merged 74.x → set `--coverage.thresholds.lines=74`). Never set above the measured number.
- [ ] **Step 4: Confirm no skipped/orphaned tests.** `grep -rn "describe.skip\|it.skip\|it.only\|describe.only" src/lib/db` returns only the intended `describeDb` gate. Confirm the 25 sibling files are gone: `find src/app/api -name '*.test.ts'` lists only the kept `pool/upload` unit (+ any pure 400 units intentionally kept).
- [ ] **Step 5: Update ledger** `.superpowers/sdd/progress.md`: `Phase 3 — DONE (merged <x>%; floor <n>); converted N siblings, deleted 24, kept pool/upload unit.`
- [ ] **Step 6: Commit** `ci(coverage): ratchet floor to <n> after Phase 3 sibling rationalization`.

---

## Self-review notes

- **Spec coverage:** every Phase-3 item in the spec (delete dupes, convert non-dupes, keep 400-path + pool/upload unit, ratchet floor, merged-report-as-gate) maps to a task. The spec's "delete sort-results/** + photo-cascade dupes" is realized as Tasks 5/7 (convert-then-delete, because the empirical data showed they are NOT pure dupes).
- **Authz fixes are OUT of scope** (pv9 epic). Every task PINS current behavior and files/links a bead for any gap; no product code changes.
- **Type consistency:** seed helpers and repo class names match `e2e/fixtures/seed.ts` and `src/server/repositories/implementations/*` exactly.
- **DB serialization:** all integration files share the one Postgres; tasks are authored and verified one at a time (subagent-driven, sequential), never run in parallel.
