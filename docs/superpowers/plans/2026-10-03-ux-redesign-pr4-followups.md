# UX Redesign PR 4 — Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close six follow-up beads of epic purses-w7ss (.5, .6, .7, .8, .12, .16): a gentle note before a revision discards hand-placed pins, every draft writer under the curator lock, batched `saveAndShare` writes, a migration `lock_timeout`, one-row-per-item cover reads, and creation-ordered ids.

**Architecture:** Service/repository changes in `SortResultService`, `SortResultItemRepository`, `DecisionEventRepository`, `PhotoRepository`; one runtime option in `scripts/migrate.ts`; a module-level ULID monotonic factory in `src/lib/id.ts`; one client island (`MakeRevisionButton`) gains a confirm step driven by a new server-side 409 from the supersede route (the server owns the check, inside the curator lock).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, drizzle-orm ^0.45.2 (postgres-js), Postgres 16, vitest 4 (+ `RUN_DB_TESTS=1` DB tier), Playwright, `ulid` 3.0.2 (installed; already exports `monotonicFactory`, used by `generateOrderedIdFactory`).

**Spec:** `docs/superpowers/specs/2026-10-01-adored-ux-redesign-design.md` (§4.3 open draft, §4.4 Save and share / Make a revision). Review context: `docs/superpowers/plans/2026-10-01-ux-redesign-pr2-sort.md`, `docs/superpowers/plans/2026-10-02-ux-redesign-pr3-lists-home.md`, `docs/superpowers/HANDOFF-2026-10-01-ux-redesign.md`. Beads: `bd show purses-w7ss.{5,6,7,8,12,16}`.

## Global Constraints

- Scope is exactly the six beads. No schema migration (none needed: `DISTINCT ON`, `lock_timeout`, multi-row insert and id generation are query/runtime only). Do not touch `drizzle/`.
- Never switch branches; work on `feat/ux-redesign-pr4-followups`. Never commit to `main`. Stage files by name (never `git add -A`; `.beads.gate.lock`, `.codex/`, `pr-screenshots/` stay unstaged).
- TDD per task: failing test first, then minimal code. Where a task is a behaviour-preserving refactor (Task 2), the plan says so and names the characterization tests that must stay green.
- DB tier only for real crossings (advisory locks, SQL semantics, lock waits, route authz), one per route/query; branches at unit level. Every new test runs in CI (unit tests in `npm run test:ci`; DB tests are `*.integration.test.ts` under `src/lib/db/`, gated by `RUN_DB_TESTS=1`, run by the CI `db-tests` job).
- Copy follows `TONE.md`: from the person's side, short, plain, kind; no exclamation marks; never count against the person; destructive actions sober; red only for the irreversible.
- Next.js conventions (CLAUDE.md): mutations via `src/app/api/` routes; client islands only where interactive; native `fetch`; no `any` in app code (tests already use `as any` for route ctx — keep to that precedent).
- Implementer subagents must NOT run `graphify update .` (PR-boundary step, Task 7 only).
- Single DB test file locally (container on :5433 via `bash e2e/fixtures/test-db.sh up`):
  `RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test npx vitest run --no-file-parallelism <file>`
  (`npm run test:db` always runs the whole tier; DB files must run serially.)
- Never pipe a test/gate command through `tail`/`head` (masks exit codes).

## Review Focus

1. **Revision when the open draft's pins already match the saved order** (e.g. right after Save, which carries pins into a fresh draft at their saved slots) → no note; the revision opens straight away. Pinned by the `pinsLostToRevision` unit test in Task 6.
2. **Pins changed in another tab after the saved-result page rendered** → the server still refuses to discard them silently (409 with the live count). The check runs inside the curator lock, so the DB route test in Task 6 is the proof; the client never computes the count.
3. **Two non-hero photos with identical `created_at`** → the cover is deterministic (lower id), on both the item and collection variants. Pinned by the tie tests in Task 2.
4. **A curator pins while the owner's purge-prep runs** → the purge-prep waits for the curator's writer instead of deleting pin rows under it. Pinned by the lock-wait DB test in Task 4.
5. **A migration waiting on a lock held by live traffic** → fails within ~5 s with a clear "lock timeout" error instead of queueing every read behind it. Pinned by the DB test in Task 3.

---

## File Structure

| File | Change | Task |
|---|---|---|
| `src/lib/id.ts` | `generateId` uses one module-level `monotonicFactory()` | 1 |
| `src/lib/id.test.ts` | same-ms strict-increase test for `generateId` | 1 |
| `src/lib/db/preference-bulk-upsert.integration.test.ts` | pin item `createdAt` in "reordering three loved items" | 1 |
| `src/server/repositories/implementations/PhotoRepository.ts` | `findCoverPhotosByItemIds` / `findCoverPhotosByCollectionIds` → `selectDistinctOn` | 2 |
| `src/lib/db/cover-photos.integration.test.ts`, `src/lib/db/collection-cover-photos.integration.test.ts` | `created_at` tie → lower id test | 2 |
| `scripts/migrate.ts` | `connection: { lock_timeout: 5_000 }` | 3 |
| `src/lib/db/migrate-lock-timeout.integration.test.ts` | new: migrator fails fast on a held lock | 3 |
| `src/server/services/SortResultService.ts` | purge-prep under `lockCollectionCurators`; delete dead `updateResultName`; comment update | 4 |
| `src/app/api/items/[id]/remove-from-sorts/route.ts` | pass `item.collectionId` | 4 |
| `src/lib/db/remove-from-sorts.integration.test.ts` | lock-wait test | 4 |
| `src/server/repositories/implementations/SortResultItemRepository.ts` | `createMany` | 5 |
| `src/server/repositories/implementations/DecisionEventRepository.ts` | `findBySessions` | 5 |
| `src/server/services/decision-log.ts` (+ new `decision-log.test.ts`) | one decisions query | 5 |
| `src/server/services/SortResultService.ts` | `saveAndShare` rebuild + kept pins via `createMany` | 5 |
| `src/server/services/SortResultService.test.ts`, `PreferenceStateService.test.ts`, `ScoringService.test.ts` | new happy-path test; mocks gain `findBySessions` | 5 |
| `src/server/services/sortResultMaterialization.ts` (+ test) | `pinsLostToRevision` | 6 |
| `src/server/services/SortResultService.ts` | `RevisionDiscardsPinsError`; `supersedeResult(id, { discardPins })` | 6 |
| `src/server/api/http-errors.ts` | map `RevisionDiscardsPinsError` → 409 `{ error, code, pinCount }` | 6 |
| `src/app/api/sort-results/[id]/supersede/route.ts` | optional body `{ discardPins: true }` | 6 |
| `src/features/results/MakeRevisionButton.tsx` (+ new test) | inline note + confirm | 6 |
| `src/lib/db/ranking-save-route.integration.test.ts` | 409 → confirm → 201 route test; existing shared-draft test passes `discardPins` | 6 |
| `docs/DATABASE.md`, `docs/DEPLOYMENT.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/doc-ownership.md` | docs sync | 7 |

