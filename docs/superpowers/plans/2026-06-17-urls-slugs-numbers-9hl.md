# Slug + Number URLs for Sessions & Results (purses-9hl) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate raw ULIDs from user-facing URLs by giving sort-sessions and sort-results a per-collection sequential `number` (mirroring `items.number`), so URLs read `/collections/<slug>/sort/<n>/triage` and `/collections/<slug>/results/<n>`, and every nav link/redirect emits slug + number.

**Architecture:** Add a nullable `number integer` + `uniqueIndex(collectionId, number)` to `sessions` and `sort_results`. Allocate `MAX+1` with retry-on-unique-violation inside each repository's `create()` (verbatim copy of `ItemRepository.getNextCatalogNumber`). The two POST API handlers (which today insert directly, bypassing the repos) route through `repo.create()` so the number is allocated on the live path. Pages parse the URL int, resolve via `findByCollectionAndNumber(collection.id, n)`, redirect to the list on miss/NaN, keep the `#196` integrity guard, and pass the entity's **ULID** down to client components (the `#190` "slug for nav, id for data" split — the ~22 API routes stay ULID-only). A one-shot, idempotent backfill assigns `1..n` per collection by `createdAt`.

**Tech Stack:** Next.js App Router (async Server Components), Drizzle ORM over Postgres (Neon `neon-http`, stateless), Vitest (`jsdom` for page/component tests; DB-gated tests behind `RUN_DB_TESTS=1`), React Testing Library.

**Spec:** the bead `purses-9hl` (`bd show purses-9hl`). **Template:** `docs/superpowers/plans/2026-06-15-short-collection-slugs.md` (the `#190` slug plan this mirrors). **Predecessors merged:** `#190` (slugs), `#195` (card images), `#196` (authz hotfix — guards to preserve).

## Global Constraints

Every task implicitly includes these. Values copied verbatim.

