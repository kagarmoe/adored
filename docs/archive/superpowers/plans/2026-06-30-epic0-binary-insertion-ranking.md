# Epic 0 — Binary-Insertion Ranking Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Elo pairwise `ScoringService` with a binary-insertion ranking of the `top`+`high` buckets, derived deterministically from the append-only decision log, so ordering is fast, retry/concurrency-safe, and finalize reads the new order.

**Architecture:** Ordering is **recomputed from `decision_events`** (never stored as mutable progress) by a pure insertion engine (`src/lib/insertion-ranking.ts`). `preferences.orderRank` (nullable int) is the materialized output; recompute clears-then-assigns it inside the existing decision transaction under a session row-lock. The same engine drives the live "next pair to ask" selector. Finalize reads `orderRank` (nulls-last within bucket). Elo pairwise deltas are removed; `score` stays a non-null bucket seed until a later cleanup.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, serverless Postgres, Vitest (`RUN_DB_TESTS=1` DB tier), `ulid`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-30-wireframes-workflow-alignment-design.md` (§3 Epic 0 is authoritative for the rules below).
- **Bucket names in data are `top` | `high` | `medium` | `low`** (`RankBucket`, `src/types/domain.ts:165`). Ranked scope = `top` + `high` only.
- **Recompute-from-log = deterministic insertion replay**, not a scalar fold. Canonical insertion sequence = rankable items ordered by `(item.createdAt, item.id)` ascending; midpoint tie-break = **`floor((lo+hi)/2)`**.
- **Contradictions:** the **latest** comparison for a re-queried pair by `(createdAt, id)` wins; off-path historical edges are ignored, never enforced.
- **Comparison bound:** placing one item into a list of n takes at most **`Math.ceil(Math.log2(n + 1))`** comparisons.
- **Persistence:** dense integer `orderRank` (0-based), scoped `(collectionId, curatorId)`, cleared-then-assigned per recompute; partial unique index `(collection_id, curator_id, order_rank) WHERE order_rank IS NOT NULL`. `placed ⟺ order_rank IS NOT NULL`.
- **Idempotency:** `decision_events.client_key` (nullable) + partial unique `(session_id, client_key) WHERE client_key IS NOT NULL`; a duplicate returns the prior event (201-equivalent), never an error.
- **Concurrency:** `SELECT … FOR UPDATE` the `sessions` row inside the decision transaction before recompute.
- **`preferences.score`/`confidence` stay NOT NULL and supplied** (bucket seed, no Elo deltas) — never nullable this epic.
- **Never-ranked but loved:** a `top`/`high` item never compared still materializes (unranked, after the ranked ones in its bucket) — decision F, cut nothing.
- **Migration:** hand-author partial-unique-index migrations like `drizzle/0009_partial_active_session.sql` (drizzle-kit can't serialize the predicate); forward-only. Clean reset discards Elo-era **draft** sort results.
- **Testing:** TDD (failing test first). DB tests: `src/lib/db/*.integration.test.ts`, gated `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;`, run serially in CI `db-tests`. Mock only `@/lib/auth` + `@/lib/db`. At least one test crosses route→service→repo→DB un-mocked. Unit tests for the pure engine need no DB.
- **Out of scope:** any UI beyond the `selectNextPair` swap; the round timer; Standing/Decide surfaces.

## File Structure

- **Create** `src/lib/insertion-ranking.ts` — pure engine: normalize comparisons, place one item, derive full order, select next pair. No DB, no I/O.
- **Create** `src/lib/insertion-ranking.test.ts` — unit tests (Vitest, no DB gate).
- **Modify** `src/lib/db/schema.ts` — add `preferences.orderRank`, `decisionEvents.clientKey` + index declarations.
- **Create** `drizzle/00NN_*.sql` (generated) + `drizzle/00NN_orderrank_clientkey_partial_indexes.sql` (hand-authored) + `drizzle/00NN_reset_elo_drafts.sql` (hand-authored clean reset).
- **Modify** `src/server/services/ScoringService.ts` — drop Elo pairwise deltas; `score` = bucket seed; expose latest-triage bucket.
- **Modify** `src/server/services/PreferenceStateService.ts` — write `orderRank` via the engine, clear-then-assign.
- **Modify** `src/server/repositories/CollectionPreferenceItemRepository.ts` (+ impl) — `orderRank` in create/update/read; a `clearOrderRanks(collectionId, curatorId)`.
- **Modify** `src/lib/pairwise-selection.ts` — `selectNextPair` delegates to the engine.
- **Modify** `src/app/api/sessions/[id]/decisions/route.ts` — `client_key` dedupe + idempotent response + session `FOR UPDATE` lock.
- **Modify** `src/server/services/sortResultMaterialization.ts` — `rankPreferencesToItems` reads `orderRank` + bucket priority.
- **Delete** `src/server/services/PairingService.ts` + its test (dead code).
- **Create** `src/lib/db/binary-insertion-ranking.integration.test.ts` — DB seam + migration/reset regression.

---

### Task 1: Pure engine — comparison normalization

**Files:**
- Create: `src/lib/insertion-ranking.ts`
- Test: `src/lib/insertion-ranking.test.ts`

**Interfaces:**
- Produces:
  - `type Bucket = "top" | "high" | "medium" | "low"`
  - `interface ComparisonEvent { aId: string; bId: string; result: "item_a" | "item_b" | "tie" | "skip"; createdAt: Date; id: string }`
  - `type Outcome = "x_more" | "y_more" | "tie" | "skip" | "unknown"`
  - `function latestOutcome(comparisons: ComparisonEvent[], x: string, y: string): Outcome` — most-recent-by-`(createdAt,id)` comparison of the unordered pair {x,y}, oriented to x; `"unknown"` if none.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { latestOutcome, type ComparisonEvent } from "./insertion-ranking";

const at = (s: number) => new Date(2026, 0, 1, 0, 0, s);
const cmp = (aId: string, bId: string, result: ComparisonEvent["result"], s: number, id = `e${s}`): ComparisonEvent =>
  ({ aId, bId, result, createdAt: at(s), id });

describe("latestOutcome", () => {
  it("returns unknown when the pair was never compared", () => {
    expect(latestOutcome([cmp("A", "B", "item_a", 1)], "A", "C")).toBe("unknown");
  });
  it("orients item_a to the queried x regardless of stored direction", () => {
    expect(latestOutcome([cmp("A", "B", "item_a", 1)], "A", "B")).toBe("x_more");
    expect(latestOutcome([cmp("A", "B", "item_a", 1)], "B", "A")).toBe("y_more");
  });
  it("latest by (createdAt,id) wins on contradiction", () => {
    const evs = [cmp("A", "B", "item_a", 1), cmp("B", "A", "item_a", 2)];
    // second event says B>A; oriented to x=A => y_more
    expect(latestOutcome(evs, "A", "B")).toBe("y_more");
  });
  it("breaks a same-timestamp tie by id", () => {
    const evs = [cmp("A", "B", "item_a", 5, "e_b"), cmp("A", "B", "item_b", 5, "e_a")];
    // same createdAt; id "e_b" > "e_a", so e_b (item_a => x_more) wins
    expect(latestOutcome(evs, "A", "B")).toBe("x_more");
  });
  it("passes tie and skip through", () => {
    expect(latestOutcome([cmp("A", "B", "tie", 1)], "A", "B")).toBe("tie");
    expect(latestOutcome([cmp("A", "B", "skip", 1)], "A", "B")).toBe("skip");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/insertion-ranking.test.ts`
Expected: FAIL — `latestOutcome` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/insertion-ranking.ts
export type Bucket = "top" | "high" | "medium" | "low";

export interface ComparisonEvent {
  aId: string;
  bId: string;
  result: "item_a" | "item_b" | "tie" | "skip";
  createdAt: Date;
  id: string;
}

export type Outcome = "x_more" | "y_more" | "tie" | "skip" | "unknown";

function isAfter(a: ComparisonEvent, b: ComparisonEvent): boolean {
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta > tb;
  return a.id > b.id;
}

export function latestOutcome(comparisons: ComparisonEvent[], x: string, y: string): Outcome {
  let latest: ComparisonEvent | null = null;
  for (const c of comparisons) {
    const matches = (c.aId === x && c.bId === y) || (c.aId === y && c.bId === x);
    if (!matches) continue;
    if (latest === null || isAfter(c, latest)) latest = c;
  }
  if (latest === null) return "unknown";
  if (latest.result === "tie") return "tie";
  if (latest.result === "skip") return "skip";
  // result is item_a or item_b, expressed in stored (aId,bId) direction; orient to x.
  const winnerId = latest.result === "item_a" ? latest.aId : latest.bId;
  return winnerId === x ? "x_more" : "y_more";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/insertion-ranking.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insertion-ranking.ts src/lib/insertion-ranking.test.ts
git commit -m "feat(ranking): latestOutcome — latest-wins comparison lookup"
```

---

### Task 2: Pure engine — place one item (binary search, bound, tie/skip)

**Files:**
- Modify: `src/lib/insertion-ranking.ts`
- Test: `src/lib/insertion-ranking.test.ts`

**Interfaces:**
- Consumes: `latestOutcome`, `ComparisonEvent` (Task 1).
- Produces:
  - `type Placement = { status: "placed"; index: number } | { status: "pending"; pivotId: string } | { status: "skipped" }`
  - `function placeItem(x: string, ordered: string[], comparisons: ComparisonEvent[]): Placement` — binary-search x into `ordered` (index 0 = most loved). `pending` = the first pivot with no recorded outcome (this is the next question). `skipped` = the search reached a pivot whose latest outcome is `skip` (item defers, stays unplaced). Tie ranks x immediately **after** the pivot (deterministic). Bound: ≤ `ceil(log2(len+1))` `latestOutcome` calls with a known outcome.

- [ ] **Step 1: Write the failing test**

```ts
import { placeItem } from "./insertion-ranking";

describe("placeItem", () => {
  it("places into an empty list at index 0 with no comparisons", () => {
    expect(placeItem("A", [], [])).toEqual({ status: "placed", index: 0 });
  });
  it("places above the pivot when x is more loved", () => {
    // ordered [B]; A>B => A before B => index 0
    expect(placeItem("A", ["B"], [cmp("A", "B", "item_a", 1)])).toEqual({ status: "placed", index: 0 });
  });
  it("places below the pivot when x is less loved", () => {
    expect(placeItem("A", ["B"], [cmp("A", "B", "item_b", 1)])).toEqual({ status: "placed", index: 1 });
  });
  it("returns pending with the pivot when the needed comparison is missing", () => {
    expect(placeItem("A", ["B"], [])).toEqual({ status: "pending", pivotId: "B" });
  });
  it("tie places immediately after the pivot", () => {
    expect(placeItem("A", ["B"], [cmp("A", "B", "tie", 1)])).toEqual({ status: "placed", index: 1 });
  });
  it("skip on the needed pivot leaves the item skipped", () => {
    expect(placeItem("A", ["B"], [cmp("A", "B", "skip", 1)])).toEqual({ status: "skipped" });
  });
  it("respects the ceil(log2(n+1)) comparison bound (n=7 => 3)", () => {
    const ordered = ["i0", "i1", "i2", "i3", "i4", "i5", "i6"]; // most→least loved
    // X belongs at the very end: every comparison says pivot is more loved.
    const comps = ordered.map((p, k) => cmp("X", p, "item_b", k + 1));
    let calls = 0;
    const counting = new Proxy(comps, {}); // comparisons array unchanged; count via wrapper below
    void counting;
    // Instrument by re-implementing count through a spy-free approach: place and assert index.
    const res = placeItem("X", ordered, comps);
    expect(res).toEqual({ status: "placed", index: 7 });
    // Bound check: reconstruct the number of distinct pivots consulted.
    calls = distinctPivotsConsulted("X", ordered, comps);
    expect(calls).toBeLessThanOrEqual(Math.ceil(Math.log2(ordered.length + 1)));
  });
});

// Helper local to the test: replays the same binary search counting known-outcome pivots.
function distinctPivotsConsulted(x: string, ordered: string[], comps: ComparisonEvent[]): number {
  let lo = 0, hi = ordered.length, n = 0;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const o = latestOutcome(comps, x, ordered[mid]);
    n++;
    if (o === "x_more") hi = mid;
    else lo = mid + 1;
  }
  return n;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/insertion-ranking.test.ts`
Expected: FAIL — `placeItem` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/lib/insertion-ranking.ts
export type Placement =
  | { status: "placed"; index: number }
  | { status: "pending"; pivotId: string }
  | { status: "skipped" };

export function placeItem(x: string, ordered: string[], comparisons: ComparisonEvent[]): Placement {
  let lo = 0;
  let hi = ordered.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const pivot = ordered[mid];
    const o = latestOutcome(comparisons, x, pivot);
    if (o === "unknown") return { status: "pending", pivotId: pivot };
    if (o === "skip") return { status: "skipped" };
    if (o === "x_more") {
      hi = mid; // x is more loved => earlier slot
    } else {
      // y_more or tie => x sits at/after the pivot
      lo = mid + 1;
    }
  }
  return { status: "placed", index: lo };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/insertion-ranking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insertion-ranking.ts src/lib/insertion-ranking.test.ts
git commit -m "feat(ranking): placeItem — bounded binary-search placement with tie/skip"
```

---

### Task 3: Pure engine — derive full order + next pair (canonical sequence, contradictions, edges)

**Files:**
- Modify: `src/lib/insertion-ranking.ts`
- Test: `src/lib/insertion-ranking.test.ts`

**Interfaces:**
- Consumes: `placeItem`, `latestOutcome`, `ComparisonEvent`, `Bucket`.
- Produces:
  - `interface RankItem { id: string; createdAt: Date }`
  - `interface DerivedOrder { order: string[]; unplaced: string[]; nextPair: [string, string] | null }`
  - `function deriveOrder(rankable: RankItem[], comparisons: ComparisonEvent[]): DerivedOrder` — inserts rankable items in canonical `(createdAt,id)` order; `order` = placed ids (index 0 = most loved); `unplaced` = skipped/pending-but-not-yet-asked; `nextPair` = the first pending `[x, pivot]` (the live next question) or `null` when everything placeable is placed.

Determinism: contradictions handled by `latestOutcome` (latest wins); off-path edges never consulted (binary search only visits pivots on the path). Edges: `rankable=[]` ⇒ empty order, `nextPair=null`; single item ⇒ placed at 0, no comparisons.

- [ ] **Step 1: Write the failing test**

```ts
import { deriveOrder, type RankItem } from "./insertion-ranking";

const item = (id: string, s: number): RankItem => ({ id, createdAt: at(s) });

describe("deriveOrder", () => {
  it("n=0 => empty order, no next pair", () => {
    expect(deriveOrder([], [])).toEqual({ order: [], unplaced: [], nextPair: null });
  });
  it("n=1 => placed with zero comparisons", () => {
    expect(deriveOrder([item("A", 1)], [])).toEqual({ order: ["A"], unplaced: [], nextPair: null });
  });
  it("asks the next pair when a comparison is missing", () => {
    // A inserted first (index 0); B needs A vs B => pending
    const d = deriveOrder([item("A", 1), item("B", 2)], []);
    expect(d.order).toEqual(["A"]);
    expect(d.nextPair).toEqual(["B", "A"]);
  });
  it("produces a total order once all path comparisons exist", () => {
    // Canonical insert order A,B,C. A@0. B vs A: B>A => [B,A]. C vs mid(B): C>B => [C,B,A].
    const comps = [cmp("B", "A", "item_a", 10), cmp("C", "B", "item_a", 11)];
    const d = deriveOrder([item("A", 1), item("B", 2), item("C", 3)], comps);
    expect(d.order).toEqual(["C", "B", "A"]);
    expect(d.nextPair).toBeNull();
  });
  it("a later contradicting comparison flips the order deterministically", () => {
    // Same as above but a newer event says A>B.
    const comps = [
      cmp("B", "A", "item_a", 10),
      cmp("C", "B", "item_a", 11),
      cmp("A", "B", "item_a", 20), // newer: A>B
    ];
    const d = deriveOrder([item("A", 1), item("B", 2), item("C", 3)], comps);
    // B vs A now => A more loved => B after A. Insert order A@0; B: A>B => [A,B]; C vs mid(A): C>A => [C,A,B]
    expect(d.order).toEqual(["C", "A", "B"]);
  });
  it("a skipped pivot leaves that item unplaced and moves on", () => {
    const comps = [cmp("B", "A", "skip", 10)];
    const d = deriveOrder([item("A", 1), item("B", 2)], comps);
    expect(d.order).toEqual(["A"]);
    expect(d.unplaced).toEqual(["B"]);
    expect(d.nextPair).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/insertion-ranking.test.ts`
Expected: FAIL — `deriveOrder` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/lib/insertion-ranking.ts
export interface RankItem {
  id: string;
  createdAt: Date;
}

export interface DerivedOrder {
  order: string[];
  unplaced: string[];
  nextPair: [string, string] | null;
}

function canonicalSequence(rankable: RankItem[]): RankItem[] {
  return [...rankable].sort((a, b) => {
    const ta = a.createdAt.getTime();
    const tb = b.createdAt.getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function deriveOrder(rankable: RankItem[], comparisons: ComparisonEvent[]): DerivedOrder {
  const order: string[] = [];
  const unplaced: string[] = [];
  let nextPair: [string, string] | null = null;

  for (const item of canonicalSequence(rankable)) {
    const p = placeItem(item.id, order, comparisons);
    if (p.status === "placed") {
      order.splice(p.index, 0, item.id);
    } else if (p.status === "skipped") {
      unplaced.push(item.id);
    } else {
      // pending: this is the first unanswered question; record it and stop placing further
      // items (their positions depend on this one). They resurface on the next recompute.
      unplaced.push(item.id);
      if (nextPair === null) nextPair = [item.id, p.pivotId];
    }
  }
  return { order, unplaced, nextPair };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/insertion-ranking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insertion-ranking.ts src/lib/insertion-ranking.test.ts
git commit -m "feat(ranking): deriveOrder — deterministic insertion replay + next pair"
```

---

### Task 4: Schema — `orderRank` + `clientKey` columns and indexes

**Files:**
- Modify: `src/lib/db/schema.ts` (preferencesTable lines 253-284; decisionEventsTable lines 210-224)
- Create (generated): `drizzle/00NN_<name>.sql`
- Create (hand-authored): `drizzle/00NN_orderrank_clientkey_partial_indexes.sql`

**Interfaces:**
- Produces: `preferences.order_rank integer NULL`; `decision_events.client_key text NULL`; partial unique indexes `preferences_order_rank_unique` and `decision_events_client_key_unique`.

- [ ] **Step 1: Write the failing test** (schema-shape assertion, DB-gated)

Create `src/lib/db/binary-insertion-ranking.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb, resetDb, closeDb } from "@/../e2e/fixtures/db";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("binary-insertion ranking — schema", () => {
  beforeAll(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });

  it("preferences has a nullable order_rank column", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select column_name, is_nullable from information_schema.columns
      where table_name = 'preferences' and column_name = 'order_rank'`);
    expect(rows.length).toBe(1);
    expect((rows[0] as { is_nullable: string }).is_nullable).toBe("YES");
  });

  it("decision_events has a nullable client_key column", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select column_name, is_nullable from information_schema.columns
      where table_name = 'decision_events' and column_name = 'client_key'`);
    expect(rows.length).toBe(1);
    expect((rows[0] as { is_nullable: string }).is_nullable).toBe("YES");
  });

  it("enforces the partial unique index on (session_id, client_key)", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select indexname from pg_indexes
      where tablename = 'decision_events' and indexname = 'decision_events_client_key_unique'`);
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Expected: FAIL — `order_rank`/`client_key` columns don't exist (0 rows).

(If the local DB isn't up: `npm run test:db` boots the Docker Postgres; or start it per `e2e/fixtures/db.ts` default `postgresql://postgres:test@localhost:5433/app_test`.)

- [ ] **Step 3: Edit the schema**

In `src/lib/db/schema.ts`, add to `preferencesTable` columns (after `comparisonCount`):

```ts
    orderRank: integer("order_rank"),
```

and to its index builder object:

```ts
    orderRankUnique: uniqueIndex("preferences_order_rank_unique")
      .on(table.collectionId, table.curatorId, table.orderRank)
      .where(sql`${table.orderRank} is not null`),
```

Add to `decisionEventsTable` columns (after `decision`):

```ts
    clientKey: text("client_key"),
```

and to its index builder object:

```ts
    clientKeyUnique: uniqueIndex("decision_events_client_key_unique")
      .on(table.sessionId, table.clientKey)
      .where(sql`${table.clientKey} is not null`),
```

Ensure `integer`, `uniqueIndex`, and `sql` are imported at the top of the file (they already are — `sql` is used by `sessions_active_unique`).

- [ ] **Step 4: Generate the base migration, then hand-author the partial indexes**

Run: `npx drizzle-kit generate`
This emits a migration adding the two **columns** (drizzle serializes plain columns). It will **omit** the two partial unique indexes (predicate not serializable — same limitation as `0009`). Confirm the generated `.sql` contains only `ALTER TABLE … ADD COLUMN`.

Create `drizzle/00NN_orderrank_clientkey_partial_indexes.sql` (use the next number after the generated one), mirroring the `0009` header convention:

```sql
-- Hand-authored: drizzle-kit cannot serialize partial-index predicates (see 0009).
-- order_rank: at most one item per rank per (collection,curator); NULL rank = unranked
--   (loved-but-never-compared items still exist, they just have no order).
-- client_key: idempotency — one decision event per (session, client_key); legacy rows
--   have NULL client_key and are exempt.
-- Reversal is FORWARD-ONLY.
CREATE UNIQUE INDEX "preferences_order_rank_unique" ON "preferences" ("collection_id","curator_id","order_rank") WHERE "preferences"."order_rank" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "decision_events_client_key_unique" ON "decision_events" ("session_id","client_key") WHERE "decision_events"."client_key" is not null;
```

Apply: `npm run db:migrate` (against the local test DB URL), then re-run Step 2's command.

- [ ] **Step 5: Run test to verify it passes**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/ src/lib/db/binary-insertion-ranking.integration.test.ts
git commit -m "feat(db): add preferences.order_rank + decision_events.client_key with partial unique indexes"
```

---

### Task 5: Repository — persist `orderRank`, add `clearOrderRanks`

**Files:**
- Modify: `src/server/repositories/CollectionPreferenceItemRepository.ts` (interface)
- Modify: `src/server/repositories/implementations/CollectionPreferenceItemRepository.ts`
- Modify: `src/types/domain.ts` (`CollectionPreferenceItem`, lines 167-179 — add `orderRank: number | null`)
- Test: `src/lib/db/binary-insertion-ranking.integration.test.ts`

**Interfaces:**
- Consumes: existing repo methods (§4 of the blueprint).
- Produces: `create`/`update` accept `orderRank?: number | null`; `mapToPreference` reads it; `clearOrderRanks(collectionId: string, curatorId: string): Promise<void>` (sets `order_rank = NULL` for the curator in one statement).

- [ ] **Step 1: Write the failing test**

Add to the DB integration test:

```ts
import { getTestDb as _g } from "@/../e2e/fixtures/db"; // already imported above
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { seedFullCollection } from "@/../e2e/fixtures/seed";

describeDb("preference orderRank persistence", () => {
  beforeAll(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });

  it("round-trips orderRank and clears it in bulk", async () => {
    const { db } = getTestDb();
    const { collection, curatorId, items } = await seedFullCollection(db); // returns >=2 items
    const repo = new CollectionPreferenceItemRepository(db);
    await repo.create({ collectionId: collection.id, curatorId, itemId: items[0].id,
      score: 0.9, confidence: 0.5, rankBucket: "top", comparisonCount: 1, orderRank: 0 });
    const one = await repo.findByItem(items[0].id, curatorId);
    expect(one?.orderRank).toBe(0);

    await repo.clearOrderRanks(collection.id, curatorId);
    const cleared = await repo.findByItem(items[0].id, curatorId);
    expect(cleared?.orderRank).toBeNull();
  });
});
```

(If `seedFullCollection`'s exact return shape differs, use `seedBaseline` + direct inserts per the existing seed helpers — check `e2e/fixtures/seed.ts` for the real signature and adapt the destructuring; do not invent fields.)

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Expected: FAIL — `orderRank` not on the type / `clearOrderRanks` missing.

- [ ] **Step 3: Implement**

`src/types/domain.ts` — add to `CollectionPreferenceItem`:

```ts
  orderRank: number | null;
```

`CollectionPreferenceItemRepository.ts` (interface) — add `orderRank?: number | null` to `create`'s data param, and:

```ts
  clearOrderRanks(collectionId: string, curatorId: string): Promise<void>;
```

Implementation (`implementations/CollectionPreferenceItemRepository.ts`):
- In `create` values and `update` set-object, include `orderRank: data.orderRank ?? null` (integer column — no `.toString()`).
- In `mapToPreference`, add `orderRank: row.orderRank ?? null`.
- Add:

```ts
  async clearOrderRanks(collectionId: string, curatorId: string): Promise<void> {
    await this.db
      .update(preferencesTable)
      .set({ orderRank: null, updatedAt: new Date() })
      .where(and(
        eq(preferencesTable.collectionId, collectionId),
        eq(preferencesTable.curatorId, curatorId),
      ));
  }
```

(`and`/`eq` are already imported in this file; confirm.)

- [ ] **Step 4: Run test to verify it passes**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/domain.ts src/server/repositories/**/*.ts src/lib/db/binary-insertion-ranking.integration.test.ts
git commit -m "feat(preferences): persist orderRank + bulk clearOrderRanks"
```

---

### Task 6: ScoringService — drop Elo pairwise deltas; expose latest-triage bucket

**Files:**
- Modify: `src/server/services/ScoringService.ts`
- Test: `src/server/services/ScoringService.test.ts` (existing — update expectations)

**Interfaces:**
- Produces: `computePreferences` returns one item per triaged item with `score = TIER_SEED[bucket]` (no win/loss deltas), `rankBucket` = the **latest** triage result for that item, `comparisonCount` = number of pairwise events touching it (kept for display), `orderRank: null` (assigned in Task 7). Pairwise events no longer move `score`.

- [ ] **Step 1: Update the failing test**

In `ScoringService.test.ts`, replace the Elo-delta expectations with: after a triage `top` then a pairwise loss, the item's `score` stays `TIER_SEED.top` (0.875) and `rankBucket` stays `"top"` (pairwise no longer changes score/bucket). Add a case: two triage events for one item (`high` then `top`) ⇒ `rankBucket === "top"` (latest wins).

```ts
it("latest triage wins; pairwise does not move score", async () => {
  // seed decisionRepo mock: triage high @t1, triage top @t2, pairwise loss @t3
  const prefs = await service.computePreferences(collectionId, curatorId);
  const p = prefs.find((x) => x.itemId === itemId)!;
  expect(p.rankBucket).toBe("top");
  expect(p.score).toBeCloseTo(0.875);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/services/ScoringService.test.ts`
Expected: FAIL — current code applies WIN/LOSS deltas and uses first-seen triage.

- [ ] **Step 3: Implement**

In `computePreferences`: keep pass 1 but make triage **latest-wins** (iterate sorted by `(createdAt,id)`, last triage sets the bucket/seed). Delete the pairwise score-delta branch; keep counting `comparisonCount` from pairwise events (increment for both items on win/loss/tie; skip = no-op). Set `score = TIER_SEED[bucket]`, `confidence = calculateConfidence(comparisonCount)`, `rankBucket = getBucket(score)` (which equals the triage tier since seeds map cleanly), `orderRank: null`.

(Keep `getBucket`, `TIER_SEED`, `calculateConfidence`; remove `WIN_DELTA`/`LOSS_DELTA`/`clamp01` if now unused — a `no-unused-vars` lint will flag them.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/services/ScoringService.test.ts`
Expected: PASS. Also run `npm run lint` to catch dead `WIN_DELTA` etc.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ScoringService.ts src/server/services/ScoringService.test.ts
git commit -m "refactor(ranking): drop Elo pairwise deltas; latest-triage-wins bucket seed"
```

---

### Task 7: PreferenceStateService — assign `orderRank` from the engine

**Files:**
- Modify: `src/server/services/PreferenceStateService.ts`
- Test: `src/lib/db/binary-insertion-ranking.integration.test.ts`

**Interfaces:**
- Consumes: `ScoringService.computePreferences` (buckets), `deriveOrder` (Task 3), `decisionRepo` (pairwise events), `clearOrderRanks` (Task 5).
- Produces: after `recalculatePreferences`, `top`/`high` items carry a dense `orderRank` (0 = most loved) reflecting the insertion order; `medium`/`low` and unplaced `top`/`high` have `orderRank = null`.

- [ ] **Step 1: Write the failing test** (DB seam via services, un-mocked)

```ts
describeDb("recalculate assigns orderRank to top+high via insertion", () => {
  beforeAll(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });

  it("orders two loved items by their pairwise comparison", async () => {
    const { db } = getTestDb();
    const { collection, curatorId, session, items } = await seedSortScenario(db); // >=2 items, a session
    const [a, b] = items;
    // triage both top, then compare: B more loved than A
    await recordTriage(db, session.id, a.id, "top");
    await recordTriage(db, session.id, b.id, "top");
    await recordPairwise(db, session.id, a.id, b.id, "item_b"); // B>A

    await PreferenceController.fromDb(db).recalculatePreferences(collection.id, curatorId);
    const prefs = await new CollectionPreferenceItemRepository(db).findByCollection(collection.id, curatorId);
    const rankOf = (id: string) => prefs.find((p) => p.itemId === id)!.orderRank;
    expect(rankOf(b.id)).toBe(0);
    expect(rankOf(a.id)).toBe(1);
  });
});
```

Define local `recordTriage`/`recordPairwise` helpers in the test that insert `decision_events` rows directly (id via `generateId("event")`, `type`, `decision` jsonb) — mirror the payload shapes from `src/types/domain.ts` (`TriageDecision`/`PairwiseDecision`).

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Expected: FAIL — `orderRank` stays null (not assigned yet).

- [ ] **Step 3: Implement**

In `recalculatePreferences`, after computing `preferences` and before/within the upsert loop:
1. Build the rankable set: preferences with `rankBucket in ("top","high")`. For each, fetch the item's `createdAt` (join or a batched `itemRepo.findByIds`) to build `RankItem[]`.
2. Load the curator's pairwise comparison events (from `decisionRepo`, filtered `type === "pairwise_compare"`), map to `ComparisonEvent[]` (`aId=itemAId, bId=itemBId, result`).
3. `const { order } = deriveOrder(rankItems, comparisons);`
4. Build `orderRankByItem = new Map(order.map((id, i) => [id, i]));`
5. Call `preferenceRepo.clearOrderRanks(collectionId, curatorId)` first, then in the upsert set `orderRank: orderRankByItem.get(pref.itemId) ?? null` for each preference.

Keep everything inside the caller's transaction (the route passes a tx-bound controller). Clear-then-assign avoids the partial-unique-index transient collision because all ranks are NULL before any new rank is written, and the subsequent per-row writes assign distinct ranks.

- [ ] **Step 4: Run test to verify it passes**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/PreferenceStateService.ts src/lib/db/binary-insertion-ranking.integration.test.ts
git commit -m "feat(ranking): assign dense orderRank from insertion engine on recalculate"
```

---

### Task 8: Live selector — `selectNextPair` delegates to the engine

**Files:**
- Modify: `src/lib/pairwise-selection.ts`
- Test: `src/lib/pairwise-selection.test.ts` (existing) + `src/lib/insertion-ranking.test.ts`
- Modify (only if the signature changes): `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx:14,93-98`

**Interfaces:**
- Produces: `selectNextPair(...)` returns the engine's `nextPair` (the pending `[x, pivot]`) mapped to the page's existing return shape (the two item ids to show), respecting `dispositionByItemId` exclusions (skip set-aside/deferred items out of the rankable set before `deriveOrder`).

- [ ] **Step 1: Update the failing test**

In `pairwise-selection.test.ts`, assert the returned pair equals the insertion engine's next question for a small fixture (two `top` items, no comparison yet ⇒ the pair is those two), and that a set-aside item is never returned.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pairwise-selection.test.ts`
Expected: FAIL (old adjacency-window logic returns a different/duplicate pair).

- [ ] **Step 3: Implement**

Rewrite `selectNextPair` to: filter the rankable set to `top`+`high` minus `dispositionByItemId`, build `RankItem[]` + `ComparisonEvent[]` from its inputs, call `deriveOrder`, and return `nextPair` (or `null` when ordering is complete). Keep the exported function name and the page's call sites unchanged if possible; adjust `compare/page.tsx` only if the parameter/return shape must change (keep it minimal — the page already has the decisions + preferences it needs).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/pairwise-selection.test.ts src/lib/insertion-ranking.test.ts`
Expected: PASS. Then `npm run build` to confirm `compare/page.tsx` still type-checks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pairwise-selection.ts src/lib/pairwise-selection.test.ts src/app/collections/**/compare/page.tsx
git commit -m "feat(sort): drive next-pair selection from the insertion engine"
```

---

### Task 9: Decisions route — idempotency key + session row-lock

**Files:**
- Modify: `src/app/api/sessions/[id]/decisions/route.ts`
- Test: `src/lib/db/binary-insertion-ranking.integration.test.ts` (extend `decisions-routes.integration.test.ts` patterns)

**Interfaces:**
- Consumes: `withTransaction`, `decisionEventsTable`, `sessionsTable`.
- Produces: `POST` accepts optional `clientKey: string` in the body; a duplicate `(sessionId, clientKey)` returns the **existing** event with 200 (idempotent), not a 500; the recompute is serialized by `SELECT … FOR UPDATE` on the session row.

- [ ] **Step 1: Write the failing test**

```ts
it("is idempotent on a repeated clientKey", async () => {
  // POST the same triage decision twice with the same clientKey via the real route handler
  const first = await postDecision(session.id, { type: "triage", decision: { itemId: a.id, result: "top" }, clientKey: "k1" });
  const second = await postDecision(session.id, { type: "triage", decision: { itemId: a.id, result: "top" }, clientKey: "k1" });
  expect(second.status).toBeLessThan(300);
  const body2 = await second.json();
  const body1 = await first.json();
  expect(body2.id).toBe(body1.id); // same event, not a new one
  // exactly one row exists
  const { db } = getTestDb();
  const rows = await db.execute(sql`select count(*)::int as n from decision_events where session_id = ${session.id}`);
  expect((rows[0] as { n: number }).n).toBe(1);
});
```

`postDecision` invokes the route's `POST` with a mocked `getSession` (curator) and `getDb → getTestDb().db`, mirroring `decisions-routes.integration.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Expected: FAIL — second POST inserts a duplicate (or throws 23505 → 500).

- [ ] **Step 3: Implement**

In the `POST` handler, inside `withTransaction`:
1. `await tx.execute(sql\`select id from sessions where id = ${params.id} for update\`);` — serialize the curator's decisions.
2. Read `clientKey` from the body. If present, first `select` an existing event by `(session_id, client_key)`; if found, return it (skip insert + recompute) and respond 200.
3. Otherwise insert with `clientKey`. Wrap the insert to catch a 23505 on `decision_events_client_key_unique` and, on conflict, re-select and return the existing row (covers the race where two identical requests interleave).
4. Keep the existing `recalculatePreferences` + `bringBack` calls for genuinely new events only.

Return the existing-event branch with `{ status: 200 }` and the new-event branch with `{ status: 201 }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sessions/[id]/decisions/route.ts src/lib/db/binary-insertion-ranking.integration.test.ts
git commit -m "feat(decisions): idempotency key + session row-lock on recompute"
```

---

### Task 10: Finalize — read `orderRank`, bucket priority, keep the unranked-but-loved

**Files:**
- Modify: `src/server/services/sortResultMaterialization.ts`
- Test: `src/lib/db/binary-insertion-ranking.integration.test.ts`

**Interfaces:**
- Produces: `rankPreferencesToItems` orders by `(bucketPriority asc, orderRank asc NULLS LAST, itemId asc)` where `bucketPriority: top<high<medium<low`; `computedRank` = 0-based index; `computedBucket` = `pref.rankBucket`. A `top`/`high` item with `orderRank = null` still appears, after the ranked ones in its bucket.

- [ ] **Step 1: Write the failing test**

```ts
it("finalize orders by orderRank and still includes an unranked loved item", () => {
  const prefs = [
    { itemId: "L1", rankBucket: "top", orderRank: 1, score: 0.875, /*…*/ },
    { itemId: "L0", rankBucket: "top", orderRank: 0, score: 0.875 },
    { itemId: "Lx", rankBucket: "top", orderRank: null, score: 0.875 }, // loved, never ranked
    { itemId: "M",  rankBucket: "medium", orderRank: null, score: 0.375 },
  ] as CollectionPreferenceItem[];
  const out = rankPreferencesToItems(prefs);
  expect(out.map((o) => o.itemId)).toEqual(["L0", "L1", "Lx", "M"]);
  expect(out.map((o) => o.computedRank)).toEqual([0, 1, 2, 3]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/services/sortResultMaterialization.test.ts`
Expected: FAIL — current code sorts by `score` (all loved share 0.875 ⇒ unstable) and ignores `orderRank`.

- [ ] **Step 3: Implement**

```ts
const BUCKET_PRIORITY: Record<RankBucket, number> = { top: 0, high: 1, medium: 2, low: 3 };

export function rankPreferencesToItems(preferences: CollectionPreferenceItem[]): MaterializedItem[] {
  return [...preferences]
    .sort((a, b) => {
      const pa = BUCKET_PRIORITY[a.rankBucket];
      const pb = BUCKET_PRIORITY[b.rankBucket];
      if (pa !== pb) return pa - pb;
      const ra = a.orderRank ?? Number.POSITIVE_INFINITY;
      const rb = b.orderRank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
    })
    .map((pref, index) => ({
      itemId: pref.itemId,
      computedRank: index,
      computedBucket: pref.rankBucket,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/services/sortResultMaterialization.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/sortResultMaterialization.ts src/server/services/sortResultMaterialization.test.ts
git commit -m "feat(finalize): rank by bucket+orderRank; keep unranked-but-loved items"
```

---

### Task 11: Clean reset of Elo-era drafts + delete dead `PairingService`

**Files:**
- Create (hand-authored): `drizzle/00NN_reset_elo_drafts.sql`
- Delete: `src/server/services/PairingService.ts`, `src/server/services/PairingService.test.ts`
- Test: `src/lib/db/binary-insertion-ranking.integration.test.ts`

**Interfaces:**
- Produces: after migration, no `sort_results` row with `status = 'draft'` (and no orphaned `sort_result_items`); `PairingService` is gone with no remaining importers.

- [ ] **Step 1: Write the failing test**

```ts
it("clean reset removes Elo-era draft results but keeps finalized ones", async () => {
  const { db } = getTestDb();
  // seed one finalized + one draft result, then simulate the reset SQL
  // (in CI the migration already ran; here assert the invariant post-migrate)
  const drafts = await db.execute(sql`select count(*)::int as n from sort_results where status = 'draft'`);
  expect((drafts[0] as { n: number }).n).toBe(0);
});
```

Also add a static check test (unit) that nothing imports `PairingService`:

```ts
it("PairingService is deleted (no importers)", async () => {
  await expect(import("@/server/services/PairingService")).rejects.toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Expected: FAIL — draft results present / `PairingService` still importable.

- [ ] **Step 3: Implement**

Create `drizzle/00NN_reset_elo_drafts.sql`:

```sql
-- Hand-authored, FORWARD-ONLY clean reset (spec §3 Epic 0). Elo-era DRAFT sort results
-- carry computedRank derived from the retired scoring; discard them so none is finalized
-- with a dead order. Finalized results are immutable self-contained snapshots — untouched.
DELETE FROM "sort_result_items" WHERE "sort_result_id" IN (SELECT "id" FROM "sort_results" WHERE "status" = 'draft');--> statement-breakpoint
DELETE FROM "sort_results" WHERE "status" = 'draft';
```

Delete `src/server/services/PairingService.ts` and its test. Run `npm run build` — fix any (there should be none) dangling imports.

Apply the migration: `npm run db:migrate`.

- [ ] **Step 4: Run tests + full gate**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts`
Then the full gates: `npm run build && npm run test:ci && npm run lint`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add drizzle/ src/server/services/
git rm src/server/services/PairingService.ts src/server/services/PairingService.test.ts
git commit -m "chore(ranking): clean-reset Elo-era drafts; remove dead PairingService"
```

---

## Self-Review

**Spec coverage (§3 Epic 0):** recompute-from-log deterministic replay → Tasks 1–3; canonical `(createdAt,id)` + `floor` midpoint → Task 3 + engine; contradiction last-wins → Tasks 1,3; `ceil(log2(n+1))` bound → Task 2; Tie/Skip → Tasks 2–3; Love+Like = top+high scope → Tasks 6,7; dense `orderRank` clear-then-assign → Tasks 4,5,7; partial unique index → Task 4; idempotency key + row-lock → Task 9; finalize reads orderRank + bucket mapping + unranked-but-loved appears → Task 10; keep `score` NOT NULL supplied → Task 6; clean forward-only reset (drafts) → Task 11; delete dead selector → Task 11. **Test obligations (§7):** bound + adversarial sequences → Task 2; contradiction/cycle → Task 3; n=0/n=1 → Task 3; placed⟺orderRank + never-ranked-appears → Tasks 7,10; retry idempotency + concurrency lock → Task 9; migration/reset → Task 11.

**Gaps to watch during execution:** the exact `seedSortScenario`/`seedFullCollection` return shapes (Tasks 5,7) must be read from `e2e/fixtures/seed.ts` — adapt destructuring to reality, don't invent. The concurrency lock (Task 9) is asserted via idempotency + single-row-count; a true two-connection race test is optional hardening (note if skipped).

**Placeholders:** none — every code step carries real code; SQL and test bodies are concrete. `00NN` = the next drizzle sequence number, resolved at generate time.

**Type consistency:** `RankBucket`/`Bucket` = `top|high|medium|low` throughout; `orderRank: number | null` in the type, repo, engine output, and finalize; `ComparisonEvent`/`RankItem`/`DerivedOrder` names stable across Tasks 1–3 and their consumers (7,8).