---

### Task 1: Creation-ordered ids — purses-w7ss.16

**Files:**
- Modify: `src/lib/id.ts:1-5`
- Test: `src/lib/id.test.ts`
- Modify: `src/lib/db/preference-bulk-upsert.integration.test.ts:54-62`

**Interfaces:**
- Consumes: nothing.
- Produces: `generateId(prefix: string): string` — unchanged signature and format (`<prefix>_<26 lowercase Crockford>`), now strictly increasing within one process. `generateOrderedIdFactory()` is unchanged.

- [ ] **Step 1: Write the failing test** — append to `src/lib/id.test.ts`:

```ts
describe("generateId", () => {
  it("ids minted in the same millisecond strictly increase, so createdAt ties break in creation order (purses-w7ss.16)", () => {
    const ids = Array.from({ length: 200 }, () => generateId("item")); // a tight loop guarantees same-ms runs
    for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
    const t = new Date(1000);
    expect(compareByCreatedAtThenId({ id: ids[0], createdAt: t }, { id: ids[1], createdAt: t })).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/id.test.ts`
Expected: FAIL in "ids minted in the same millisecond strictly increase" (plain `ulid()` randomizes within a millisecond).

- [ ] **Step 3: Minimal implementation** — `src/lib/id.ts`, replace the `generateId` function:

```ts
// One process-wide monotonic factory: base ulid() randomizes within a millisecond,
// and items/collections carry JS-ms createdAt, so same-ms rows tied and
// compareByCreatedAtThenId ordered them by chance (purses-w7ss.16). Monotonic
// within this process only — rows minted concurrently on two instances stay
// unordered, which is honest: they were concurrent.
const nextUlid = monotonicFactory();

export function generateId(prefix: string): string {
  return `${prefix}_${nextUlid().toLowerCase()}`;
}
```

Leave `generateOrderedIdFactory` and its comment as they are, except change the comment's last sentence from "One factory per request/batch; never module-level shared." to "One factory per request/batch; generateId's process-wide factory gives no per-batch guarantee across instances." (the batch factory stays — removing it is out of scope).

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/id.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Pin the second observed flake** — in `src/lib/db/preference-bulk-upsert.integration.test.ts`, test "reordering three loved items yields dense 0,1,2 ranks and no 23505", right after `const c = await itemRepo.create({ collectionId });` add (the `orderRank` sequence reads items by `(createdAt, id)`, same pattern as `decision-batch.integration.test.ts` case 4):

```ts
    // orderRank seeds from (createdAt, id); pin distinct createdAt so the seed order is A, B, C.
    for (const [i, item] of [a, b, c].entries()) {
      await db.update(itemsTable).set({ createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) }).where(eq(itemsTable.id, item.id));
    }
```

and add the imports `import { eq } from "drizzle-orm";` (merge with the existing `sql` import: `import { eq, sql } from "drizzle-orm";`) and `import { itemsTable } from "@/lib/db/schema";`.

- [ ] **Step 6: Run the DB file**

Run: `RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test npx vitest run --no-file-parallelism src/lib/db/preference-bulk-upsert.integration.test.ts`
Expected: PASS. Run it 3 times; all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/id.ts src/lib/id.test.ts src/lib/db/preference-bulk-upsert.integration.test.ts
git commit -m "fix(ids): monotonic ULIDs so same-ms rows sort in creation order (purses-w7ss.16)"
```

---

### Task 2: One cover row per item / collection — purses-w7ss.12

Behaviour-preserving refactor: the semantics (hero first, else earliest `created_at`, then `id`; soft-deleted excluded; pooled excluded for collections) are already pinned by the existing DB tests in both files. The one new contract — a `created_at` tie resolves to the lower id — is written first and passes on both the old and new code; it guards the `ORDER BY` tail that `DISTINCT ON` now depends on. No red step is possible for a pure row-count reduction without a query-counting harness, which the project does not have and this task does not add.

**Files:**
- Modify: `src/server/repositories/implementations/PhotoRepository.ts:75-139`
- Test: `src/lib/db/cover-photos.integration.test.ts`, `src/lib/db/collection-cover-photos.integration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: unchanged signatures `findCoverPhotosByItemIds(itemIds: string[]): Promise<Map<string, Photo>>`, `findCoverPhotosByCollectionIds(collectionIds: string[]): Promise<Map<string, Photo>>`.

- [ ] **Step 1: Write the tie test (item variant)** — in `cover-photos.integration.test.ts`, inside the describe, after "falls back to the earliest photo when there is no hero". The file's `seedPhoto` stamps a distinct `created_at`; stamp both photos to one instant afterwards:

```ts
  it("breaks a created_at tie by the lower id when there is no hero", async () => {
    const item = await itemRepo().create({ collectionId });
    const p1 = await seedPhoto(item.id, "tie-1", false);
    const p2 = await seedPhoto(item.id, "tie-2", false);
    const { db } = getTestDb();
    await db.execute(sql`UPDATE photos SET created_at = '2026-01-01T00:00:00Z'::timestamptz WHERE id IN (${p1.id}, ${p2.id})`);
    const covers = await photoRepo().findCoverPhotosByItemIds([item.id]);
    expect(covers.get(item.id)!.id).toBe([p1.id, p2.id].sort()[0]);
  });
```