- **Branch → PR → squash-merge; never commit to `main`.** Work happens on `feat/purses-9hl-urls-slugs-numbers` (already created).
- **Preserve the `#196` integrity guards.** The sort pages and result pages compare the resolved entity's `collectionId` against the **resolved `collection.id`** (e.g. `if (!sortSession || sortSession.collectionId !== collection.id) redirect(...)`). Keep that guard verbatim after the rename. **Never** reintroduce a `params.id`-based comparison.
- **"slug for nav, id for data" (`#190`).** Nav `href`s use `collection.slug ?? collection.id` and the entity `number`. DB queries, image/file URLs, client-component props consumed in `fetch`, redirect-into-data, and integrity comparisons use the ULID `collection.id` / entity `id`.
- **API routes stay ULID-only** (~22 routes). Slug/number is a page-nav concern; never thread a slug or number into an API path or body.
- **Number allocation = `MAX+1` with retry-on-unique-violation, copied verbatim from `ItemRepository.getNextCatalogNumber`** (`src/server/repositories/implementations/ItemRepository.ts:103-112,163-170`). Retry ONLY the `*_collection_number_unique` conflict; any other unique violation must surface.
- **Backward-compat (confirmed):** old collection ULID links keep working via the resolver; old **session/result** ULID links `404 → redirect to the list` (in-app nav only; external sharing uses `/shared-results/[token]`). No ULID fallback for session/result.
- **Testing bar (mem `testing-bar-routes-and-ui`):** every touched route + UI element gets a real test in `npm run test:ci`. Page routes are async Server Components, tested by `await Page({ params })` + RTL using the `vi.hoisted` + `vi.mock` pattern. **The auth mock MUST be the flat-replace form** `vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }))` — NOT the spread `await orig()` form (the spread pulls in uninstalled `nodemailer` and errors).
- **DB-backed tests live in `src/lib/db/`** so CI's `db-tests` job (`RUN_DB_TESTS=1 … src/lib/db`) collects them.
- **UI PRs ship light + dark screenshots** (`docs/cookbook/add-images-to-pr.md` / `/github-pr-screenshots`). Seed photo rows directly with private blobs if images are needed (Vercel-Blob client-upload callback can't reach localhost).
- **Beads/gh-sync is OFF.** Manage beads manually; do not re-enable.

## Review revisions (folded in after adversarial review, 2026-06-17)

The adversarial review returned **CONCERNS** (no BLOCK). These deltas supersede the
corresponding task steps; apply them when you reach each task.

**R1 — (Architect, MEDIUM) Kill the null-number deploy window.** After the migration
deploys but before the backfill runs, legacy sessions/results have `number = NULL`, so
list links render `/sort/null` / "Result #null" and clicking bounces to the list (no
fallback exists for numbers). **Fix:** fold the idempotent backfill into the deploy. In
`package.json`, change `vercel-build` from `npm run db:migrate && next build` to:

```json
    "vercel-build": "npm run db:migrate && npm run db:backfill-numbers && next build",
```

The backfill is idempotent (`WHERE number IS NULL` → no-op once done), so it is safe to
leave in permanently. Also add to Task 11 Step 5 smoke: "a **legacy (null-number)** session
in the list links to a real number after deploy, not `/sort/null`." (Do this in Task 6.)

**R2 — (QA, HIGH) Triage integrity-guard test must prove the guard *halts*.** Task 7 Step 7's
triage guard test reuses triage's non-throwing `redirect` mock, so the page keeps executing
and renders a cross-tenant UI while the test only checks `redirect` was called. **Fix:** in
`triage/page.test.tsx` AND `compare/page.test.tsx`, switch the `next/navigation` mock to the
throwing form and assert `rejects.toThrow`:

```tsx
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => { throw new Error("REDIRECT"); }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
```
```tsx
  it("redirects (and halts) when the resolved session belongs to a different collection", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_OTHER", number: 1, status: "active", curatorId: "u1" });
    await expect(TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });
```
The hero happy-path tests still pass (matching collection → no redirect → no throw).

**R3 — (QA, MED) Backfill test must cover `sort_results`.** Task 6 Step 1 only exercises
`sessionsTable`. Add a second `it` (same file) for the no-`deletedAt` table:

```ts
  it("numbers sort_results oldest-first per collection (no deletedAt column)", async () => {
    const { db } = getTestDb();
    const { sortResultsTable } = await import("@/lib/db/schema");
    const c = await new CollectionRepository(db).create({ id: generateId("coll"), ownerId: "u_bf", name: "BF2" });
    const raw = (createdAt: Date, name: string) => db.insert(sortResultsTable).values({
      id: generateId("result"), collectionId: c.id, curatorId: "u_bf", status: "draft",
      name, number: null, createdAt, updatedAt: createdAt, finalizedAt: null,
    });
    await raw(new Date("2026-02-02"), "B");
    await raw(new Date("2026-02-01"), "A");
    await backfillTable(db, sortResultsTable);
    const rows = await db.select({ number: sortResultsTable.number, name: sortResultsTable.name })
      .from(sortResultsTable).where(eq(sortResultsTable.collectionId, c.id)).orderBy(asc(sortResultsTable.createdAt));
    expect(rows.map((r) => r.number)).toEqual([1, 2]); // A (older) = 1, B = 2
  });
```

**R4 — (Architect/Data, MED) Backfill ordering determinism + the soft-delete invariant.** In
`src/lib/db/backfill-numbers.ts`, make ordering deterministic on `createdAt` ties and pin why
`deletedAt` is intentionally NOT filtered:

```ts
  const rows = await db
    .select({ id: table.id, collectionId: table.collectionId })
    .from(table)
    // No deletedAt filter: a soft-deleted session still owns its slot in the
    // (collection_id, number) unique index; numbering it (like getNextSessionNumber's
    // MAX-over-all-rows) prevents future number reuse/collision. asc(id) breaks
    // same-millisecond createdAt ties for deterministic numbering.
    .where(isNull(table.number))
    .orderBy(asc(table.createdAt), asc(table.id));
```

**R5 — (QA, MED) Race-retry unit test must prove the number is *recomputed*.** In BOTH
`SessionRepository.alloc.test.ts` and `SortResultRepository.alloc.test.ts`, capture the
`values()` arg and vary the stubbed max so the retry recomputes. Replace the db stub + retry
test (session shown; mirror for results with `sort_results_collection_number_unique` + `row(4)`):

```ts
const { selectWhere, valuesSpy, insertReturning } = vi.hoisted(() => ({
  selectWhere: vi.fn(),
  valuesSpy: vi.fn(() => ({ returning: insertReturningRef.fn })),
  insertReturning: vi.fn(),
}));
// simpler: keep insertReturning, make valuesSpy return the returning chain:
const insertReturning = vi.fn();
const valuesSpy = vi.fn(() => ({ returning: insertReturning }));
const db = {
  select: () => ({ from: () => ({ where: selectWhere }) }),
  insert: () => ({ values: valuesSpy }),
} as any;
```
```ts
  it("retries on the (collection,number) race AND recomputes the next number", async () => {
    selectWhere.mockResolvedValueOnce([{ max: 5 }]).mockResolvedValueOnce([{ max: 6 }]);
    insertReturning
      .mockRejectedValueOnce({ code: "23505", message: 'unique constraint "sessions_collection_number_unique"' })
      .mockResolvedValueOnce([row(7)]);
    const s = await new SessionRepository(db).create({ collectionId: "c1", curatorId: "u1" });
    expect(s.number).toBe(7);
    expect(valuesSpy.mock.calls[0][0].number).toBe(6); // first attempt tried 6
    expect(valuesSpy.mock.calls[1][0].number).toBe(7); // retry recomputed to 7
  });
```
(Keep the happy-path and the "does NOT retry sessions_active_unique/unrelated" tests; set their
`selectWhere` per-test instead of in `beforeEach`.)

**R6 — (Data, low) Non-concurrent index note.** In Task 1 Step 4, add: the `CREATE UNIQUE
INDEX` is built **non-concurrently** (drizzle-kit + the transactional postgres-js migrator
can't emit `CONCURRENTLY`), so it briefly write-locks the table — acceptable only because
`sessions`/`sort_results` are tiny; do not copy this pattern onto a large table.

**R7 — (Architect, low) Notes for the PR body.** (a) A **third** session-create path exists —
`/api/collections/[id]/sessions` POST → `SessionController.createSession` → `repo.create()` —
so it inherits number allocation for free once Task 3 lands; confirm its `route.test.ts` still
passes (it returns the repo entity). (b) New sessions created via `/api/sessions` now use the
repo's `sess_` id prefix instead of `session_`; IDs are opaque and never parsed, so historical
`session_` IDs keep resolving. (c) Tighten the existing `src/app/api/sessions/route.test.ts`
`selectWhere` stub to `[{ max: 0 }]` for honesty (currently `[{ id: "s1" }]` works only via
`?? 0`).

**R8 — (QA, optional) Un-mocked page→repo→DB resolver+guard test.** The page→repo seam is only
ever mocked. The repo→DB resolution is covered un-mocked (Tasks 3c/4c), and arg-order is
type-checked, so this is optional — but if added, follow the `src/lib/db/file-route-authz.integration.test.ts`
precedent (import a real route/repo pair, seed a cross-collection row, assert the guard).

**R9 — RESOLVED (Option A): SessionCompleteScreen kept+fixed; `/api/sort-results` POST deferred.**
`SessionCompleteScreen` is dead code but the bead names it, so 9hl **keeps** Task 9 Steps 4–5
(fix its slug+number URL generation + the component test; its `fetch` response is mocked, so the
test is valid even though the component is unmounted). 9hl does **NOT** touch `/api/sort-results`
POST: routing it through the repo AND adding the missing collection-access guard are **moved to
`purses-axn`** (P1 security). Task 5 below is now **sessions-only** — its old sort-results step
and the sort-results route test are removed. The sessions POST (the live session-create path)
stays in 9hl.

---

## File Structure

**Created:**
- `drizzle/0003_*.sql` (generated migration)
- `src/lib/db/backfill-numbers.ts` (importable backfill logic — the testable seam)
- `scripts/backfill-session-result-numbers.ts` (one-shot runner, wires the DB connection)
- `src/lib/db/session-number.integration.test.ts` (DB-gated)
- `src/lib/db/result-number.integration.test.ts` (DB-gated)
- `src/lib/db/backfill-numbers.integration.test.ts` (DB-gated)
- `src/server/repositories/implementations/SessionRepository.alloc.test.ts` (unit; number alloc + race retry)
- `src/server/repositories/implementations/SortResultRepository.alloc.test.ts` (unit)
- Net-new page/component tests: `results/page.test.tsx`, `sort/page.test.tsx`, `collections/[id]/page.test.tsx`, `results/[resultNumber]/finalize/page.test.tsx`, `StartSessionForm.test.tsx`, `FinalizeResultForm.test.tsx`, `SessionCompleteScreen.test.tsx`

**Renamed (directory + co-located test):**
- `src/app/collections/[id]/sort/[sessionId]/` → `…/sort/[sessionNumber]/` (page, triage, compare + their tests)
- `src/app/collections/[id]/results/[resultId]/` → `…/results/[resultNumber]/` (page, finalize + test)

**Modified:**
- `src/lib/db/schema.ts` (two tables)
- `src/types/domain.ts` (`Session`, `SortResult`)
- `src/server/repositories/SessionRepository.ts`, `SortResultRepository.ts` (interfaces)
- `src/server/repositories/implementations/SessionRepository.ts`, `SortResultRepository.ts` (impls)
- `src/app/api/sessions/route.ts`, `src/app/api/sort-results/route.ts` (POST → repo)
- `package.json` (npm script)
- The renamed page files + `sort/page.tsx`, `results/page.tsx`, `collections/[id]/page.tsx`, `collections/[id]/edit/page.tsx`, `sort/new/page.tsx`
- `src/features/sorting/StartSessionForm.tsx`, `src/features/results/FinalizeResultForm.tsx`, `src/features/sessions/SessionCompleteScreen.tsx`

**The one rule (memorize):** in a `[…Number]` page, `params.<x>Number` is a *string to parse for nav resolution only*. The moment you need data — a dependent DB query, a client `fetch` prop, an integrity check — use the **resolved entity's `.id`** (ULID). Nav `href`s use the entity's `.number`.

---

## Task 1: Schema — `number` column + unique index on both tables

**Files:**
- Modify: `src/lib/db/schema.ts` (`sessionsTable` ~171-195, `sortResultsTable` ~249-269)
- Create: `drizzle/0003_*.sql` (generated)

- [ ] **Step 1: Add `number` + unique index to `sessionsTable`**

In `src/lib/db/schema.ts`, add the `number` column and the unique index to `sessionsTable`:

```ts
export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    curatorId: text("curator_id")
      .notNull()
      .references(() => user.id),
    number: integer("number"),
    status: text("status").default("active").notNull(),
    goal: text("goal"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    collectionIdx: index("sessions_collection_id_idx").on(table.collectionId),
    curatorIdx: index("sessions_curator_id_idx").on(table.curatorId),
    activeIdx: uniqueIndex("sessions_active_unique").on(
      table.collectionId,
      table.curatorId,
    ),
    collectionNumberUnique: uniqueIndex("sessions_collection_number_unique").on(
      table.collectionId,
      table.number,
    ),
  }),
);
```

- [ ] **Step 2: Add `number` + unique index to `sortResultsTable`**

```ts
export const sortResultsTable = pgTable(
  "sort_results",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id),
    curatorId: text("curator_id")
      .notNull()
      .references(() => user.id),
    number: integer("number"),
    status: text("status").default("draft").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    finalizedAt: timestamp("finalized_at"),
  },
  (table) => ({
    collectionIdx: index("sort_results_collection_id_idx").on(table.collectionId),
    curatorIdx: index("sort_results_curator_id_idx").on(table.curatorId),
    collectionNumberUnique: uniqueIndex("sort_results_collection_number_unique").on(
      table.collectionId,
      table.number,
    ),
  }),
);
```

(`integer` and `uniqueIndex` are already imported at the top of the file.)

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0003_<name>.sql` containing four statements:
- `ALTER TABLE "sessions" ADD COLUMN "number" integer;`
- `CREATE UNIQUE INDEX "sessions_collection_number_unique" ON "sessions" ("collection_id","number");`
- `ALTER TABLE "sort_results" ADD COLUMN "number" integer;`
- `CREATE UNIQUE INDEX "sort_results_collection_number_unique" ON "sort_results" ("collection_id","number");`

- [ ] **Step 4: Verify nullable + no DEFAULT**

Confirm the generated SQL does **not** add `NOT NULL` and does **not** add a `DEFAULT`. Existing rows get `number = NULL`; Postgres treats each NULL as distinct in a unique index, so the index is satisfiable on legacy data before backfill (same approach as `collections.slug` and `items.number`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(purses-9hl): add number column + unique index to sessions & sort_results"
```

---

## Task 2: Domain types + repository interfaces

**Files:**
- Modify: `src/types/domain.ts` (`Session` ~114-123, `SortResult` ~169-178)
- Modify: `src/server/repositories/SessionRepository.ts`, `src/server/repositories/SortResultRepository.ts`

- [ ] **Step 1: Add `number` to `Session` and `SortResult`**

In `src/types/domain.ts`:

```ts
export interface Session {
  id: string;
  collectionId: string;
  curatorId: string;
  number: number | null;
  status: SessionStatus;
  goal: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

```ts
export interface SortResult {
  id: string;
  collectionId: string;
  curatorId: string;
  number: number | null;
  status: SortResultStatus;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
}
```

- [ ] **Step 2: Add `findByCollectionAndNumber` to both interfaces**

In `src/server/repositories/SessionRepository.ts`, add to `ISessionRepository`:

```ts
  findByCollectionAndNumber(collectionId: string, number: number): Promise<Session | null>;
```

In `src/server/repositories/SortResultRepository.ts`, add to `ISortResultRepository`:

```ts
  findByCollectionAndNumber(collectionId: string, number: number): Promise<SortResult | null>;
```

- [ ] **Step 3: Verify it fails to compile (drives Task 3 & 4)**

Run: `npx tsc --noEmit`
Expected: errors — `SessionRepository`/`SortResultRepository` do not implement `findByCollectionAndNumber`; `mapToSession`/`mapToResult` return objects missing `number`. Fixed in Tasks 3–4.

- [ ] **Step 4: Commit**

```bash
git add src/types/domain.ts src/server/repositories/SessionRepository.ts src/server/repositories/SortResultRepository.ts
git commit -m "feat(purses-9hl): Session/SortResult.number type + findByCollectionAndNumber interface"
```

---

## Task 3: SessionRepository — number allocation, findByCollectionAndNumber

**Files:**
- Modify: `src/server/repositories/implementations/SessionRepository.ts`
- Create: `src/server/repositories/implementations/SessionRepository.alloc.test.ts` (unit)
- Create: `src/lib/db/session-number.integration.test.ts` (DB-gated)

### 3a — Unit test for allocation + race retry (write first)

- [ ] **Step 1: Write the failing unit test**

```ts
// src/server/repositories/implementations/SessionRepository.alloc.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SessionRepository } from "./SessionRepository";

const { selectWhere, insertReturning } = vi.hoisted(() => ({
  selectWhere: vi.fn(),
  insertReturning: vi.fn(),
}));

// Minimal drizzle chain stub: select(...).from(...).where() and insert(...).values(...).returning().
const db = {
  select: () => ({ from: () => ({ where: selectWhere }) }),
  insert: () => ({ values: () => ({ returning: insertReturning }) }),
} as any;

const row = (number: number) => ({
  id: "sess_1",
  collectionId: "c1",
  curatorId: "u1",
  number,
  status: "active",
  goal: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  selectWhere.mockResolvedValue([{ max: 5 }]); // getNextSessionNumber -> 6
});

describe("SessionRepository.create number allocation", () => {
  it("allocates MAX+1 on the happy path", async () => {
    insertReturning.mockResolvedValue([row(6)]);
    const s = await new SessionRepository(db).create({ collectionId: "c1", curatorId: "u1" });
    expect(s.number).toBe(6);
    expect(insertReturning).toHaveBeenCalledTimes(1);
  });

  it("retries on the (collection, number) unique race, then succeeds", async () => {
    insertReturning
      .mockRejectedValueOnce({ code: "23505", message: 'duplicate key value violates unique constraint "sessions_collection_number_unique"' })
      .mockResolvedValueOnce([row(7)]);
    const s = await new SessionRepository(db).create({ collectionId: "c1", curatorId: "u1" });
    expect(s.number).toBe(7);
    expect(insertReturning).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry the one-session-per-curator constraint — it surfaces", async () => {
    insertReturning.mockRejectedValueOnce({ code: "23505", message: 'duplicate key value violates unique constraint "sessions_active_unique"' });
    await expect(new SessionRepository(db).create({ collectionId: "c1", curatorId: "u1" })).rejects.toMatchObject({ code: "23505" });
    expect(insertReturning).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/repositories/implementations/SessionRepository.alloc.test.ts`
Expected: FAIL — `s.number` is `undefined` (current `mapToSession` has no `number`) and no retry loop exists.

### 3b — Implementation

- [ ] **Step 3: Rewrite `SessionRepository.ts`**

Replace the full contents of `src/server/repositories/implementations/SessionRepository.ts`:

```ts
import { eq, and, isNull, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sessionsTable } from "@/lib/db/schema";
import type { ISessionRepository } from "../SessionRepository";
import type { Session } from "@/types";
import { generateId } from "@/lib/id";

export class SessionRepository implements ISessionRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    curatorId: string;
    goal?: string;
  }): Promise<Session> {
    const base = {
      id: data.id || generateId("sess"),
      collectionId: data.collectionId,
      curatorId: data.curatorId,
      status: "active",
      goal: data.goal || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    // Auto-allocate MAX+1, retry on the UNIQUE(collection_id, number) race
    // (neon-http is stateless — no long transaction to lock the max). Any other
    // unique violation (e.g. sessions_active_unique) surfaces, not retried.
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.getNextSessionNumber(data.collectionId);
      try {
        const [session] = await this.db
          .insert(sessionsTable)
          .values({ ...base, number })
          .returning();
        return this.mapToSession(session);
      } catch (error) {
        if (isSessionNumberConflict(error) && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error("Could not allocate a session number");
  }

  async findById(id: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, id), isNull(sessionsTable.deletedAt)));
    return session ? this.mapToSession(session) : null;
  }

  async findByCollectionAndNumber(
    collectionId: string,
    number: number,
  ): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.collectionId, collectionId),
          eq(sessionsTable.number, number),
          isNull(sessionsTable.deletedAt),
        ),
      );
    return session ? this.mapToSession(session) : null;
  }

  async getNextSessionNumber(collectionId: string): Promise<number> {
    // MAX over ALL rows (incl. soft-deleted) — a deleted session still holds its
    // number in the UNIQUE(collection_id, number) index, so reusing it would
    // collide. Resolution (findByCollectionAndNumber) excludes deleted rows.
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${sessionsTable.number})` })
      .from(sessionsTable)
      .where(eq(sessionsTable.collectionId, collectionId));
    return (row?.max ?? 0) + 1;
  }

  async findActive(collectionId: string, curatorId: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.collectionId, collectionId),
          eq(sessionsTable.curatorId, curatorId),
          eq(sessionsTable.status, "active"),
          isNull(sessionsTable.deletedAt),
        ),
      );
    return session ? this.mapToSession(session) : null;
  }

  async findByCollection(collectionId: string): Promise<Session[]> {
    const sessions = await this.db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.collectionId, collectionId), isNull(sessionsTable.deletedAt)));
    return sessions.map((s) => this.mapToSession(s));
  }

  async update(id: string, data: Partial<Session>): Promise<Session> {
    const [session] = await this.db
      .update(sessionsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sessionsTable.id, id))
      .returning();
    return this.mapToSession(session);
  }

  async softDelete(id: string): Promise<Session> {
    const [session] = await this.db
      .update(sessionsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessionsTable.id, id))
      .returning();
    return this.mapToSession(session);
  }

  private mapToSession(row: any): Session {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      number: row.number ?? null,
      status: row.status as "active" | "paused" | "completed" | "abandoned" | "deleted",
      goal: row.goal,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

function isSessionNumberConflict(error: unknown): boolean {
  // Retry ONLY the UNIQUE(collection_id, number) race — any other unique
  // violation (incl. sessions_active_unique) is a real condition and must surface.
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "23505" && message.includes("sessions_collection_number_unique");
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run src/server/repositories/implementations/SessionRepository.alloc.test.ts`
Expected: PASS (3 tests).

