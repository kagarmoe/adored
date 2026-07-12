# PR 1 — Route async-params migration + oracle hardening (purses-9oxh.3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 42 dynamic API route handlers to Next 15-style async params AND flip the 39 route-invoking test files to `Promise.resolve(params)` — one atomic PR on Next 14 — so the Next 16 migration (PR 3 of the epic) becomes falsifiable. Rides: the corrected handoff + epic spec (already committed on this branch) and the CI cost tuning.

**Architecture:** Routes change `{ params }: { params: { id: string } }` → `{ params }: { params: Promise<{ id: string }> }` + `const { id } = await params` as the first statement of each handler. On Next 14 the runtime passes a plain object and `await` resolves it to itself, so every intermediate commit stays green. The test flip (Task 5) is the oracle moment: after it, any un-migrated route 404s where a test asserts 2xx.

**Tech Stack:** Next 14.2.35 (App Router), vitest 4, Playwright (tablet/WebKit only, PR #312), Postgres via Docker for `test:db`.

**Spec:** `docs/superpowers/specs/2026-07-12-deps-latest-epic-design.md` (PR 1 section). All invariants there apply; the load-bearing ones are restated per task below.

## Global Constraints

- **No hacky things** (owner, 2026-07-12): no `--force`/`--no-verify` without stated justification, no masking a failing gate, no shims. A required workaround gets a `ponytail:` comment naming its ceiling + a bead.
- **CI frugality (July):** all gates local first; exactly ONE push at the end (Task 8). Never push to re-trigger.
- **Diff-shape rule (spec):** in the 39 test files, changed lines match only `params: X` → `params: Promise.resolve(X)`; **zero `expect()` lines change**; zero edits to `PUBLIC_OR_SELF_KEYS`, the 403/404 predicate, or the exhaustiveness logic in `route-authz-enumeration.integration.test.ts` beyond params plumbing + the `importHandler` type (Task 6).
- **Page tests and pages are OUT OF SCOPE** — the 12 `page.test.tsx` files (101 call sites) and `page-authz-enumeration.integration.test.ts` migrate in the epic's PR 3 with the pages themselves.
- `tsc` is NOT a gate (96 pre-existing errors on main). `npm run build` is the typechecking gate.
- Commit per task; messages follow repo convention (`feat:`/`test:`/`ci:`/`docs:` prefixes).

## Measured inputs (workflow-verified 2026-07-12, 21 agents, 0 errors)

- **49 route files**: 42 dynamic with sync `params.<key>` reads (migrate), 6 static (no params — untouched), 1 better-auth destructured re-export `auth/[...all]` (never reads params, no annotation — untouched).
- **Param shapes:** 33× single key (`{id}` or `{token}`), 6× two keys, 3× three keys.
- **Test surface:** 39 route-invoking files = 36 `src/lib/db/*.integration.test.ts` (345 call sites) + 3 `src/app/**/route.test.ts` (9 call sites). 456 total bare-params sites repo-wide; 101 of them are page tests (PR 3).
- **Owner-2xx coverage: 77 route+method pairs, ZERO gaps** (adversarially verified; the two candidates — `auth/[...all]` GET/POST — are covered by `e2e/auth.setup.ts:70-83` and `e2e/auth.spec.ts:49-80`). The spec's required coverage statement for the PR body is: *complete, no gaps*.
- **CI anchors:** exact lines in Task 7.

---

### Task 0: Branch + pre-migration evidence capture

**Files:**
- Create: `/tmp/pr1-evidence/` (scratch, NOT committed)
- No repo files change in this task.

**Interfaces:**
- Produces: `/tmp/pr1-evidence/bare-params-before.txt` (N>0 proof), `/tmp/pr1-evidence/stranger-keys-before.txt` (sorted key set) — consumed by Tasks 5, 6, 8.

- [ ] **Step 1: Branch off the docs branch** (docs ride this PR — owner-approved)

```bash
cd /Users/kimberlygarmoe/repos/purseinator-app
git checkout docs/fix-deps-handoff
git checkout -b feat/9oxh3-async-params-oracle
```

- [ ] **Step 2: Capture the bare-params count on the ROUTE-INVOKING test surface (must be > 0 — the prove-it-can-fail discipline)**

```bash
mkdir -p /tmp/pr1-evidence
grep -rnE 'params:\s*\{' src/lib/db --include='*.integration.test.ts' > /tmp/pr1-evidence/bare-params-before.txt
grep -rnE 'params:\s*\{' src/app --include='route.test.ts' >> /tmp/pr1-evidence/bare-params-before.txt
wc -l /tmp/pr1-evidence/bare-params-before.txt
```

Expected: ~354 lines (345 + 9). If 0, STOP — the surface measurement is wrong.

- [ ] **Step 3: Capture the sorted stranger key-set + allowlist (pre)**

```bash
grep -oE 'c\("[^"]+",\s*"[A-Z]+"' src/lib/db/route-authz-enumeration.integration.test.ts | sort > /tmp/pr1-evidence/stranger-keys-before.txt
grep -oE '"[^"]+ [A-Z]+"' src/lib/db/route-authz-enumeration.integration.test.ts | sort > /tmp/pr1-evidence/allowlist-before.txt
wc -l /tmp/pr1-evidence/stranger-keys-before.txt /tmp/pr1-evidence/allowlist-before.txt
```

Expected: ≥50 stranger keys, ≥1 allowlist entries (exact counts recorded for the PR body).

- [ ] **Step 4: Baseline gates green before touching anything**

```bash
npm run lint && npm run test:ci
npm run test:db
```

Expected: lint 0 errors; test:ci all pass; test:db all pass (Docker self-managed by the script). Record counts.

### Task 1: Migrate the 23 `collections/**` route files

**Files (Modify, all 23):** `src/app/api/collections/[id]/{archive,audit,invitations,members,photos/reassign,pool/group,pool/photos,pool/upload,preferences/items,preferences/recalculate,purge,restore}/route.ts`, `src/app/api/collections/[id]/route.ts`, `src/app/api/collections/[id]/dispositions/route.ts`, `src/app/api/collections/[id]/dispositions/[itemId]/route.ts`, `src/app/api/collections/[id]/items/route.ts`, `src/app/api/collections/[id]/items/[itemId]/route.ts`, `src/app/api/collections/[id]/items/[itemId]/photos/route.ts`, `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/{route,file/route,set-hero/route}.ts`, `src/app/api/collections/[id]/members/[mid]/route.ts`, `src/app/api/collections/[id]/pool/photos/[photoId]/file/route.ts`

**Interfaces:**
- Produces: every handler in these files has signature `(request: NextRequest, { params }: { params: Promise<{ <keys>: string }> })` and `const { <keys> } = await params;` as its first body statement (inside the existing `try` where one wraps the body). All subsequent `params.<key>` reads become the destructured local.

The transform, per shape class — apply EXACTLY this pattern:

**Single key** (e.g. `src/app/api/collections/[id]/archive/route.ts`):

```ts
// BEFORE
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCapability(db, params.id, user.id, "collection:manage");
    ...

// AFTER
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCapability(db, id, user.id, "collection:manage");
    ...
```

**Multi key** (e.g. `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/route.ts`):

```ts
// BEFORE
{ params }: { params: { id: string; itemId: string; photoId: string } }
...
    const access = await requireApiCapability(db, params.id, user.id, "photo:delete");
    ... PhotoController.fromDb(db).deletePhoto(params.id, params.itemId, params.photoId)

// AFTER
{ params }: { params: Promise<{ id: string; itemId: string; photoId: string }> }
...
    const { id, itemId, photoId } = await params;
    const access = await requireApiCapability(db, id, user.id, "photo:delete");
    ... PhotoController.fromDb(db).deletePhoto(id, itemId, photoId)
```

**Closure case** (`src/app/api/collections/[id]/pool/upload/route.ts` — `params.id` is read inside `handleUpload` callbacks): destructure `const { id } = await params;` BEFORE the `handleUpload` call; the callbacks close over `id`. Do not await inside the callbacks.

**Leave untouched:** `export const runtime`, `export const maxDuration`, `export const MAX_SERVER_UPLOAD_BYTES` (segment config / non-handler exports in 6 of these files).

- [ ] **Step 1: Apply the transform to all 23 files** (Edit tool per file; no sed scripts — reviewable diffs)
- [ ] **Step 2: Verify no sync reads remain in the group**

```bash
grep -rn 'params\.' 'src/app/api/collections' --include='route.ts' | grep -v 'await params' ; echo "exit=$?"
```

Expected: no output, exit=1 (grep found nothing).

- [ ] **Step 3: Tests still green (await on plain object no-ops — this proves non-breakage, not migration completeness)**

```bash
npm run test:ci -- src/app/api/collections
npm run test:db -- collection
```

Expected: PASS (bare-params tests still work against awaited handlers).

- [ ] **Step 4: Commit**

```bash
git add 'src/app/api/collections'
git commit -m "feat(routes): async params across collections/** (23 files, purses-9oxh.3)"
```

### Task 2: Migrate the 11 `items/invitations/sessions/shared-results` route files

**Files (Modify, all 11):** `src/app/api/invitations/[id]/route.ts`, `src/app/api/invitations/[id]/resend/route.ts`, `src/app/api/items/[id]/{route,purge/route,remove-from-sorts/route,restore/route}.ts`, `src/app/api/sessions/[id]/{route,restore/route,decisions/route,decisions/batch/route}.ts`, `src/app/api/shared-results/[token]/route.ts`

Same transform as Task 1. `shared-results/[token]` destructures `const { token } = await params;`. The two decisions routes keep their `runtime`/`maxDuration` exports untouched.

- [ ] **Step 1: Apply the transform to all 11 files**
- [ ] **Step 2: Verify group clean:** same grep as Task 1 Step 2 over `src/app/api/{invitations,items,sessions,shared-results}` — expected no output.
- [ ] **Step 3: Targeted tests green:** `npm run test:db -- invitations items sessions shared` → PASS.
- [ ] **Step 4: Commit** — `feat(routes): async params across items/invitations/sessions/shared-results (11 files)`

### Task 3: Migrate the 8 `sort-results/**` route files

**Files (Modify, all 8):** `src/app/api/sort-results/[id]/{route,finalize/route,supersede/route,items/route,items/[rid]/route,items/[rid]/reset/route,shares/route,shares/[sid]/route}.ts`

Same transform. Two-key files destructure `const { id, rid } = await params;` / `const { id, sid } = await params;`. These routes carry the belongs-to-parent IDOR checks — the destructured locals must keep the SAME names (`id`, `rid`, `sid`) so guard call sites change mechanically (`params.rid` → `rid`), never semantically.

- [ ] **Step 1: Apply the transform to all 8 files**
- [ ] **Step 2: Verify group clean:** grep over `src/app/api/sort-results` — expected no output.
- [ ] **Step 3: Targeted tests green:** `npm run test:db -- sort-results` → PASS (includes the cross-parent IDOR suites).
- [ ] **Step 4: Whole-surface sweep — zero sync params reads anywhere:**

```bash
grep -rn 'params\.' src/app/api --include='route.ts' | grep -v 'await params'; echo "exit=$?"
```

Expected: no output, exit=1.

- [ ] **Step 5: Commit** — `feat(routes): async params across sort-results/** (8 files) — route surface complete (42/42)`

### Task 4: Full-surface build proof on Next 14

**Files:** none change.

- [ ] **Step 1: Clean build**

```bash
npm run build
```

Expected: build succeeds. This type-validates ALL 42 migrated routes via `.next/types` — the full-surface version of the one-route spike. (Note the asymmetry: Next 14 accepts BOTH forms, so build proves the new form is legal, not that no file was missed — Step 4 of Task 3 proved that; the oracle in Task 5 enforces it behaviorally.)

- [ ] **Step 2: No commit (nothing changed); record build output tail in `/tmp/pr1-evidence/build-after-routes.txt`**

### Task 5: Flip the 39 test files to `Promise.resolve(params)` — the oracle moment

**Files (Modify):** all 36 `src/lib/db/*.integration.test.ts` that pass `params:` (list from `/tmp/pr1-evidence/bare-params-before.txt`), plus `src/app/api/collections/[id]/pool/upload/route.test.ts`, `src/app/api/sessions/[id]/decisions/route.test.ts`, `src/app/api/shared-results/[token]/route.test.ts`. **NOT** the 12 `page.test.tsx` files; **NOT** `page-authz-enumeration.integration.test.ts`.

**Interfaces:**
- Consumes: migrated routes (Tasks 1–3).
- Produces: every route-handler invocation passes `{ params: Promise.resolve({...}) }`.

The transform — ONLY this, per the diff-shape rule:

```ts
// BEFORE
res = await handler(req, { params: { id: collectionId } });
// AFTER
res = await handler(req, { params: Promise.resolve({ id: collectionId }) });
```

Where a test builds a ctx object separately (`const ctx = { params: {...} }`), wrap at the same site: `const ctx = { params: Promise.resolve({...}) }`. No `expect()` line changes. No changes to `PUBLIC_OR_SELF_KEYS`, `buildStrangerCases` case keys, or status assertions.

- [ ] **Step 1: Flip all ~354 call sites across the 39 files** (Edit with replace_all per file where the pattern is uniform; verify per file with `git diff --stat`)
- [ ] **Step 2: Diff-shape self-check — the only changed tokens are params wrappers**

```bash
git diff -U0 -- src/lib/db 'src/app/**/route.test.ts' | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE 'params' ; echo "exit=$?"
```

Expected: no output, exit=1 (every changed line contains `params`).

- [ ] **Step 3: Run the full DB tier — THIS is the falsifiable moment**

```bash
npm run test:db
```

Expected: ALL PASS. A failure here = a route missed in Tasks 1–3 (its handler received a real Promise and 404'd where 2xx is asserted) — fix the ROUTE, never the test.

- [ ] **Step 4: Unit tier green:** `npm run test:ci` → PASS.
- [ ] **Step 5: Post-flip exhaustiveness — zero bare-params sites remain on the route-invoking surface**

```bash
grep -rnE 'params:\s*\{' src/lib/db --include='*.integration.test.ts' | grep -v 'Promise.resolve' | grep -v 'page-authz-enumeration' > /tmp/pr1-evidence/bare-params-after.txt; wc -l < /tmp/pr1-evidence/bare-params-after.txt
grep -rnE 'params:\s*\{' src/app --include='route.test.ts' | grep -v 'Promise.resolve' | wc -l
```

Expected: 0 and 0. Save outputs for the PR body (paired with the >0 “before” from Task 0 — the gate demonstrably could fail).

- [ ] **Step 6: Commit** — `test(oracle): route-invoking tests pass Promise params — migration now falsifiable (39 files)`

### Task 6: Tighten `importHandler` + key-set evidence

**Files:**
- Modify: `src/lib/db/route-authz-enumeration.integration.test.ts:587-601` (the `importHandler` signature and return type ONLY)

- [ ] **Step 1: Tighten the ctx type**

```ts
// BEFORE (line 591 and the cast at 601)
): Promise<(req: NextRequest, ctx?: { params: Record<string, string> }) => Promise<Response>> {
// AFTER
): Promise<(req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>> {
```

(both occurrences — the declared return type and the `as` cast). The invocation at line 767 was already flipped in Task 5.

- [ ] **Step 2: Key-set diff (post) — must be byte-identical to Task 0's capture**

```bash
grep -oE 'c\("[^"]+",\s*"[A-Z]+"' src/lib/db/route-authz-enumeration.integration.test.ts | sort > /tmp/pr1-evidence/stranger-keys-after.txt
diff /tmp/pr1-evidence/stranger-keys-before.txt /tmp/pr1-evidence/stranger-keys-after.txt && echo IDENTICAL
grep -oE '"[^"]+ [A-Z]+"' src/lib/db/route-authz-enumeration.integration.test.ts | sort | diff /tmp/pr1-evidence/allowlist-before.txt - && echo ALLOWLIST-IDENTICAL
```

Expected: `IDENTICAL` and `ALLOWLIST-IDENTICAL`. Any diff = an invariant violation; revert the offending edit.

- [ ] **Step 3: Enum suite green:** `npm run test:db -- route-authz-enumeration` → PASS, with its ≥40/≥50 floors untouched. Record the exact discovered/stranger counts from the run output into `/tmp/pr1-evidence/` for the PR body.
- [ ] **Step 4: Commit** — `test(oracle): importHandler ctx type requires Promise params`

### Task 7: CI cost tuning + auth:verify gate + CLAUDE.md correction

**Files:**
- Modify: `.github/workflows/ci.yml` (anchors below), `CLAUDE.md:82`

All anchors workflow-verified against the current file:

- [ ] **Step 1: `auth:verify` into the gate job** — insert after the Lint step (line 36):

```yaml
      - name: Auth wiring check
        run: npm run auth:verify
```

- [ ] **Step 2: Drop chromium** — line 362 `npx playwright install --with-deps chromium webkit` → `npx playwright install --with-deps webkit`; update the stale comment at line 360 to: `# Tablet (iPad) is WebKit — the only CI viewport since PR #312.`
- [ ] **Step 3: Playwright browser cache** — insert before the install step (line 361):

```yaml
      - name: Cache Playwright browsers
        uses: actions/cache@v5
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('package-lock.json') }}
```

(keep the install step as-is — it no-ops on a warm cache and still installs OS deps).

- [ ] **Step 4: `.next/cache` in gate (before line 51) and e2e (after `npm ci`, line 358):**

```yaml
      - name: Cache Next.js build cache
        uses: actions/cache@v5
        with:
          path: .next/cache
          key: ${{ runner.os }}-nextjs-${{ hashFiles('package-lock.json') }}-${{ hashFiles('src/**') }}
          restore-keys: |
            ${{ runner.os }}-nextjs-${{ hashFiles('package-lock.json') }}-
```

- [ ] **Step 5: `timeout-minutes` on all 7 jobs** — after each `runs-on: ubuntu-latest`: gate 15 (line 23), db-tests 10 (line 67), coverage 5 (line 125), changes 5 (line 170), e2e 25 (line 348), bench 10 (line 485), deploy-report 10 (line 534).
- [ ] **Step 6: CLAUDE.md:82** — change `Gates (the pre-push hook mirrors these):` to `Gates (CI runs all five; the pre-push hook mirrors lint + test:ci + build):`
- [ ] **Step 7: Workflow lints clean:** `npx --yes actionlint .github/workflows/ci.yml` → no errors (actionlint runs via npx, nothing installed).
- [ ] **Step 8: Commit** — `ci: auth:verify gate; webkit-only install, playwright+next caches, job timeouts (July cost restraint)`

### Task 8: Whole-branch gates, evidence assembly, single push + PR

- [ ] **Step 1: Full local gate stack, in order**

```bash
npm run lint && npm run test:ci && npm run auth:verify && npm run build
npm run test:db
./e2e/fixtures/test-db.sh up && npx playwright test && ./e2e/fixtures/test-db.sh down
```

Expected: everything green. e2e runs because `src/app/**` changed → the `ui` filter fires in CI; running it locally first is the frugality rule.

- [ ] **Step 2: PR-boundary steps:** run `/sync-docs` (docs/API.md maps to `src/app/api/**` — the params plumbing changes no documented contract, but the doc-check hook will demand the touch; update API.md's params-typing note honestly rather than `--no-verify`), then `graphify update .`
- [ ] **Step 3: Whole-branch adversarial review** (QA/Test + Architect + Security personas per the spec) — findings folded via receiving-code-review BEFORE the push.
- [ ] **Step 4: Single push + PR.** PR body includes: the atomicity rationale (2 sentences), owner-2xx statement (77 pairs, 0 gaps, workflow-verified), before/after bare-params counts (~354 → 0), key-set diff verdict (IDENTICAL), exact enum counts, revert-coupling note ("on revert, preserve the auth:verify CI step"), and the CI-tuning summary. No screenshots (no UI change).
- [ ] **Step 5: After merge confirmed:** `/close-out` — close `purses-9oxh.3`, keep the epic open (six beads remain).

## Self-review (writing-plans checklist)

- **Spec coverage:** atomic both-halves ✓ (Tasks 1–3 + 5); full-surface build proof ✓ (Task 4); prove-it-can-fail ✓ (Task 0 Step 2 vs Task 5 Step 5); key-set diff ✓ (Task 6); frozen allowlist/predicate ✓ (diff-shape check, Task 5 Step 2); owner-2xx statement ✓ (measured: 0 gaps); auth:verify CI + CLAUDE.md ✓ (Task 7); CI tuning 4 items ✓ (Task 7); page surface excluded ✓; docs ride ✓ (Task 0 branches from the docs branch).
- **Placeholder scan:** none — every step has exact code/commands/paths.
- **Type consistency:** destructured local names match param keys everywhere (`id`/`itemId`/`photoId`/`mid`/`rid`/`sid`/`token`); `importHandler` Promise type matches the Task 5 invocation shape.