(Adjust `itemRepo().create(...)` to match how the file's other tests create items — read the existing "falls back to the earliest photo" test and mirror it.)

- [ ] **Step 2: Write the tie test (collection variant)** — same shape in `collection-cover-photos.integration.test.ts` after "falls back to the earliest assigned photo when there is no hero", using that file's own seeding helper, asserting `findCoverPhotosByCollectionIds([collectionId]).get(collectionId)!.id` is the lower of the two ids.

- [ ] **Step 3: Run both files against the current code**

Run: `RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test npx vitest run --no-file-parallelism src/lib/db/cover-photos.integration.test.ts src/lib/db/collection-cover-photos.integration.test.ts`
Expected: PASS (characterization baseline).

- [ ] **Step 4: Refactor to `DISTINCT ON`** — in `PhotoRepository.ts` add `desc` to the drizzle-orm import, then replace the two method bodies:

```ts
  // Per-item cover for a batch of items: ONE row per item, chosen in SQL —
  // hero first, else the earliest (created_at, then id) non-deleted photo.
  // Items with no photos are absent from the map.
  async findCoverPhotosByItemIds(itemIds: string[]): Promise<Map<string, Photo>> {
    if (itemIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([photosTable.itemId])
      .from(photosTable)
      .where(and(inArray(photosTable.itemId, itemIds), isNull(photosTable.deletedAt)))
      .orderBy(photosTable.itemId, desc(photosTable.isHero), asc(photosTable.createdAt), asc(photosTable.id));
    return new Map(rows.map((r) => [r.itemId as string, this.mapToPhoto(r)]));
  }

  // Per-collection cover: ONE assigned (item_id IS NOT NULL) photo per collection,
  // hero first, else earliest (created_at, then id). Pooled photos have no
  // item-scoped asset URL and are excluded. NOT an access boundary: callers pass
  // only access-filtered ids (see findCollectionIdsWithPooledPhotos).
  async findCoverPhotosByCollectionIds(collectionIds: string[]): Promise<Map<string, Photo>> {
    if (collectionIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([photosTable.collectionId])
      .from(photosTable)
      .where(
        and(
          inArray(photosTable.collectionId, collectionIds),
          isNotNull(photosTable.itemId),
          isNull(photosTable.deletedAt),
        ),
      )
      .orderBy(photosTable.collectionId, desc(photosTable.isHero), asc(photosTable.createdAt), asc(photosTable.id));
    return new Map(rows.map((r) => [r.collectionId, this.mapToPhoto(r)]));
  }
```

`is_hero` is `NOT NULL DEFAULT false`, so `DESC` puts `true` first with no NULLs to place. The `DISTINCT ON` expression must lead the `ORDER BY` (Postgres requirement).

- [ ] **Step 5: Run both files again**

Same command as Step 3. Expected: PASS (every existing case plus the two tie tests). Then `npx vitest run src/app/collections` — the page tests mock `PhotoController`, so they must stay green unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/implementations/PhotoRepository.ts src/lib/db/cover-photos.integration.test.ts src/lib/db/collection-cover-photos.integration.test.ts
git commit -m "perf(photos): DISTINCT ON for cover lookups, one row per item/collection (purses-w7ss.12)"
```

---

### Task 3: Migration `lock_timeout` — purses-w7ss.8

**Files:**
- Modify: `scripts/migrate.ts:16`
- Create: `src/lib/db/migrate-lock-timeout.integration.test.ts`

**Interfaces:**
- Consumes: `getTestDb`, `closeDb`, `TEST_DATABASE_URL` from `e2e/fixtures/db.ts`.
- Produces: `npm run db:migrate` exits 1 with a "lock timeout" error after ~5 s when a lock it needs is held.

- [ ] **Step 1: Write the failing test** — `src/lib/db/migrate-lock-timeout.integration.test.ts`:

```ts
// @vitest-environment node
// scripts/migrate.ts against the real test DB: while another transaction holds
// ACCESS EXCLUSIVE on the migrator's ledger, the migrator must give up after its
// lock_timeout (exit 1, "lock timeout") instead of waiting forever and queueing
// every read behind it (purses-w7ss.8).
import { spawn } from "node:child_process";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getTestDb, TEST_DATABASE_URL } from "../../../e2e/fixtures/db";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function runMigrate(deadlineMs: number): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const tsx = path.resolve(process.cwd(), "node_modules/.bin/tsx");
    const child = spawn(tsx, ["scripts/migrate.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    // Without lock_timeout the child waits forever; kill it BEFORE the lock is
    // released so it can never go on to run migrations.
    const timer = setTimeout(() => child.kill("SIGKILL"), deadlineMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

describeDb("db:migrate lock_timeout (script -> Postgres)", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("fails fast with a lock timeout when the ledger is locked, and never waits indefinitely", async () => {
    const { client } = getTestDb();
    const result = await client.begin(async (tx) => {
      await tx`lock table drizzle.__drizzle_migrations in access exclusive mode`;
      return runMigrate(20_000);
    });
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/lock timeout/i);
  }, 30_000);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test npx vitest run --no-file-parallelism src/lib/db/migrate-lock-timeout.integration.test.ts`
Expected: FAIL after ~20 s — `result.code` is `null` (child killed while still waiting on the lock).

- [ ] **Step 3: Minimal implementation** — `scripts/migrate.ts`, replace `const sql = postgres(databaseUrl, { max: 1 });` with:

```ts
// A migration's DDL takes ACCESS EXCLUSIVE; while it WAITS for that lock, every
// new read of the table queues behind it. Cap the wait at 5 s so a busy table
// fails the deploy loudly (rolled back, safe to re-run) instead of stalling prod
// reads. Startup parameter, like db.ts's statement_timeout (value in ms).
const sql = postgres(databaseUrl, { max: 1, connection: { lock_timeout: 5_000 } });
```

- [ ] **Step 4: Run it and watch it pass**

Same command as Step 2. Expected: PASS in ~6–8 s (tsx start + 5 s lock wait).

- [ ] **Step 5: Confirm a normal migrate still succeeds**

Run: `DATABASE_URL=postgresql://postgres:test@localhost:5433/app_test npm run db:migrate`
Expected: "✅ Migrations completed successfully" (nothing pending; exit 0).

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate.ts src/lib/db/migrate-lock-timeout.integration.test.ts
git commit -m "fix(migrate): 5s lock_timeout so a blocked migration fails fast (purses-w7ss.8)"
```

---

### Task 4: Every draft writer under the curator lock — purses-w7ss.6

`updateResultName` has no callers (verified: `grep -rn updateResultName src e2e` hits only its definition) — delete it rather than lock it. The purge-prep crosses curators, so it takes `lockCollectionCurators` (owner + members, ordered by key — the purge's own lock), not the single-curator `lockCollectionCurator`.

**Files:**
- Modify: `src/server/services/SortResultService.ts:152-159` (comment), `:344-349` (delete), `:445-465` (purge-prep)
- Modify: `src/app/api/items/[id]/remove-from-sorts/route.ts:28-29`
- Test: `src/lib/db/remove-from-sorts.integration.test.ts`

**Interfaces:**
- Consumes: `lockCollectionCurators(tx: Database, collectionId: string): Promise<void>` from `@/server/services/purge-lock`.
- Produces: `removeItemFromDraftResults(collectionId: string, itemId: string): Promise<{ removed: number; remainingInFinalized: number }>` (new first parameter). `SortResultService.updateResultName` no longer exists.

- [ ] **Step 1: Write the failing test** — in `remove-from-sorts.integration.test.ts` add imports `import postgres from "postgres";` and `TEST_DATABASE_URL` (extend the existing `../../../e2e/fixtures/db` import), then add after case (d):

```ts
  it("(e) waits for an in-flight curator writer: purge-prep takes the curator lock (purses-w7ss.6)", async () => {
    const itemId = await seedItemWithPreference();
    await placeInResult(itemId, "draft");
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // A second connection plays a curator writer mid-transaction (pin/save hold this lock).
    const holder = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      let call!: Promise<Response>;
      const outcome = await holder.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext(${collectionId}), hashtext(${ownerId}))`;
        call = removeFromSorts(removeReq() as any, { params: Promise.resolve({ id: itemId }) });
        const waiting = (async () => {
          for (let i = 0; i < 50; i++) {
            const [row] = await tx`select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted`;
            if (row.n > 0) return "waiting" as const;
            await new Promise((r) => setTimeout(r, 100));
          }
          return "never waited" as const;
        })();
        return Promise.race([call.then(() => "finished first" as const), waiting]);
      });
      expect(outcome).toBe("waiting");
      const res = await call; // the holder committed; the purge-prep proceeds
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ removed: 1, remainingInFinalized: 0 });
    } finally {
      await holder.end({ timeout: 5 });
    }
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test npx vitest run --no-file-parallelism src/lib/db/remove-from-sorts.integration.test.ts`
Expected: FAIL in (e) — `outcome` is `"finished first"` (no lock taken).

- [ ] **Step 3: Minimal implementation** — `SortResultService.ts`:

Add `import { lockCollectionCurators } from "@/server/services/purge-lock";`. Replace `removeItemFromDraftResults`:

```ts
  async removeItemFromDraftResults(
    collectionId: string,
    itemId: string,
  ): Promise<{ removed: number; remainingInFinalized: number }> {
    return withTransaction(
      this.db,
      async (tx) => {
        // Crosses curators, so it serializes with EVERY curator's pin/save/revision.
        await lockCollectionCurators(tx, collectionId);
        const repo = new SortResultItemRepository(tx);
        const removed = await repo.deleteByItemInDraftResults(itemId);
        const remainingInFinalized = await repo.countByItemInFinalizedResults(itemId);
        return { removed, remainingInFinalized };
      },
      { op: "remove_item_from_draft_results", ctx: { collectionId } },
    );
  }
```

Keep the method's doc comment; add one line: "Takes every curator's lock for the collection (purge-lock), like the purge itself." Delete `updateResultName` (lines 344-349). In the `inCuratorTx` doc comment, replace "(Still unlocked, tracked in purses-w7ss.6: the result rename and the owner's purge-prep.)" with "(The owner's purge-prep crosses curators and takes all of them: lockCollectionCurators.)".

`src/app/api/items/[id]/remove-from-sorts/route.ts`: `await service.removeItemFromDraftResults(item.collectionId, item.id);`

- [ ] **Step 4: Run it and watch it pass**

Same command as Step 2. Expected: PASS (a)–(e). Then `npx tsc --noEmit -p .` — no remaining reference to `updateResultName` or the old one-argument call.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/SortResultService.ts "src/app/api/items/[id]/remove-from-sorts/route.ts" src/lib/db/remove-from-sorts.integration.test.ts
git commit -m "fix(results): purge-prep under the curators' lock; drop dead updateResultName (purses-w7ss.6)"
```

---

### Task 5: Batched `saveAndShare` writes — purses-w7ss.7

Two independent reductions, same transaction: (a) the rebuild and the kept pins each become one multi-row `INSERT` (kept pins carry `manualRank` at insert — no create-then-update); (b) the decision log loads in one query instead of one per session. `loadCuratorDecisionEvents` is THE shared definition (spec §2.6), so it changes for every caller — same session set, same rows. Row order was never guaranteed (no `ORDER BY` before either); every consumer sorts with `compareByCreatedAtThenId` (`derive-usage.ts:16`, `ScoringService.ts:101`) — the implementer re-confirms with `grep -rn "listForCurator\|loadCuratorDecisionEvents" src` that no consumer reads the raw order.

**Files:**
- Modify: `src/server/repositories/implementations/SortResultItemRepository.ts` (add `createMany`)
- Modify: `src/server/repositories/implementations/DecisionEventRepository.ts` (add `findBySessions`)
- Modify: `src/server/services/decision-log.ts`
- Create: `src/server/services/decision-log.test.ts`
- Modify: `src/server/services/SortResultService.ts:289-320`
- Test: `src/server/services/SortResultService.test.ts`; update mocks in `PreferenceStateService.test.ts:23,176,226` and `ScoringService.test.ts:63`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `SortResultItemRepository.createMany(rows: NewSortResultItem[]): Promise<SortResultItem[]>` where `type NewSortResultItem = { sortResultId: string; itemId: string; computedRank: number; computedBucket: RankBucket; manualRank?: number | null; usage?: "uses" | "not_uses" | null }` (exported from the repository file). Empty input → `[]`, no query.
  - `DecisionEventRepository.findBySessions(sessionIds: string[]): Promise<DecisionEvent[]>`. Empty input → `[]`, no query.

- [ ] **Step 1: Write the failing decision-log test** — `src/server/services/decision-log.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { loadCuratorDecisionEvents } from "./decision-log";
import type { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import type { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";

describe("loadCuratorDecisionEvents", () => {
  it("loads every session's decisions in ONE query (purses-w7ss.7)", async () => {
    const sessions = { findByCollectionAndCurator: vi.fn().mockResolvedValue([{ id: "s1" }, { id: "s2" }]) };
    const events = [{ id: "e1" }, { id: "e2" }];
    const decisions = { findBySessions: vi.fn().mockResolvedValue(events), findBySession: vi.fn() };
    const out = await loadCuratorDecisionEvents(
      sessions as unknown as SessionRepository, decisions as unknown as DecisionEventRepository, "c", "u",
    );
    expect(out).toBe(events);
    expect(decisions.findBySessions).toHaveBeenCalledExactlyOnceWith(["s1", "s2"]);
    expect(decisions.findBySession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing saveAndShare test** — in `SortResultService.test.ts`:
  - extend the hoisted mocks: `txItemRepo` gains `createMany: vi.fn()`; `txResultRepo` gains `findDraftForUpdate: vi.fn()`; `txPrefRepo` gains `findByCollection: vi.fn()`;
  - add a hoisted `txLiveItemRepo = { findByCollection: vi.fn() }` and `vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return txLiveItemRepo; }) }));`
  - in `beforeEach`: `txItemRepo.createMany.mockResolvedValue([]); txResultRepo.findDraftForUpdate.mockResolvedValue(null);`
  - add the test:

```ts
describe("SortResultService.saveAndShare writes", () => {
  it("rebuilds the saved rows and the kept pins with one multi-row insert each — never row by row (purses-w7ss.7)", async () => {
    const draft = sortResult({ id: "draft-1" });
    const next = sortResult({ id: "draft-2" });
    txResultRepo.findBySaveKey.mockResolvedValue(null);
    txResultRepo.findDraftForUpdate.mockResolvedValueOnce(draft).mockResolvedValueOnce(null);
    txResultRepo.insertWithNumber.mockResolvedValue(next);
    txResultRepo.markSaved.mockResolvedValue(sortResult({ id: "draft-1", status: "finalized" }));
    txLiveItemRepo.findByCollection.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    txPrefRepo.findByCollection.mockResolvedValue([
      preference({ itemId: "a", rankBucket: "top", orderRank: 0 }),
      preference({ itemId: "b", rankBucket: "top", orderRank: 1 }),
      preference({ itemId: "c", rankBucket: "low", orderRank: null }),
    ]);
    // b was hand-placed first.
    txItemRepo.findByResult.mockResolvedValue([sortResultItem({ sortResultId: "draft-1", itemId: "b", manualRank: 0 })]);
    txShareRepo.create.mockResolvedValue(undefined);

    const service = new SortResultService(
      {} as unknown as SortResultRepository,
      {} as unknown as SortResultItemRepository,
      {} as unknown as CollectionPreferenceItemRepository,
      txDb,
    );
    await service.saveAndShare(COLLECTION, CURATOR, "Keepers", "01j00000000000000000000000");

    expect(txItemRepo.create).not.toHaveBeenCalled();
    expect(txItemRepo.update).not.toHaveBeenCalled();
    expect(txItemRepo.createMany).toHaveBeenCalledTimes(2);
    const [saved] = txItemRepo.createMany.mock.calls[0];
    expect(saved.map((r: { itemId: string; computedRank: number }) => [r.itemId, r.computedRank])).toEqual([["b", 0], ["a", 1], ["c", 2]]);
    expect(txItemRepo.createMany.mock.calls[1][0]).toEqual([
      { sortResultId: "draft-2", itemId: "b", computedRank: 0, computedBucket: "top", manualRank: 0 },
    ]);
  });
});
```

(If `preference()`'s type lacks `orderRank`, add it to the overrides type — `CollectionPreferenceItem` carries it. If `buildRanking` yields a different order for this seed, read `buildRanking`/`applyPins` and fix the seed, not the assertion's intent: pinned `b` first, then derived order, Onward last.)

- [ ] **Step 3: Run both and watch them fail**

Run: `npx vitest run src/server/services/decision-log.test.ts src/server/services/SortResultService.test.ts`
Expected: FAIL — `findBySessions` not called (`findBySession` was); `createMany` not called (`create` was).

- [ ] **Step 4: Implement the repositories**

`SortResultItemRepository.ts` — add above `create`, and the method after `create`:

```ts
export type NewSortResultItem = {
  sortResultId: string;
  itemId: string;
  computedRank: number;
  computedBucket: RankBucket;
  manualRank?: number | null;
  usage?: "uses" | "not_uses" | null;
};
```

```ts
  // One INSERT for a whole materialization (the per-row loop held the curator lock N round trips).
  async createMany(rows: NewSortResultItem[]): Promise<SortResultItem[]> {
    if (rows.length === 0) return [];
    const now = new Date();
    const inserted = await this.db
      .insert(sortResultItemsTable)
      .values(
        rows.map((r) => ({
          id: generateId("sri"),
          sortResultId: r.sortResultId,
          itemId: r.itemId,
          computedRank: r.computedRank,
          computedBucket: r.computedBucket,
          manualRank: r.manualRank ?? null,
          manualBucket: null,
          usage: r.usage ?? null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning();
    return inserted.map((i) => this.mapToResultItem(i));
  }
```

`DecisionEventRepository.ts` — after `findBySession`:

```ts
  async findBySessions(sessionIds: string[]): Promise<DecisionEvent[]> {
    if (sessionIds.length === 0) return [];
    const events = await this.db
      .select()
      .from(decisionEventsTable)
      .where(inArray(decisionEventsTable.sessionId, sessionIds));
    return events.map((e) => this.mapToDecisionEvent(e));
  }
```

- [ ] **Step 5: Implement the service changes**

`decision-log.ts` body (keep the header comment; replace "fetched once and in parallel" with "fetched in one query"):

```ts
  const sessions = await sessionRepo.findByCollectionAndCurator(collectionId, curatorId);
  return decisionRepo.findBySessions(sessions.map((s) => s.id));
```

`SortResultService.saveAndShare` — replace the per-row loop (lines ~300-309) with:

```ts
      await itemRepo.deleteByResult(draft.id);
      await itemRepo.createMany(
        ordered.map((entry, index) => ({
          sortResultId: draft.id,
          itemId: entry.itemId,
          computedRank: index,
          computedBucket: entry.bucket,
          usage: usage.get(entry.itemId) ?? null,
        })),
      );
```

and the kept-pins block (lines ~313-320) with:

```ts
      const keptPins = loved.flatMap((entry, slot) => (entry.pinned ? [{ entry, slot }] : []));
      if (keptPins.length > 0) {
        const next = await this.getOrCreateOpenDraft(tx, collectionId, curatorId);
        await itemRepo.createMany(
          keptPins.map(({ entry, slot }) => ({
            sortResultId: next.id, itemId: entry.itemId, computedRank: slot, computedBucket: entry.bucket, manualRank: slot,
          })),
        );
      }
```

(Kept pins' slots are distinct loved-list indexes, so equal `updatedAt` on them is safe — `dense-pins-splice` only needs distinct slots.)

- [ ] **Step 6: Update the other mocks** — `PreferenceStateService.test.ts` (lines 23, 176, 226) and `ScoringService.test.ts` (line 63): each mocked `DecisionEventRepository` gains `findBySessions` returning the same events its `findBySession` returned (keep `findBySession` only if something else in that file still calls it). Example for line 23: `return { findBySessions: vi.fn().mockResolvedValue([]) } as unknown as DecisionEventRepository;`.

- [ ] **Step 7: Run unit + DB proof**

Run: `npx vitest run src/server/services`
Expected: PASS.
Run: `RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test npx vitest run --no-file-parallelism src/lib/db/ranking-save-route.integration.test.ts src/lib/db/sort-results-usage-snapshot.integration.test.ts src/lib/db/usage-events.integration.test.ts`
Expected: PASS — the un-mocked save path (multi-row insert, usage stamping, pins carried into the fresh draft) and the cross-session decision log through real Postgres.

- [ ] **Step 8: Commit**

```bash
git add src/server/repositories/implementations/SortResultItemRepository.ts src/server/repositories/implementations/DecisionEventRepository.ts src/server/services/decision-log.ts src/server/services/decision-log.test.ts src/server/services/SortResultService.ts src/server/services/SortResultService.test.ts src/server/services/PreferenceStateService.test.ts src/server/services/ScoringService.test.ts
git commit -m "perf(results): one multi-row insert and one decisions load in saveAndShare (purses-w7ss.7)"
```

---

### Task 6: A gentle note before a revision sets hand placements aside — purses-w7ss.5

The server decides, inside the curator lock: a revision that would move or drop any of the open draft's pins refuses with 409 `{ code: "revision_discards_pins", pinCount }` unless the request says `{ "discardPins": true }`. A pin that already sits at its saved slot is not "lost" (the revision re-pins it there), so right after Save — whose kept pins match the saved order — no note appears. The client shows the note only on that 409, then re-posts with the flag.

**Files:**
- Modify: `src/server/services/sortResultMaterialization.ts` (add `pinsLostToRevision`); test `src/server/services/sortResultMaterialization.test.ts`
- Modify: `src/server/services/SortResultService.ts` (error class + `supersedeResult`); test `src/server/services/SortResultService.test.ts`
- Modify: `src/server/api/http-errors.ts`
- Modify: `src/app/api/sort-results/[id]/supersede/route.ts`
- Modify: `src/features/results/MakeRevisionButton.tsx`; create `src/features/results/MakeRevisionButton.test.tsx`
- Test: `src/lib/db/ranking-save-route.integration.test.ts`

**Interfaces:**
- Consumes: `savedOrderPositions`, `SortResultItem`.
- Produces:
  - `pinsLostToRevision(draftRows: readonly SortResultItem[], savedSlots: ReadonlyMap<string, number>): number`
  - `class RevisionDiscardsPinsError extends Error { readonly code = "revision_discards_pins"; constructor(readonly pinCount: number) }`
  - `supersedeResult(id: string, opts?: { discardPins?: boolean }): Promise<SortResult | null>`
  - `POST /api/sort-results/[id]/supersede` body (optional): `{ discardPins: true }`; new response `409 { error, code: "revision_discards_pins", pinCount }`.

- [ ] **Step 1: Failing pure test** — `sortResultMaterialization.test.ts` (use the file's existing row factory if it has one; otherwise build `SortResultItem`s inline):

```ts
describe("pinsLostToRevision", () => {
  const row = (itemId: string, manualRank: number | null) =>
    ({ id: `r-${itemId}`, sortResultId: "d", itemId, computedRank: 0, computedBucket: "top", manualRank, manualBucket: null, usage: null, createdAt: new Date(0), updatedAt: new Date(0) }) as SortResultItem;
  const saved = new Map([["a", 0], ["b", 1]]);

  it("counts pins the revision would move or drop", () => {
    expect(pinsLostToRevision([row("a", 1), row("b", 0), row("x", 2)], saved)).toBe(3);
  });
  it("ignores pins already at their saved slot and unpinned rows (no note right after Save)", () => {
    expect(pinsLostToRevision([row("a", 0), row("b", null)], saved)).toBe(0);
  });
  it("is zero with no open draft rows", () => {
    expect(pinsLostToRevision([], saved)).toBe(0);
  });
});
```

- [ ] **Step 2: Failing service test** — in `SortResultService.test.ts`, import `RevisionDiscardsPinsError`, add inside `describe("SortResultService.supersedeResult")`:

```ts
  it("refuses to discard the open draft's hand placements without the flag, and writes nothing", async () => {
    const source = sortResult({ id: "res-1", status: "finalized" });
    const sourceItems = [sortResultItem({ itemId: "a", computedRank: 0, computedBucket: "top" })];
    txResultRepo.findDrafts.mockResolvedValue([sortResult({ id: "draft-1" })]);
    txItemRepo.findByResult.mockResolvedValueOnce([sortResultItem({ sortResultId: "draft-1", itemId: "z", manualRank: 0 })]);
    const service = new SortResultService(
      { findById: async () => source } as unknown as SortResultRepository,
      { findByResult: async () => sourceItems } as unknown as SortResultItemRepository,
      {} as unknown as CollectionPreferenceItemRepository,
      txDb,
    );

    const err = await service.supersedeResult("res-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RevisionDiscardsPinsError);
    expect((err as RevisionDiscardsPinsError).pinCount).toBe(1);
    expect(txItemRepo.deleteByResult).not.toHaveBeenCalled();
    expect(txResultRepo.insertWithNumber).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Failing route test (DB, the one crossing)** — `ranking-save-route.integration.test.ts`: add `import { POST as supersede } from "@/app/api/sort-results/[id]/supersede/route";` beside the `save` import, and a request helper:

```ts
const supersedeReq = (body?: unknown) =>
  new Request("http://localhost/api/sort-results/x/supersede", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
```

Then the test:

```ts
  it("a revision asks before setting hand placements aside: 409 with the count, then 201 with discardPins", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const first = (await (await save(saveReq({ name: "First", saveKey: KEY }), ctx(s.collectionId))).json()) as { resultNumber: number };
    const saved = await new SortResultRepository(db).findByCollectionAndNumber(s.collectionId, first.resultNumber);
    const service = SortResultService.fromDb(db);
    await service.pinItem(s.collectionId, ownerId, s.a, 1); // a moves off its saved slot (2nd)

    const asked = await supersede(supersedeReq() as any, ctx(saved!.id));
    expect(asked.status).toBe(409);
    expect(await asked.json()).toMatchObject({ code: "revision_discards_pins", pinCount: expect.any(Number) });
    expect(new Map((await service.listPins(s.collectionId, ownerId)).map((p) => [p.itemId, p.position])).get(s.a)).toBe(1); // untouched

    expect((await supersede(supersedeReq({ discardPins: "yes" }) as any, ctx(saved!.id))).status).toBe(400);

    const confirmed = await supersede(supersedeReq({ discardPins: true }) as any, ctx(saved!.id));
    expect(confirmed.status).toBe(201);
    expect(new Map((await service.listPins(s.collectionId, ownerId)).map((p) => [p.itemId, p.position]))).toEqual(
      new Map([[s.b, 1], [s.a, 2]]),
    );
  });
```

Also update the existing test "a revision replaces a shared open draft, taking its share with it": `service.supersedeResult(saved!.id, { discardPins: true })` (its draft holds a hand move, so without the flag it now — correctly — asks).

- [ ] **Step 4: Run all three and watch them fail**

Run: `npx vitest run src/server/services/sortResultMaterialization.test.ts src/server/services/SortResultService.test.ts`
Expected: FAIL (`pinsLostToRevision` / `RevisionDiscardsPinsError` not exported).
Run: `RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test npx vitest run --no-file-parallelism src/lib/db/ranking-save-route.integration.test.ts`
Expected: FAIL — first supersede returns 201, not 409.

- [ ] **Step 5: Implement server side**

`sortResultMaterialization.ts`, after `savedOrderPositions`:

```ts
/** Pure: how many of the open draft's pins a revision would move or drop (a pin already at its saved slot stays). */
export function pinsLostToRevision(draftRows: readonly SortResultItem[], savedSlots: ReadonlyMap<string, number>): number {
  return draftRows.filter((r) => r.manualRank !== null && savedSlots.get(r.itemId) !== r.manualRank).length;
}
```

`SortResultService.ts` — import `pinsLostToRevision`; add next to `SupersedeStateError`:

```ts
/** A revision would set the open draft's hand placements aside; the person confirms first → 409. */
export class RevisionDiscardsPinsError extends Error {
  readonly code = "revision_discards_pins";
  constructor(readonly pinCount: number) {
    super("Your hand-placed pieces would move. Start the revision anyway?");
    this.name = "RevisionDiscardsPinsError";
  }
}
```

`supersedeResult` — signature `async supersedeResult(id: string, opts: { discardPins?: boolean } = {}): Promise<SortResult | null>`; first lines inside the `inCuratorTx` callback, before `deleteDrafts`:

```ts
      if (!opts.discardPins) {
        const itemRepo = new SortResultItemRepository(tx);
        for (const draft of await new SortResultRepository(tx).findDrafts(source.collectionId, source.curatorId)) {
          const lost = pinsLostToRevision(await itemRepo.findByResult(draft.id), slots);
          if (lost > 0) throw new RevisionDiscardsPinsError(lost);
        }
      }
```

(Rename the later `const itemRepo` in the same callback, or hoist this one and reuse it — one `SortResultItemRepository(tx)` per callback.) Update the method comment: "…replacing any other; when that other draft holds hand placements the revision would move, the person confirms first (`discardPins`)."

`http-errors.ts` — import `RevisionDiscardsPinsError`; add before the `NothingToSaveError` branch:

```ts
  if (error instanceof RevisionDiscardsPinsError) {
    return NextResponse.json({ error: error.message, code: error.code, pinCount: error.pinCount }, { status: 409 });
  }
```

and add the line `RevisionDiscardsPinsError → 409 (error.message + code + pinCount)` to the mapping doc comment.

`src/app/api/sort-results/[id]/supersede/route.ts`:

```ts
import { z } from "zod";
// …
const SupersedeBody = z.object({ discardPins: z.literal(true).optional() }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiResultAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    // Body is optional: no body = "don't discard hand placements". Invalid JSON → 400 via errorResponse.
    const text = await request.text();
    const { discardPins } = SupersedeBody.parse(text ? JSON.parse(text) : {});
    const result = await SortResultService.fromDb(db).supersedeResult(id, { discardPins });
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    // errorResponse maps SupersedeStateError / RevisionDiscardsPinsError → 409, ZodError/SyntaxError → 400, Unauthorized → 401.
    return errorResponse(error);
  }
}
```

(Authz stays before any body read, matching the route precedent.)

- [ ] **Step 6: Server tests pass**

Re-run both Step 4 commands. Expected: PASS. Also run `RUN_DB_TESTS=1 … npx vitest run --no-file-parallelism src/lib/db/sort-results-pipeline.integration.test.ts src/lib/db/sort-pipeline.integration.test.ts src/lib/db/route-authz-enumeration.integration.test.ts` — existing supersede tests post without a body against curators with no hand-placed draft, so they stay green; if one now 409s, read why before touching it (a draft with off-slot pins is exactly the case that should ask).

- [ ] **Step 7: Failing component test** — `src/features/results/MakeRevisionButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MakeRevisionButton } from "./MakeRevisionButton";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});
const renderIt = () => render(<MakeRevisionButton resultId="res_1" rankingHref="/collections/bags/results" />);
const asks = (pinCount: number) => ({ ok: false, status: 409, json: async () => ({ code: "revision_discards_pins", pinCount }) });

describe("MakeRevisionButton", () => {
  it("opens the revision straight away when nothing hand-placed would move", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Make a revision" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/collections/bags/results");
  });

  it("asks first when hand placements would be set aside, then confirms with discardPins", async () => {
    fetchMock.mockResolvedValueOnce(asks(2)).mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) });
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Make a revision" }));
    expect(screen.getByText(/You've placed 2 pieces by hand on your live ranking/)).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Start the revision" }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ discardPins: true });
    expect(push).toHaveBeenCalledWith("/collections/bags/results");
  });

  it("Keep my ranking closes the note, changes nothing, and returns focus to the button", async () => {
    fetchMock.mockResolvedValueOnce(asks(1));
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: "Make a revision" }));
    expect(screen.getByText(/You've placed 1 piece by hand/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Keep my ranking" }));
    expect(screen.queryByText(/placed 1 piece/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make a revision" })).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8: Run it and watch it fail**

Run: `npx vitest run src/features/results/MakeRevisionButton.test.tsx`
Expected: FAIL — the first test passes; the 409 tests fail (current code shows the error copy).

- [ ] **Step 9: Implement the island** — replace `src/features/results/MakeRevisionButton.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Spec §4.4: a saved ranking stays as it is; "Make a revision" opens a copy (pinned
// to the saved order) on the live Ranking, where saving it issues its own link.
// When the live Ranking holds hand placements the copy would move, the server
// answers 409 with the count and the person chooses (purses-w7ss.5).
type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "asking"; pinCount: number };

export function revisionNote(pinCount: number): string {
  const pieces = pinCount === 1 ? "1 piece" : `${pinCount} pieces`;
  const places = pinCount === 1 ? "that spot" : "those spots";
  return `You've placed ${pieces} by hand on your live ranking. A revision starts again from this saved order, so ${places} won't carry over.`;
}

export function MakeRevisionButton({ resultId, rankingHref }: { resultId: string; rankingHref: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLParagraphElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (phase.kind === "asking") note.current?.focus();
    if (phase.kind === "idle" && returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [phase.kind]);

  async function revise(discardPins: boolean) {
    setPhase({ kind: "busy" });
    setError("");
    try {
      const res = await fetch(`/api/sort-results/${resultId}/supersede`, {
        method: "POST",
        ...(discardPins
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ discardPins: true }) }
          : {}),
      });
      if (res.status === 409) {
        const body: unknown = await res.json().catch(() => null);
        if (body && typeof body === "object" && "code" in body && body.code === "revision_discards_pins" && "pinCount" in body && typeof body.pinCount === "number") {
          setPhase({ kind: "asking", pinCount: body.pinCount });
          return;
        }
      }
      if (!res.ok) throw new Error("supersede");
      router.push(rankingHref);
    } catch {
      setError("That didn't open just now — nothing was lost. Try again whenever you like.");
      setPhase({ kind: "idle" });
    }
  }

  if (phase.kind === "asking") {
    return (
      <div role="group" aria-label="Before you revise" className="flex max-w-prose flex-col items-start gap-3">
        <p ref={note} tabIndex={-1} className="text-sm text-ink">
          {revisionNote(phase.pinCount)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" onClick={() => revise(true)}>
            Start the revision
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              returnFocus.current = true;
              setPhase({ kind: "idle" });
            }}
          >
            Keep my ranking
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button ref={trigger} type="button" variant="secondary" onClick={() => revise(false)} disabled={phase.kind === "busy"}>
        {phase.kind === "busy" ? "Getting ready…" : "Make a revision"}
      </Button>
      {error && (
        <p role="status" className="text-sm text-ink-soft">
          {error}
        </p>
      )}
    </div>
  );
}
```

Design notes for the reviewer: not `danger` — the loss is a few hand moves the person can redo, not irreversible data (TONE: red only for the irreversible). The count describes the person's own work, never a deficit. Check the token names (`text-ink`, `text-ink-soft`, `max-w-prose`) against `DESIGN.md`/existing usage before committing; swap for the nearest existing token if one is missing. If ESLint flags the exported `revisionNote` under react-refresh's only-export-components rule, keep it module-private.

- [ ] **Step 10: Run it and watch it pass**

Run: `npx vitest run src/features/results/MakeRevisionButton.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 11: Commit**

```bash
git add src/server/services/sortResultMaterialization.ts src/server/services/sortResultMaterialization.test.ts src/server/services/SortResultService.ts src/server/services/SortResultService.test.ts src/server/api/http-errors.ts "src/app/api/sort-results/[id]/supersede/route.ts" src/features/results/MakeRevisionButton.tsx src/features/results/MakeRevisionButton.test.tsx src/lib/db/ranking-save-route.integration.test.ts
git commit -m "feat(results): ask before a revision sets hand-placed pieces aside (purses-w7ss.5)"
```

---

### Task 7: Docs sync, full gates, screenshots

**Files:**
- Modify: `docs/DATABASE.md` (line ~31-33 id rule; line ~84 lock table row; §2 Migration workflow — lock_timeout + retry), `docs/DEPLOYMENT.md` (Step 4 "Run Database Migration" — one-line lock_timeout note), `docs/API.md` (§ `POST /api/sort-results/[id]/supersede`, line ~421), `docs/ARCHITECTURE.md` (repository facts touched: `createMany`, `findBySessions`, `DISTINCT ON` covers — only where ARCHITECTURE already describes these repos), `docs/doc-ownership.md` (add `scripts/migrate.ts :: docs/DATABASE.md, docs/DEPLOYMENT.md`).

- [ ] **Step 1: Docs** — run `/sync-docs` (per `docs/doc-ownership.md`; never PRODUCT/TONE). Required facts:
  - DATABASE.md id rule: "`generateId` mints from one process-wide ULID monotonic factory, so ids minted in one process sort in creation order even within a millisecond; `generateOrderedIdFactory()` remains for batch inserts. Ids minted concurrently on two instances are not ordered."
  - DATABASE.md line ~84: remove "the result rename and owner purge-prep are still unlocked (`purses-w7ss.6`)"; say "owner purge-prep takes every curator's lock for the collection (`lockCollectionCurators`)".
  - DATABASE.md §2: "`scripts/migrate.ts` sets `lock_timeout = 5s`. A migration that cannot get its lock within 5 s fails with SQLSTATE 55P03 and rolls back (drizzle applies pending migrations in one transaction), so the Vercel build fails loudly instead of queueing reads behind it. **Retry:** redeploy (or re-run `db:migrate`) once the blocking traffic has passed; there is no automatic retry. A repeat failure means a long-held lock — find it in `pg_locks`/`pg_stat_activity` before retrying."
  - DEPLOYMENT.md Step 4: one sentence pointing to that DATABASE.md paragraph.
  - API.md supersede: optional body `{ "discardPins": true }`; new `409 { error, code: "revision_discards_pins", pinCount }` when the open draft holds hand placements the revision would move; pins already at their saved slot don't count; `400` for any other body.

- [ ] **Step 2: Full gates** (each command separately; record exit codes; no `| tail`):

```bash
npm run lint
npm run test:ci
npm run build
npm run auth:verify
npm run test:db
npx playwright test e2e/sort-journey.spec.ts --project=tablet
PW_VIEWPORT=phone npx playwright test e2e/sort-journey.spec.ts
```

Expected: all exit 0. `PW_VIEWPORT=phone` runs without `--project` (memory `pw-viewport-renames-project`). Before the Playwright runs after `test:db`, recycle the DB container: `bash e2e/fixtures/test-db.sh down && bash e2e/fixtures/test-db.sh up` (memory `e2e-needs-fresh-container-after-test-db`). Also confirm the CI map still routes `src/features/results/**` to `e2e/sort-journey.spec.ts` (`.github/workflows/ci.yml` ~line 326-441; no change expected).

- [ ] **Step 3: Screenshots** — the only visible change is the revision note on `/collections/[id]/results/[n]`. Use the `pr-screenshots` skill: light + dark, tablet + phone, of the note open (seed: save a ranking, move a piece on the live Ranking, open the saved result, click "Make a revision"). Embed per `docs/cookbook/add-images-to-pr.md`. Close the Playwright browser when done.

- [ ] **Step 4: Graph** (controller only, PR boundary): `graphify update .` (use `--force` only if the graph shrank because symbols were genuinely deleted — `updateResultName` was).

- [ ] **Step 5: Commit**

```bash
git add docs/DATABASE.md docs/DEPLOYMENT.md docs/API.md docs/ARCHITECTURE.md docs/doc-ownership.md graphify-out
git commit -m "docs: sync for PR 4 follow-ups (epic purses-w7ss)"
```

(Stage only docs that actually changed; `graphify-out` only if Step 4 changed it.)

---

## Decisions this plan takes where the spec is silent

1. **.5 copy and interaction.** The server decides: `POST /supersede` without `{ "discardPins": true }` returns 409 `revision_discards_pins` with `pinCount` when the revision would move or drop any of the open draft's pins; the check runs inside the curator lock, so a stale page can never discard silently. The client then shows an inline note in place of the button, with no modal: "You've placed N pieces by hand on your live ranking. A revision starts again from this saved order, so those spots won't carry over." (singular: "1 piece … that spot won't"). The buttons are **Start the revision** (primary) and **Keep my ranking** (ghost). Neither uses the `danger` style, because the loss is redoable hand moves and TONE keeps red for the irreversible. Focus moves to the note when it opens and back to "Make a revision" when the person keeps their ranking.
2. **What happens to pins on revision.** Unchanged once confirmed: the open draft and its pins are deleted and the revision pins the saved order. A pin already at its saved slot doesn't count as lost, because the revision re-pins it in the same place, so right after Save (whose kept pins match the saved order) there is no note. Pins aren't merged into the revision, since merging would contradict the spec's "opens a copy of the saved order".
3. **`DISTINCT ON` tie-break.** `ORDER BY <item_id|collection_id>, is_hero DESC, created_at ASC, id ASC`. This matches the old JS walk exactly (the earliest hero wins over everything, otherwise the earliest photo, with id breaking `created_at` ties). It applies to both the item and the collection variants.
4. **`lock_timeout` value and retry policy.** It is 5 s, set as a startup parameter on the migrator's connection only (the same mechanism as `db.ts`'s `statement_timeout`, already proven through the prod pooler). That is well under the 25 s statement cap and the 30 s function cap. There is no automatic retry: the migration transaction rolls back, the Vercel build fails loudly, and a redeploy is the retry. A repeat failure is investigated in `pg_locks` first.
5. **Monotonic ULID scope.** It covers all ids. `generateId` has one module-level `monotonicFactory()` for every prefix, which gives creation order within a process and nothing across instances (stated in `id.ts` and DATABASE.md). `generateOrderedIdFactory()` stays as it is, because removing it is out of scope.
6. **.6 approach.** The uncalled `updateResultName` is deleted rather than locked. The purge-prep takes `lockCollectionCurators` (every curator of the collection, in key order), because it deletes rows from any curator's draft. The route passes `item.collectionId`.
7. **.7 decisions load.** The shared `loadCuratorDecisionEvents` itself switches to one `findBySessions` query, with the same session set and rows. That benefits every caller, not only `saveAndShare`. Row order was never guaranteed and consumers sort with `compareByCreatedAtThenId`. The other per-row loops (`insertResultWithItems`, the supersede re-pin loop) stay as they are, because they are out of the bead's scope.
8. **Supersede body validation.** The body is optional; anything other than `{}` / `{ "discardPins": true }` gets a 400 (strict zod). Authz runs before the body is read.

## Owner-veto list (behaviour changes)

- **Revision prompt:** "Make a revision" now asks first (inline note, the copy above) when the live Ranking holds hand placements the revision would move; the API gains a 409 `revision_discards_pins` and an optional `{ discardPins: true }` body.
- **Id generation:** every `generateId` id now comes from one process-wide ULID monotonic factory, so ids minted in the same millisecond on one instance sort in creation order. The format is unchanged and existing ids are untouched.
- **Migration deploys:** a migration that waits more than 5 s for a lock now fails the deploy instead of waiting; the retry is a redeploy.