### 3c — DB integration test (sequential numbers, un-mocked)

- [ ] **Step 5: Write the DB-gated test**

```ts
// src/lib/db/session-number.integration.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { generateId } from "@/lib/id";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("session number allocation (repo -> DB)", () => {
  function seedOwner(id: string, email: string) {
    const { db } = getTestDb();
    return db.execute(sql`
      INSERT INTO "user" (id, name, email) VALUES (${id}, 'T', ${email})
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async function newCollection(ownerId: string) {
    return new CollectionRepository(getTestDb().db).create({
      id: generateId("coll"),
      ownerId,
      name: "Numbers",
    });
  }

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("assigns sequential per-collection numbers starting at 1", async () => {
    await seedOwner("u_a", "a@t.dev");
    await seedOwner("u_b", "b@t.dev");
    const { db } = getTestDb();
    const collection = await newCollection("u_a");
    const repo = new SessionRepository(db);

    // sessions_active_unique caps one session per (collection, curator), so vary curators.
    const s1 = await repo.create({ collectionId: collection.id, curatorId: "u_a" });
    const s2 = await repo.create({ collectionId: collection.id, curatorId: "u_b" });
    expect(s1.number).toBe(1);
    expect(s2.number).toBe(2);

    // A second collection numbers independently.
    const other = await newCollection("u_a");
    const s3 = await repo.create({ collectionId: other.id, curatorId: "u_a" });
    expect(s3.number).toBe(1);
  });

  it("findByCollectionAndNumber resolves the right session and ignores soft-deleted", async () => {
    await seedOwner("u_a", "a@t.dev");
    const { db } = getTestDb();
    const collection = await newCollection("u_a");
    const repo = new SessionRepository(db);
    const s1 = await repo.create({ collectionId: collection.id, curatorId: "u_a" });

    expect((await repo.findByCollectionAndNumber(collection.id, 1))?.id).toBe(s1.id);
    expect(await repo.findByCollectionAndNumber(collection.id, 99)).toBeNull();

    await repo.softDelete(s1.id);
    expect(await repo.findByCollectionAndNumber(collection.id, 1)).toBeNull();
  });
});
```

- [ ] **Step 6: Run the DB test**

Run: `npm run test:db -- session-number`
Expected: PASS (2 tests). (Requires Docker; the script boots ephemeral Postgres + applies migrations.)

- [ ] **Step 7: Commit**

```bash
git add src/server/repositories/implementations/SessionRepository.ts src/server/repositories/implementations/SessionRepository.alloc.test.ts src/lib/db/session-number.integration.test.ts
git commit -m "feat(purses-9hl): SessionRepository number allocation + findByCollectionAndNumber"
```

---

## Task 4: SortResultRepository — number allocation, findByCollectionAndNumber

**Files:**
- Modify: `src/server/repositories/implementations/SortResultRepository.ts`
- Create: `src/server/repositories/implementations/SortResultRepository.alloc.test.ts` (unit)
- Create: `src/lib/db/result-number.integration.test.ts` (DB-gated)

> Note: `sort_results` has **no `deletedAt`** (no soft delete). `findByCollectionAndNumber` therefore does NOT filter by `deletedAt`, mirroring the existing `findById`.

### 4a — Unit test (write first)

- [ ] **Step 1: Write the failing unit test**

```ts
// src/server/repositories/implementations/SortResultRepository.alloc.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SortResultRepository } from "./SortResultRepository";

const { selectWhere, insertReturning } = vi.hoisted(() => ({
  selectWhere: vi.fn(),
  insertReturning: vi.fn(),
}));

const db = {
  select: () => ({ from: () => ({ where: selectWhere }) }),
  insert: () => ({ values: () => ({ returning: insertReturning }) }),
} as any;

const row = (number: number) => ({
  id: "res_1",
  collectionId: "c1",
  curatorId: "u1",
  number,
  status: "draft",
  name: "R",
  createdAt: new Date(),
  updatedAt: new Date(),
  finalizedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  selectWhere.mockResolvedValue([{ max: 2 }]); // -> 3
});

describe("SortResultRepository.create number allocation", () => {
  it("allocates MAX+1 on the happy path", async () => {
    insertReturning.mockResolvedValue([row(3)]);
    const r = await new SortResultRepository(db).create({ collectionId: "c1", curatorId: "u1", name: "R", status: "draft" });
    expect(r.number).toBe(3);
    expect(insertReturning).toHaveBeenCalledTimes(1);
  });

  it("retries on the (collection, number) unique race, then succeeds", async () => {
    insertReturning
      .mockRejectedValueOnce({ code: "23505", message: 'duplicate key value violates unique constraint "sort_results_collection_number_unique"' })
      .mockResolvedValueOnce([row(4)]);
    const r = await new SortResultRepository(db).create({ collectionId: "c1", curatorId: "u1", name: "R", status: "draft" });
    expect(r.number).toBe(4);
    expect(insertReturning).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry an unrelated unique violation", async () => {
    insertReturning.mockRejectedValueOnce({ code: "23505", message: 'some other constraint' });
    await expect(new SortResultRepository(db).create({ collectionId: "c1", curatorId: "u1", name: "R", status: "draft" })).rejects.toMatchObject({ code: "23505" });
    expect(insertReturning).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/server/repositories/implementations/SortResultRepository.alloc.test.ts`
Expected: FAIL — no `number`, no retry loop.

### 4b — Implementation

- [ ] **Step 3: Rewrite `SortResultRepository.ts`**

Replace the full contents of `src/server/repositories/implementations/SortResultRepository.ts`:

```ts
import { eq, and, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sortResultsTable } from "@/lib/db/schema";
import type { ISortResultRepository } from "../SortResultRepository";
import type { SortResult } from "@/types";
import { generateId } from "@/lib/id";

export class SortResultRepository implements ISortResultRepository {
  constructor(private db: Database) {}

  async create(data: {
    id?: string;
    collectionId: string;
    curatorId: string;
    name: string;
    status: "draft" | "finalized";
  }): Promise<SortResult> {
    const base = {
      id: data.id || generateId("result"),
      collectionId: data.collectionId,
      curatorId: data.curatorId,
      name: data.name,
      status: data.status,
      createdAt: new Date(),
      updatedAt: new Date(),
      finalizedAt: null,
    };

    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await this.getNextResultNumber(data.collectionId);
      try {
        const [result] = await this.db
          .insert(sortResultsTable)
          .values({ ...base, number })
          .returning();
        return this.mapToResult(result);
      } catch (error) {
        if (isResultNumberConflict(error) && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error("Could not allocate a result number");
  }

  async findById(id: string): Promise<SortResult | null> {
    const [result] = await this.db
      .select()
      .from(sortResultsTable)
      .where(eq(sortResultsTable.id, id));
    return result ? this.mapToResult(result) : null;
  }

  async findByCollectionAndNumber(
    collectionId: string,
    number: number,
  ): Promise<SortResult | null> {
    const [result] = await this.db
      .select()
      .from(sortResultsTable)
      .where(
        and(
          eq(sortResultsTable.collectionId, collectionId),
          eq(sortResultsTable.number, number),
        ),
      );
    return result ? this.mapToResult(result) : null;
  }

  async getNextResultNumber(collectionId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${sortResultsTable.number})` })
      .from(sortResultsTable)
      .where(eq(sortResultsTable.collectionId, collectionId));
    return (row?.max ?? 0) + 1;
  }

  async findByCollection(collectionId: string): Promise<SortResult[]> {
    const results = await this.db
      .select()
      .from(sortResultsTable)
      .where(eq(sortResultsTable.collectionId, collectionId));
    return results.map((r) => this.mapToResult(r));
  }

  async findDraft(collectionId: string, curatorId: string): Promise<SortResult | null> {
    const [result] = await this.db
      .select()
      .from(sortResultsTable)
      .where(
        and(
          eq(sortResultsTable.collectionId, collectionId),
          eq(sortResultsTable.curatorId, curatorId),
          eq(sortResultsTable.status, "draft"),
        ),
      );
    return result ? this.mapToResult(result) : null;
  }

  async update(id: string, data: Partial<SortResult>): Promise<SortResult> {
    const [result] = await this.db
      .update(sortResultsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sortResultsTable.id, id))
      .returning();
    return this.mapToResult(result);
  }

  private mapToResult(row: any): SortResult {
    return {
      id: row.id,
      collectionId: row.collectionId,
      curatorId: row.curatorId,
      number: row.number ?? null,
      status: row.status as "draft" | "finalized",
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      finalizedAt: row.finalizedAt,
    };
  }
}

function isResultNumberConflict(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "23505" && message.includes("sort_results_collection_number_unique");
}
```

- [ ] **Step 4: Run the unit test**

Run: `npx vitest run src/server/repositories/implementations/SortResultRepository.alloc.test.ts`
Expected: PASS (3 tests).

### 4c — DB integration test

- [ ] **Step 5: Write the DB-gated test**

```ts
// src/lib/db/result-number.integration.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { generateId } from "@/lib/id";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("result number allocation (repo -> DB)", () => {
  async function seedOwner() {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO "user" (id, name, email) VALUES ('u_r', 'T', 'r@t.dev')
      ON CONFLICT (id) DO NOTHING
    `);
  }
  async function newCollection() {
    return new CollectionRepository(getTestDb().db).create({ id: generateId("coll"), ownerId: "u_r", name: "Results" });
  }

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("assigns sequential per-collection numbers and resolves them", async () => {
    const { db } = getTestDb();
    const c = await newCollection();
    const repo = new SortResultRepository(db);
    const r1 = await repo.create({ collectionId: c.id, curatorId: "u_r", name: "A", status: "draft" });
    const r2 = await repo.create({ collectionId: c.id, curatorId: "u_r", name: "B", status: "draft" });
    expect([r1.number, r2.number]).toEqual([1, 2]);
    expect((await repo.findByCollectionAndNumber(c.id, 2))?.id).toBe(r2.id);
    expect(await repo.findByCollectionAndNumber(c.id, 3)).toBeNull();

    const other = await newCollection();
    const r3 = await repo.create({ collectionId: other.id, curatorId: "u_r", name: "C", status: "draft" });
    expect(r3.number).toBe(1);
  });
});
```

- [ ] **Step 6: Run the DB test**

Run: `npm run test:db -- result-number`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add src/server/repositories/implementations/SortResultRepository.ts src/server/repositories/implementations/SortResultRepository.alloc.test.ts src/lib/db/result-number.integration.test.ts
git commit -m "feat(purses-9hl): SortResultRepository number allocation + findByCollectionAndNumber"
```

---

## Task 5: Route the sessions POST through the repository (so session numbers are allocated)

The `/api/sessions` POST currently inserts directly via `db.insert(...)`, bypassing the repo — so without this a session created on the live path (StartSessionForm → `/api/sessions`) gets `number = NULL` and is unreachable by number. Route it through `SessionRepository.create()`, where allocation lives.

> **Scope (review R9):** the `/api/sort-results` POST changes (repo-routing + the missing collection-access guard) are **deferred to `purses-axn`** (P1 security), NOT done here. 9hl does not touch `/api/sort-results`. Its only caller, `SessionCompleteScreen`, is dead; its URL generation is still fixed in Task 9.

**Files:**
- Modify: `src/app/api/sessions/route.ts`

**Interfaces consumed:** `SessionRepository.create({collectionId, curatorId, goal})` from Task 3.

- [ ] **Step 1: `/api/sessions` POST → `SessionRepository.create`**

In `src/app/api/sessions/route.ts`: add the repo import, replace the raw insert in `POST`, and drop the now-unused `generateId` import (keep `sessionsTable` + `eq` — `GET` still uses them).

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessionsTable } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, goal } = await req.json();
  if (!collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });
  const db = getDb();
  const access = await requireApiCollectionAccess(db, collectionId, session.user.id);
  if (access instanceof NextResponse) return access;

  const newSession = await new SessionRepository(db).create({
    collectionId,
    curatorId: session.user.id,
    goal,
  });
  return NextResponse.json(newSession, { status: 201 });
}
```

(Leave `GET` unchanged.)

- [ ] **Step 2: Verify the existing sessions route test still passes + tighten the stub (R7c)**

The new POST constructs `new SessionRepository(db)`, whose `create` calls `db.select` (getNextSessionNumber) then `db.insert` — both already stubbed by the existing test's `getDb` mock, so it passes unchanged (confirmed in review). For honesty, update the `selectWhere` stub in `src/app/api/sessions/route.test.ts` (line ~23) from `[{ id: "s1" }]` to `[{ max: 0 }]`.

Run: `npx vitest run src/app/api/sessions/route.test.ts`
Expected: PASS (POST 401/403/201, GET 400/403/200).

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/api/sessions/route.ts src/app/api/sessions/route.test.ts
git commit -m "feat(purses-9hl): allocate session number via repo on /api/sessions POST"
```

---

## Task 6: One-shot backfill (sessions + results)

**Files:**
- Create: `src/lib/db/backfill-numbers.ts` (importable logic — the testable seam)
- Create: `scripts/backfill-session-result-numbers.ts` (runner)
- Create: `src/lib/db/backfill-numbers.integration.test.ts` (DB-gated)
- Modify: `package.json` (npm script)

Context: CI/test DBs start empty (rows get numbers from `create()`); only **production** has pre-existing NULL-number rows. The column is nullable and pages redirect on a missing number, so prod is safe before this runs — backfill upgrades existing sessions/results to reachable numbers. Run once, manually, post-deploy. Idempotent (`WHERE number IS NULL`, continuing past any existing MAX).

### 6a — Backfill test (write first)

- [ ] **Step 1: Write the failing DB-gated test**

```ts
// src/lib/db/backfill-numbers.integration.test.ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql, eq, asc } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { sessionsTable } from "@/lib/db/schema";
import { backfillTable } from "./backfill-numbers";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { generateId } from "@/lib/id";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("backfillTable assigns 1..n per collection by createdAt", () => {
  async function seedOwner() {
    const { db } = getTestDb();
    await db.execute(sql`INSERT INTO "user" (id, name, email) VALUES ('u_bf','T','bf@t.dev') ON CONFLICT (id) DO NOTHING`);
  }
  // Insert a session row directly with an explicit createdAt and NULL number.
  async function rawSession(collectionId: string, curatorId: string, createdAt: Date) {
    const { db } = getTestDb();
    await db.insert(sessionsTable).values({
      id: generateId("sess"), collectionId, curatorId, status: "active",
      goal: null, number: null, createdAt, updatedAt: createdAt, deletedAt: null,
    });
  }
  function numbersByCreatedAt(collectionId: string) {
    const { db } = getTestDb();
    return db.select({ number: sessionsTable.number })
      .from(sessionsTable).where(eq(sessionsTable.collectionId, collectionId))
      .orderBy(asc(sessionsTable.createdAt));
  }

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("numbers oldest-first, is idempotent, and continues past existing max", async () => {
    const { db } = getTestDb();
    const c = await new CollectionRepository(db).create({ id: generateId("coll"), ownerId: "u_bf", name: "BF" });
    // distinct curators (sessions_active_unique), staggered createdAt
    await rawSession(c.id, "c_3", new Date("2026-01-03"));
    await rawSession(c.id, "c_1", new Date("2026-01-01"));
    await rawSession(c.id, "c_2", new Date("2026-01-02"));

    await backfillTable(db, sessionsTable);
    expect((await numbersByCreatedAt(c.id)).map((r) => r.number)).toEqual([1, 2, 3]);

    // Idempotent: re-run changes nothing.
    await backfillTable(db, sessionsTable);
    expect((await numbersByCreatedAt(c.id)).map((r) => r.number)).toEqual([1, 2, 3]);

    // A new NULL-number row continues from max.
    await rawSession(c.id, "c_4", new Date("2026-01-04"));
    await backfillTable(db, sessionsTable);
    expect((await numbersByCreatedAt(c.id)).map((r) => r.number)).toEqual([1, 2, 3, 4]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db -- backfill-numbers`
Expected: FAIL — `Cannot find module './backfill-numbers'`.

### 6b — Implementation

- [ ] **Step 3: Write the importable backfill logic**

```ts
// src/lib/db/backfill-numbers.ts
import { sql, isNull, eq, asc } from "drizzle-orm";
import { sessionsTable, sortResultsTable } from "@/lib/db/schema";

type NumberedTable = typeof sessionsTable | typeof sortResultsTable;

/**
 * Assign per-collection sequential numbers to every row whose `number` is NULL,
 * oldest (createdAt) first, continuing after the collection's current MAX.
 * Idempotent: rows that already have a number are untouched.
 */
export async function backfillTable(db: any, table: NumberedTable): Promise<number> {
  const rows = await db
    .select({ id: table.id, collectionId: table.collectionId })
    .from(table)
    .where(isNull(table.number))
    .orderBy(asc(table.createdAt));

  const byCollection = new Map<string, string[]>();
  for (const r of rows) {
    const list = byCollection.get(r.collectionId) ?? [];
    list.push(r.id);
    byCollection.set(r.collectionId, list);
  }

  let updated = 0;
  for (const [collectionId, ids] of byCollection) {
    const [{ max }] = await db
      .select({ max: sql<number | null>`max(${table.number})` })
      .from(table)
      .where(eq(table.collectionId, collectionId));
    let next = (max ?? 0) + 1;
    for (const id of ids) {
      await db.update(table).set({ number: next }).where(eq(table.id, id));
      next++;
      updated++;
    }
  }
  return updated;
}

export async function backfillNumbers(db: any): Promise<void> {
  const sessions = await backfillTable(db, sessionsTable);
  const results = await backfillTable(db, sortResultsTable);
  console.log(`  sessions: ${sessions} rows; sort_results: ${results} rows`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db -- backfill-numbers`
Expected: PASS (1 test).

- [ ] **Step 5: Write the runner script**

```ts
// scripts/backfill-session-result-numbers.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import { backfillNumbers } from "@/lib/db/backfill-numbers";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  console.log("Backfilling session + result numbers…");
  await backfillNumbers(db as any);
  console.log("✅ Backfill complete");
  await client.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("❌ Backfill failed:", e);
  process.exit(1);
});
```

- [ ] **Step 6: Add the npm script**

In `package.json` scripts (next to `db:backfill-slugs`):

```json
    "db:backfill-numbers": "node -r esbuild-register scripts/backfill-session-result-numbers.ts",
```

- [ ] **Step 7: Type-check + commit**

```bash
npx tsc --noEmit
git add src/lib/db/backfill-numbers.ts scripts/backfill-session-result-numbers.ts src/lib/db/backfill-numbers.integration.test.ts package.json
git commit -m "feat(purses-9hl): idempotent backfill for session & result numbers"
```

---

## Task 7: Rename `[sessionId]` → `[sessionNumber]` and refactor the 3 sort pages

**Files (rename with `git mv`, keeping the co-located tests):**
- `src/app/collections/[id]/sort/[sessionId]/page.tsx` (+ `page.test.tsx`)
- `src/app/collections/[id]/sort/[sessionId]/triage/page.tsx` (+ `page.test.tsx`)
- `src/app/collections/[id]/sort/[sessionId]/compare/page.tsx` (+ `page.test.tsx`)

**Interfaces consumed:** `SessionRepository.findByCollectionAndNumber` (Task 3). Client components `DecisionControls`/`CompareChoice` are **unchanged** — they still receive the session **ULID** (`sortSession.id`), which is what they `fetch` with.

- [ ] **Step 1: Rename the directory**

```bash
git mv "src/app/collections/[id]/sort/[sessionId]" "src/app/collections/[id]/sort/[sessionNumber]"
```

- [ ] **Step 2: Update `page.test.tsx` (drive the new resolver + guard)**

Replace `src/app/collections/[id]/sort/[sessionNumber]/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, redirectMock, sessionRepo, decisionRepo, itemRepo, prefRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  sessionRepo: { findByCollectionAndNumber: vi.fn() },
  decisionRepo: { findBySession: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  prefRepo: { findByCollection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(() => decisionRepo) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(() => prefRepo) }));
vi.mock("@/features/sessions/SessionAnalytics", () => ({ SessionAnalytics: () => <div>analytics</div> }));

import SessionDetailPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_REAL", slug: "summer-bags", name: "Summer Bags" });
  itemRepo.findByCollection.mockResolvedValue([]);
  prefRepo.findByCollection.mockResolvedValue([]);
  decisionRepo.findBySession.mockResolvedValue([]);
});

describe("SessionDetailPage resolution + integrity guard", () => {
  it("redirects when the resolved session belongs to a different collection (guard survives)", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "s1", collectionId: "coll_OTHER", number: 1, status: "active", curatorId: "u1" });
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalled();
  });
  it("redirects when no session has that number", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue(null);
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "9" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects on a non-numeric segment without hitting the repo", async () => {
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "abc" } })).rejects.toThrow("REDIRECT");
    expect(sessionRepo.findByCollectionAndNumber).not.toHaveBeenCalled();
  });
  it("renders when the session belongs to the resolved collection", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "s1", collectionId: "coll_REAL", number: 1, status: "active", curatorId: "u1" });
    const ui = await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run "src/app/collections/[id]/sort/[sessionNumber]/page.test.tsx"`
Expected: FAIL — page still reads `params.sessionId` / calls `findById`.

- [ ] **Step 4: Refactor `[sessionNumber]/page.tsx`**

Apply these edits to `src/app/collections/[id]/sort/[sessionNumber]/page.tsx`:

Interface + resolution (replace lines ~14-42):

```tsx
interface SessionPageProps {
  params: { id: string; sessionNumber: string };
}

export default async function SortSessionPage({ params }: SessionPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const itemRepo = new ItemRepository(db);
  const sessionRepo = new SessionRepository(db);
  const prefRepo = new CollectionPreferenceItemRepository(db);
  const decisionRepo = new DecisionEventRepository(db);

  const sessionNumber = Number(params.sessionNumber);
  const [items, sortSession] = await Promise.all([
    itemRepo.findByCollection(collection.id),
    sessionNumber > 0 && Number.isInteger(sessionNumber)
      ? sessionRepo.findByCollectionAndNumber(collection.id, sessionNumber)
      : Promise.resolve(null),
  ]);

  // #196 integrity guard — kept verbatim; redundant with the resolver but defends
  // against any future resolver change. Never compare against params.id.
  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  const [preferences, decisions] = await Promise.all([
    prefRepo.findByCollection(collection.id, sortSession.curatorId),
    decisionRepo.findBySession(sortSession.id),
  ]);
```

Then in the JSX, change the two nav links (was `${params.sessionId}`):

```tsx
          <Link href={`/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}/triage`}>
```
```tsx
          <Link href={`/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}/compare`}>
```

(The `bucketCounts`/`progress`/`SessionAnalytics` block is unchanged.)

- [ ] **Step 5: Refactor `triage/page.tsx`**

In `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx`:

Interface + resolution (replace lines ~15-38):

```tsx
interface TriagePageProps {
  params: { id: string; sessionNumber: string };
}

export default async function TriagePage({ params }: TriagePageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const itemRepo = new ItemRepository(db);
  const sessionRepo = new SessionRepository(db);
  const prefRepo = new CollectionPreferenceItemRepository(db);

  const sessionNumber = Number(params.sessionNumber);
  const [items, sortSession, preferences] = await Promise.all([
    itemRepo.findByCollection(collection.id),
    sessionNumber > 0 && Number.isInteger(sessionNumber)
      ? sessionRepo.findByCollectionAndNumber(collection.id, sessionNumber)
      : Promise.resolve(null),
    prefRepo.findByCollection(collection.id, session.user.id),
  ]);

  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }
```

Breadcrumb "Session" link (was `${params.sessionId}`):

```tsx
        { label: "Session", href: `/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}` },
```

`DecisionControls` — pass the session **ULID** (was `params.sessionId`):

```tsx
              <DecisionControls
                sessionId={sortSession.id}
                type="triage"
```

- [ ] **Step 6: Refactor `compare/page.tsx`**

In `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx`, resolve the session **before** the data fetch (decisions need `sortSession.id`):

Replace lines ~16-41:

```tsx
interface ComparePageProps {
  params: { id: string; sessionNumber: string };
}

export default async function ComparePage({ params }: ComparePageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const itemRepo = new ItemRepository(db);
  const sessionRepo = new SessionRepository(db);
  const prefRepo = new CollectionPreferenceItemRepository(db);
  const decisionRepo = new DecisionEventRepository(db);

  const sessionNumber = Number(params.sessionNumber);
  const sortSession =
    sessionNumber > 0 && Number.isInteger(sessionNumber)
      ? await sessionRepo.findByCollectionAndNumber(collection.id, sessionNumber)
      : null;

  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  const [items, preferences, decisions] = await Promise.all([
    itemRepo.findByCollection(collection.id),
    prefRepo.findByCollection(collection.id, session.user.id),
    decisionRepo.findBySession(sortSession.id),
  ]);
```

Update **all three** breadcrumb "Session" hrefs (the two early-return blocks and the main return) from `${params.sessionId}` to `${sortSession.number}`:

```tsx
          { label: "Session", href: `/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}` },
```

`CompareChoice` — pass the session **ULID** (was `params.sessionId`):

```tsx
          <CompareChoice
            sessionId={sortSession.id}
            itemA={itemA}
```

- [ ] **Step 7: Update `triage/page.test.tsx` and `compare/page.test.tsx`**

Both existing tests assert the nkp hero images and must keep passing. Apply the same mock/param swap as the session test. For each file:

1. In the `vi.hoisted` block, change `sessionRepo: { findById: vi.fn() }` → `sessionRepo: { findByCollectionAndNumber: vi.fn() }`.
2. In `beforeEach`, change `sessionRepo.findById.mockResolvedValue({ id: "sess_1", collectionId: "coll_01ABCDEF", status: "active" })` → `sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_1", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "u1" })`.
3. In each `await TriagePage(...)` / `await ComparePage(...)` call, change `params: { id: "summer-bags", sessionId: "sess_1" }` → `params: { id: "summer-bags", sessionNumber: "1" }`.

(The `next/navigation` mock stays as-is — `redirect: vi.fn(), useRouter: …` — the hero tests use a matching collection so no redirect fires.)

Then add an integrity-guard case to **triage** `page.test.tsx` (the data-bearing page most worth guarding):

```tsx
  it("redirects when the resolved session belongs to a different collection", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_OTHER", number: 1, status: "active", curatorId: "u1" });
    const navMock = await import("next/navigation");
    (navMock.redirect as any).mockClear();
    await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    expect(navMock.redirect).toHaveBeenCalledWith("/collections/summer-bags/sort");
  });
```

(Because triage's `redirect` mock does not throw, the page continues after the call; asserting `redirect` was called with the list URL is the meaningful guard assertion here.)

- [ ] **Step 8: Run all three page tests**

Run: `npx vitest run "src/app/collections/[id]/sort/[sessionNumber]"`
Expected: PASS (page: 4, triage: 3, compare: 1).

- [ ] **Step 9: Type-check + commit**

```bash
npx tsc --noEmit
git add "src/app/collections/[id]/sort/[sessionNumber]"
git commit -m "feat(purses-9hl): resolve sort sessions by number; keep #196 guard; ULID to clients"
```

---

## Task 8: Rename `[resultId]` → `[resultNumber]` and refactor result pages + FinalizeResultForm

**Files (rename with `git mv`):**
- `src/app/collections/[id]/results/[resultId]/page.tsx` (+ `page.test.tsx`)
- `src/app/collections/[id]/results/[resultId]/finalize/page.tsx`
- Modify: `src/features/results/FinalizeResultForm.tsx`
- Create: `…/results/[resultNumber]/finalize/page.test.tsx`, `src/features/results/FinalizeResultForm.test.tsx`

**Interfaces consumed:** `SortResultRepository.findByCollectionAndNumber` (Task 4). `SharePanel` is unchanged (receives result **ULID**). `FinalizeResultForm` gains a `resultNumber` prop (nav) while keeping `resultId` (ULID, for the API).

- [ ] **Step 1: Rename the directory**

```bash
git mv "src/app/collections/[id]/results/[resultId]" "src/app/collections/[id]/results/[resultNumber]"
```

- [ ] **Step 2: Update the result-detail test (drive resolver + guard)**

Replace `src/app/collections/[id]/results/[resultNumber]/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, redirectMock, resultRepo, resultItemRepo, itemRepo, shareRepo, photoRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  resultRepo: { findByCollectionAndNumber: vi.fn() },
  resultItemRepo: { findByResult: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  shareRepo: { findByResult: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(() => resultRepo) }));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({ SortResultItemRepository: vi.fn(() => resultItemRepo) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/SortResultShareRepository", () => ({ SortResultShareRepository: vi.fn(() => shareRepo) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));

import ResultDetailPage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const HERO = { id: "item_hero", collectionId: "coll_01ABCDEF", number: 1, name: "Hero Bag", brand: null, status: "active" };
const REST = { id: "item_rest", collectionId: "coll_01ABCDEF", number: 2, name: "Rest Bag", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "My ranking", status: "draft" });
  resultItemRepo.findByResult.mockResolvedValue([
    { id: "ri_1", itemId: "item_hero", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null },
    { id: "ri_2", itemId: "item_rest", computedRank: 2, manualRank: null, computedBucket: "high", manualBucket: null },
  ]);
  itemRepo.findByCollection.mockResolvedValue([HERO, REST]);
  shareRepo.findByResult.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(
    new Map([
      ["item_hero", { id: "ph", itemId: "item_hero" }],
      ["item_rest", { id: "pr", itemId: "item_rest" }],
    ]),
  );
});

describe("ResultDetailPage hero images (nkp) + resolution", () => {
  it("renders hero + ranked images using collection.id, batch-loaded once", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    const hero = await screen.findByRole("img", { name: "Hero Bag" });
    const rest = await screen.findByRole("img", { name: "Rest Bag" });
    expect(hero.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(hero.getAttribute("src")).not.toContain("summer-bags");
    expect(rest.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
    expect(resultItemRepo.findByResult).toHaveBeenCalledWith("res_1"); // dependent query uses the ULID
  });

  it("redirects when the resolved result belongs to a different collection (guard survives)", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_x", collectionId: "coll_OTHER", number: 1, name: "X", status: "draft" });
    await expect(ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects when no result has that number", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue(null);
    await expect(ResultDetailPage({ params: { id: "summer-bags", resultNumber: "5" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects on a non-numeric segment without hitting the repo", async () => {
    await expect(ResultDetailPage({ params: { id: "summer-bags", resultNumber: "abc" } })).rejects.toThrow("REDIRECT");
    expect(resultRepo.findByCollectionAndNumber).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run "src/app/collections/[id]/results/[resultNumber]/page.test.tsx"`
Expected: FAIL — page reads `params.resultId` / calls `findById`.

- [ ] **Step 4: Refactor `[resultNumber]/page.tsx`**

Replace the interface + resolution block (lines ~18-58) in `src/app/collections/[id]/results/[resultNumber]/page.tsx`:

```tsx
interface ResultDetailPageProps {
  params: { id: string; resultNumber: string };
}
```

```tsx
  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const resultRepo = new SortResultRepository(db);
  const resultItemRepo = new SortResultItemRepository(db);
  const itemRepo = new ItemRepository(db);
  const shareRepo = new SortResultShareRepository(db);

  const resultNumber = Number(params.resultNumber);
  const result =
    resultNumber > 0 && Number.isInteger(resultNumber)
      ? await resultRepo.findByCollectionAndNumber(collection.id, resultNumber)
      : null;

  if (!result || result.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/results`);
  }

  const [resultItems, items, shares] = await Promise.all([
    resultItemRepo.findByResult(result.id),
    itemRepo.findByCollection(collection.id),
    shareRepo.findByResult(result.id),
  ]);
```

Finalize link (was `${params.resultId}`):

```tsx
            <Link href={`/collections/${collection.slug ?? collection.id}/results/${result.number}/finalize`}>
```

`SharePanel` — pass the result **ULID** (was `params.resultId`):

```tsx
          <SharePanel
            resultId={result.id}
            initialShares={shares}
          />
```

- [ ] **Step 5: Change `FinalizeResultForm` to redirect by number**

In `src/features/results/FinalizeResultForm.tsx`, add the `resultNumber` prop and use it for the redirect (the two `fetch` calls keep using `resultId`, the ULID):

```tsx
interface FinalizeResultFormProps {
  collectionId: string;
  resultId: string;
  resultNumber: number | null;
  defaultName: string;
}

export function FinalizeResultForm({ collectionId, resultId, resultNumber, defaultName }: FinalizeResultFormProps) {
```

Redirect (line ~46):

```tsx
    router.push(`/collections/${collectionId}/results/${resultNumber}`);
```

- [ ] **Step 6: Refactor `finalize/page.tsx`**

In `src/app/collections/[id]/results/[resultNumber]/finalize/page.tsx`:

```tsx
interface FinalizePageProps {
  params: { id: string; resultNumber: string };
}
```

```tsx
  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const resultRepo = new SortResultRepository(db);

  const resultNumber = Number(params.resultNumber);
  const result =
    resultNumber > 0 && Number.isInteger(resultNumber)
      ? await resultRepo.findByCollectionAndNumber(collection.id, resultNumber)
      : null;

  if (!result || result.collectionId !== collection.id || result.curatorId !== session.user.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/results`);
  }
```

`FinalizeResultForm` props (was `resultId={params.resultId}`):

```tsx
        <FinalizeResultForm
          collectionId={collection.slug ?? collection.id}
          resultId={result.id}
          resultNumber={result.number}
          defaultName={result.name}
        />
```

- [ ] **Step 7: Write the `FinalizeResultForm` component test**

```tsx
// src/features/results/FinalizeResultForm.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), back: vi.fn() }) }));

import { FinalizeResultForm } from "./FinalizeResultForm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

describe("FinalizeResultForm", () => {
  it("finalizes via the result ULID, then redirects to the slug + number", async () => {
    render(<FinalizeResultForm collectionId="summer-bags" resultId="res_01XYZ" resultNumber={3} defaultName="Spring edit" />);
    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/results/3"));
    // API used the ULID, never the number.
    const calls = (fetch as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((u: string) => u === "/api/sort-results/res_01XYZ/finalize")).toBe(true);
  });
});
```

- [ ] **Step 8: Write the `finalize/page.test.tsx` (resolution + guard)**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockRequireAccess, redirectMock, resultRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  resultRepo: { findByCollectionAndNumber: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(() => resultRepo) }));
vi.mock("@/features/results/FinalizeResultForm", () => ({ FinalizeResultForm: (props: any) => <div data-testid="form" data-resultid={props.resultId} data-resultnumber={props.resultNumber} /> }));

import FinalizePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_REAL", slug: "summer-bags", name: "S" });
});

describe("FinalizePage resolution + guard", () => {
  it("passes the result ULID + number to the form on the happy path", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_REAL", number: 2, curatorId: "u1", name: "R" });
    const { render } = await import("@testing-library/react");
    const ui = await FinalizePage({ params: { id: "summer-bags", resultNumber: "2" } });
    render(ui);
    const { screen } = await import("@testing-library/react");
    expect(screen.getByTestId("form").getAttribute("data-resultid")).toBe("res_1");
    expect(screen.getByTestId("form").getAttribute("data-resultnumber")).toBe("2");
  });
  it("redirects when the curator is not the requester (guard survives)", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_REAL", number: 2, curatorId: "someone_else", name: "R" });
    await expect(FinalizePage({ params: { id: "summer-bags", resultNumber: "2" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects on a non-numeric segment without hitting the repo", async () => {
    await expect(FinalizePage({ params: { id: "summer-bags", resultNumber: "x" } })).rejects.toThrow("REDIRECT");
    expect(resultRepo.findByCollectionAndNumber).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Run the result-page tests**

Run: `npx vitest run "src/app/collections/[id]/results/[resultNumber]" src/features/results/FinalizeResultForm.test.tsx`
Expected: PASS (detail: 4, finalize: 3, form: 1).

- [ ] **Step 10: Type-check + commit**

```bash
npx tsc --noEmit
git add "src/app/collections/[id]/results/[resultNumber]" src/features/results/FinalizeResultForm.tsx src/features/results/FinalizeResultForm.test.tsx
git commit -m "feat(purses-9hl): resolve results by number; finalize redirects by number; keep guards"
```

---

## Task 9: Create/complete generators — StartSessionForm, new/page, SessionCompleteScreen

**Files:**
- Modify: `src/features/sorting/StartSessionForm.tsx`, `src/app/collections/[id]/sort/new/page.tsx`
- Modify: `src/features/sessions/SessionCompleteScreen.tsx`
- Create: `src/features/sorting/StartSessionForm.test.tsx`, `src/features/sessions/SessionCompleteScreen.test.tsx`

> `SessionCompleteScreen` is currently **dead code** (defined, rendered nowhere — confirmed by grep). The bead lists it as a generator to fix, so it is fixed + unit-tested at the component level. (If a later decision confirms it permanently unused, deleting it is the cleaner end-state.)

- [ ] **Step 1: `StartSessionForm` — add `collectionSlug`, redirect by slug + number**

`collectionId` stays the **ULID** (the `/api/sessions` body needs it). Add a nav-only `collectionSlug`. In `src/features/sorting/StartSessionForm.tsx`:

```tsx
interface StartSessionFormProps {
  collectionId: string;
  collectionSlug: string;
}

export function StartSessionForm({ collectionId, collectionSlug }: StartSessionFormProps) {
```

Redirect (line ~39) — the created session JSON now carries `number`:

```tsx
    const newSession = await response.json();
    router.push(`/collections/${collectionSlug}/sort/${newSession.number}`);
    router.refresh();
```

- [ ] **Step 2: Wire `new/page.tsx`**

In `src/app/collections/[id]/sort/new/page.tsx` (line ~35):

```tsx
        <StartSessionForm collectionId={collection.id} collectionSlug={collection.slug ?? collection.id} />
```

- [ ] **Step 3: `StartSessionForm` test**

```tsx
// src/features/sorting/StartSessionForm.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { StartSessionForm } from "./StartSessionForm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "sess_01ABC", number: 4 }) }));
});

describe("StartSessionForm", () => {
  it("POSTs the collection ULID, then redirects to slug + session number", async () => {
    render(<StartSessionForm collectionId="coll_01ULID" collectionSlug="summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Session" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort/4"));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.collectionId).toBe("coll_01ULID"); // API body uses the ULID, not the slug
  });
});
```

- [ ] **Step 4: `SessionCompleteScreen` — add `collectionSlug` + `sessionNumber`**

`sessionId`/`collectionId` stay ULIDs (the `/api/sort-results` body uses `collectionId`). Add nav-only `collectionSlug` + `sessionNumber`. In `src/features/sessions/SessionCompleteScreen.tsx`:

```tsx
interface SessionCompleteScreenProps {
  sessionId: string;
  sessionNumber: number | null;
  collectionId: string;
  collectionSlug: string;
  decisionCount: number;
  bucketCounts: {
    top: number;
    high: number;
    medium: number;
    low: number;
  };
}

export function SessionCompleteScreen({
  sessionId,
  sessionNumber,
  collectionId,
  collectionSlug,
  decisionCount,
  bucketCounts,
}: SessionCompleteScreenProps) {
```

"Generate Results" redirect (line ~51) — result JSON carries `number`:

```tsx
      const result = await response.json();
      router.push(`/collections/${collectionSlug}/results/${result.number}`);
```

"Continue Sorting" (line ~102):

```tsx
            onClick={() => router.push(`/collections/${collectionSlug}/sort/${sessionNumber}`)}
```

(The `/api/sort-results` POST body still sends `{ sessionId, collectionId, name }` with ULIDs — unchanged.)

- [ ] **Step 5: `SessionCompleteScreen` test**

```tsx
// src/features/sessions/SessionCompleteScreen.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SessionCompleteScreen } from "./SessionCompleteScreen";

const props = {
  sessionId: "sess_01ULID",
  sessionNumber: 2,
  collectionId: "coll_01ULID",
  collectionSlug: "summer-bags",
  decisionCount: 5,
  bucketCounts: { top: 1, high: 1, medium: 1, low: 1 },
};

beforeEach(() => vi.clearAllMocks());

describe("SessionCompleteScreen", () => {
  it("Continue Sorting goes to slug + session number", () => {
    render(<SessionCompleteScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue Sorting" }));
    expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort/2");
  });

  it("Generate Results POSTs ULIDs, then redirects to slug + result number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "res_1", number: 7 }) }));
    render(<SessionCompleteScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Results" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/results/7"));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.collectionId).toBe("coll_01ULID");
    expect(body.sessionId).toBe("sess_01ULID");
  });
});
```

- [ ] **Step 6: Run + type-check + commit**

```bash
npx vitest run src/features/sorting/StartSessionForm.test.tsx src/features/sessions/SessionCompleteScreen.test.tsx
npx tsc --noEmit
git add src/features/sorting/StartSessionForm.tsx src/app/collections/[id]/sort/new/page.tsx src/features/sessions/SessionCompleteScreen.tsx src/features/sorting/StartSessionForm.test.tsx src/features/sessions/SessionCompleteScreen.test.tsx
git commit -m "feat(purses-9hl): create/complete generators emit slug + number"
```

---

## Task 10: List + dashboard nav links use number / slug

**Files:**
- Modify: `src/app/collections/[id]/results/page.tsx`, `src/app/collections/[id]/sort/page.tsx`
- Modify: `src/app/collections/[id]/page.tsx`, `src/app/collections/[id]/edit/page.tsx`
- Create: `src/app/collections/[id]/results/page.test.tsx`, `src/app/collections/[id]/sort/page.test.tsx`, `src/app/collections/[id]/page.test.tsx`

- [ ] **Step 1: `results/page.tsx` — link + label use `result.number`**

Line ~48 (link) and line ~52 (label):

```tsx
              <Link key={result.id} href={`/collections/${collection.slug ?? collection.id}/results/${result.number}`}>
```
```tsx
                      <p className="font-semibold text-ink">Result #{result.number}</p>
```

- [ ] **Step 2: `sort/page.tsx` — session links use `.number`**

Lines ~56, ~59 (`activeSession.id` → `activeSession.number`) and ~79 (`s.id` → `s.number`):

```tsx
                <Link href={`/collections/${collection.slug ?? collection.id}/sort/${activeSession.number}`}>
```
```tsx
                <Link href={`/collections/${collection.slug ?? collection.id}/sort/${activeSession.number}`}>
```
```tsx
              <Link key={s.id} href={`/collections/${collection.slug ?? collection.id}/sort/${s.number}`}>
```

(Keep `key={s.id}` — the ULID is the stable React key; only the `href` changes.)

- [ ] **Step 3: `collections/[id]/page.tsx` — dashboard links use slug; resume uses slug + number**

`dashboardLinks` (lines ~44-68) — change each `href` from `${collection.id}` to `${collection.slug ?? collection.id}`:

```tsx
  const dashboardLinks = [
    { label: "Items", href: `/collections/${collection.slug ?? collection.id}/items`, description: "Manage items in this collection", icon: "📦" },
    { label: "Sort", href: `/collections/${collection.slug ?? collection.id}/sort`, description: "Start a sorting session", icon: "📊" },
    { label: "Results", href: `/collections/${collection.slug ?? collection.id}/results`, description: "View sorting results", icon: "🎯" },
    { label: "Members", href: `/collections/${collection.slug ?? collection.id}/members`, description: "Manage collaborators", icon: "👥" },
    { label: "Settings", href: `/collections/${collection.slug ?? collection.id}/edit`, description: "Edit collection details", icon: "⚙️" },
  ];
```

Active-session Resume (line ~115):

```tsx
                <Link href={`/collections/${collection.slug ?? collection.id}/sort/${activeSession.number}`}>
```

- [ ] **Step 4: `edit/page.tsx` — breadcrumb uses slug**

Line ~25:

```tsx
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
```

- [ ] **Step 5: Write `results/page.test.tsx`**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, resultRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  resultRepo: { findByCollection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(() => resultRepo) }));

import ResultsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_01ABC", slug: "summer-bags", name: "Summer Bags" });
  resultRepo.findByCollection.mockResolvedValue([
    { id: "res_zzz", number: 2, name: "Spring edit", status: "finalized", createdAt: new Date("2026-01-02") },
  ]);
});

describe("ResultsPage links + label", () => {
  it("links by number and labels by number (never the ULID)", async () => {
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/collections/summer-bags/results/2");
    expect(screen.getByText("Result #2")).toBeInTheDocument();
    expect(link.getAttribute("href")).not.toContain("res_zzz");
  });
});
```

- [ ] **Step 6: Write `sort/page.test.tsx`**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, sessionRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  sessionRepo: { findByCollection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));

import SortPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_01ABC", slug: "summer-bags", name: "Summer Bags" });
  sessionRepo.findByCollection.mockResolvedValue([
    { id: "sess_zzz", number: 3, goal: "Discover", status: "completed", createdAt: new Date("2026-01-03") },
  ]);
});

describe("SortPage session links", () => {
  it("links sessions by number (never the ULID)", async () => {
    const ui = await SortPage({ params: { id: "summer-bags" } });
    render(ui);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/collections/summer-bags/sort/3");
    expect(links.some((h) => h?.includes("sess_zzz"))).toBe(false);
  });
});
```

- [ ] **Step 7: Write `collections/[id]/page.test.tsx`**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, resultRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findByCollection: vi.fn() },
  resultRepo: { findByCollection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(() => resultRepo) }));

import CollectionPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_01ABC", slug: "summer-bags", name: "Summer Bags", description: null, createdAt: new Date() });
  itemRepo.findByCollection.mockResolvedValue([]);
  sessionRepo.findByCollection.mockResolvedValue([{ id: "sess_zzz", number: 5, status: "active", goal: "Go" }]);
  resultRepo.findByCollection.mockResolvedValue([]);
});

describe("CollectionPage nav links", () => {
  it("uses slug for dashboard links and slug + number for resume; no raw ULIDs", async () => {
    const ui = await CollectionPage({ params: { id: "summer-bags" } });
    render(ui);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/collections/summer-bags/items");
    expect(hrefs).toContain("/collections/summer-bags/sort/5"); // active session resume
    expect(hrefs.every((h) => !h.includes("coll_01ABC"))).toBe(true);
    expect(hrefs.every((h) => !h.includes("sess_zzz"))).toBe(true);
  });
});
```

- [ ] **Step 8: Run the new page tests + type-check**

Run: `npx vitest run "src/app/collections/[id]/results/page.test.tsx" "src/app/collections/[id]/sort/page.test.tsx" "src/app/collections/[id]/page.test.tsx" && npx tsc --noEmit`
Expected: PASS (3 files).

- [ ] **Step 9: Commit**

```bash
git add "src/app/collections/[id]/results/page.tsx" "src/app/collections/[id]/sort/page.tsx" "src/app/collections/[id]/page.tsx" "src/app/collections/[id]/edit/page.tsx" "src/app/collections/[id]/results/page.test.tsx" "src/app/collections/[id]/sort/page.test.tsx" "src/app/collections/[id]/page.test.tsx"
git commit -m "feat(purses-9hl): list + dashboard nav links use slug and number"
```

---

## Task 11: Verification sweep + full gates + screenshots

- [ ] **Step 1: Prove no raw ULIDs remain in user-facing URLs**

```bash
# Session/result link segments must use a number expression, never an entity .id:
grep -rn "sort/\${" "src/app/collections/[id]" src/features
grep -rn "results/\${" "src/app/collections/[id]" src/features
# Collection segments in hrefs must use slug ?? id, never bare collection.id:
grep -rn "collections/\${collection.id}" src
```
Expected: every `sort/${…}` / `results/${…}` hit uses `.number` (or `sortSession.number` / `result.number`); the only `${...id}` allowed in those URL segments is the **client `fetch`** paths inside `DecisionControls`/`CompareChoice`/`SharePanel`/`FinalizeResultForm` (those hit `/api/...`, which is ULID-only). **Zero** `collections/${collection.id}` in any `href` (the remaining `${collection.id}` hits must be image URLs, DB args, or `/api/...` calls). Fix and re-grep if any leak.

- [ ] **Step 2: Type + unit + lint**

Run: `npx tsc --noEmit && npm run test:ci && npm run lint`
Expected: all pass. Watch for any `Session`/`SortResult` object literal in other tests missing the new `number` field — add `number: <n>` or `number: null`.

- [ ] **Step 3: DB-gated tests**

Run: `npm run test:db`
Expected: all DB tests pass, including `session-number`, `result-number`, `backfill-numbers`.

- [ ] **Step 4: Build + auth gates**

Run: `npm run build && npm run auth:verify`
Expected: both succeed.

- [ ] **Step 5: Manual smoke (local or preview)**

- Open a collection → dashboard tiles are `/collections/<slug>/...` (no ULID).
- Start a session → URL becomes `/collections/<slug>/sort/<n>`; triage/compare URLs use `<n>`.
- Triage/compare hero images still render (nkp not regressed).
- Open results detail via `/collections/<slug>/results/<n>`; finalize → returns to `/results/<n>`.
- Visit an **old** session/result ULID URL → redirects to the list (no crash, no loop).
- Visit a collection via its **legacy ULID** → still resolves (resolver fallback).

- [ ] **Step 6: Screenshots for the PR**

Per repo rule, capture light + dark of: session detail, triage, compare, results list, results detail (with the address bar showing slug + number). Use `/github-pr-screenshots`; seed photo rows with private blobs if images are needed.

- [ ] **Step 7: Final commit (if any sweep fixes)**

```bash
git commit -am "chore(purses-9hl): verification sweep — no residual raw-ULID URLs"
```

---

## Self-Review (against the bead)

- **Schema (A):** Task 1 adds `number` + unique index to both tables + migration/snapshot. ✓
- **Allocation MAX+1 + retry, copied verbatim (A):** Tasks 3–4 mirror `ItemRepository.getNextCatalogNumber` exactly; retry discriminates on `*_collection_number_unique`. ✓ Unit tests prove the race retry **and** that the `sessions_active_unique` conflict is NOT masked.
- **`findByCollectionAndNumber` (A):** Tasks 3–4 (sessions filter `deletedAt`; results don't — matches each table). ✓
- **Backfill 1..n by createdAt, idempotent (A):** Task 6 + DB test. ✓
- **Route renames + parse-int + resolve + redirect-on-miss + pass ULID down (B):** Tasks 7–8 mirror the proven `items/[itemNumber]` pattern; clients get `sortSession.id` / `result.id`. ✓
- **#196 guard preserved + tested (constraint):** Tasks 7–8 keep `entity.collectionId !== collection.id` and add a test that returns a mismatched-collection entity → redirect. No `params.id` comparison anywhere. ✓
- **API stays ULID-only (B):** Task 5 routes the **sessions** POST through the repo (sort-results POST deferred to `purses-axn`, review R9); bodies/paths stay ULID; component tests assert API calls use the ULID, not the number. ✓
- **Fix the 4 generators #190 missed (D):** `StartSessionForm` (T9), `collections/[id]/page.tsx` resume (T10), `FinalizeResultForm` (T8), `SessionCompleteScreen` (T9). Plus `results/page.tsx:52` label uses `result.number` (T10). ✓ — and the broader sweep also fixes the *partial*-ULID generators #190 left (`sort/page.tsx`, `results/page.tsx` links, dashboard tiles, edit breadcrumb) so the "no raw ULIDs" goal actually holds.
- **Backward-compat (B):** old session/result number-miss → redirect to list (T7/T8 NaN + null tests); old collection ULID → resolver fallback (unchanged). ✓
- **Testing bar:** every touched route + UI element has a real `test:ci` test; DB tests in `src/lib/db/`; auth mock is the flat-replace form throughout. ✓

## Observations surfaced (NOT in this bead — for follow-up)

1. **`SessionCompleteScreen` is dead code** (rendered nowhere) and is the *only* trigger for creating sort-results — so results may never be created in the live app today. Tracked as **`purses-r7p`** (verify/repair the results-creation flow). This plan still fixes its URL generation + tests it (decision R9, Option A), since the bead names it and it'll be ready when wired.
2. **`/api/sort-results` POST/PATCH/finalize lack collection-access checks** (cross-tenant write / IDOR). **Moved out of 9hl** (decision R9) and tracked as **`purses-axn`** (P1, under epic `purses-pv9`); 9hl no longer touches these endpoints.
3. **Allocation idiom now in 4 repos** (verbatim copy, correct for this PR) — possible future unification tracked as **`purses-2q2`** (P3).
4. **Triage decisions bug** — tracked separately as **purses-t9l** (decision saves but item may not advance; suspects: 500 in preference recalc, or a curatorId mismatch in `ScoringService.computePreferences`). Unrelated to these URL changes.

## Done criteria (maps to bead acceptance)

- No raw ULIDs in user-facing URLs: collection segments use slug, session/result segments use number; the final grep is clean.
- Sessions & results have per-collection sequential numbers; pages resolve by number and redirect to the list on miss/NaN/legacy-ULID.
- `#196` integrity guards intact and tested; no `params.id`-based comparison.
- All gates green: `build`, `test:ci`, `lint`, `auth:verify`, `test:db`.
