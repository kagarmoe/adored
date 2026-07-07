# Design: Epic P — Batched decision pipeline (mechanism spec)

- **Date:** 2026-07-06
- **Status:** Draft — pending adversarial review
- **Bead:** `purses-5mxt` (parent epic `purses-9v1f`)
- **Parent spec (rules fixed there, mechanisms here):**
  [`2026-07-06-usage-round-and-sort-unification-design.md`](2026-07-06-usage-round-and-sort-unification-design.md)
  §D6/§D7. Authorities: `PRODUCT.md`, `TONE.md`, `DESIGN.md` (first-order, unchanged).

## 1. Scope

One client queue + one batch endpoint so **no tap in any round waits on the database**:
triage decisions, dispositions ("Not mine"/"Not yet"), compare (as idempotent batch-of-1),
crash/pause/completion recovery. No schema migration — the `clientKey` partial unique index
and all gates already exist. Usage events are Epic R; the pipeline is built type-agnostic so
Epic R only extends a Zod union.

Out of scope (parent §5): client-side compare pair selection (`purses-ka07`), tombstone/undo
events, offline beyond localStorage.

## 2. Server

### 2.1 Route

`POST /api/sessions/[id]/decisions/batch` — `runtime: nodejs`, `maxDuration: 30` (same
protection as the single route; one recompute dominates the transaction regardless of batch
size).

Request (Zod, shared module so the client validates with the same schema before flushing):

```ts
const BatchEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("triage"),
             decision: z.object({ itemId: Ulid, result: z.enum(["top","high","medium","low"]) }),
             clientKey: Ulid }),
  z.object({ type: z.literal("pairwise_compare"),
             decision: z.object({ itemAId: Ulid, itemBId: Ulid,
                                  result: z.enum(["item_a","item_b","tie","skip"]) }),
             clientKey: Ulid }),
]);
const BatchRequestSchema = z.object({ decisions: z.array(BatchEntrySchema).min(1).max(50) });
// Ulid = z.string().length(26).regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i) — bounds ids AND clientKeys.
```

Body size is capped before `req.json()` (reject > 64 KB with 413) — 50 entries are ~10 KB, so
the cap is generous; it exists to stop jsonb-bloat abuse (parent SEC-B2).

Response `201` (or `200` if nothing new):

```ts
{ results: [{ clientKey: string, status: "created" | "duplicate" | "rejected",
              reason?: "unknown_item" }] }
```

### 2.2 Gates (identical to the single route, same order)

401 unauthenticated → session load (404) → collection access → `curatorId !== userId` 403 →
in-progress gate (`active`/`paused`, else 409). Shape-invalid body → whole-batch 400, nothing
written.

### 2.3 Transaction

One `withTransaction` (op label `record_decision_batch` for the `db_action_slow` sink):

1. `lockCollectionCurator(tx, collectionId, userId)` — the existing advisory lock.
2. **Semantic validation:** one indexed query for the collection's live item ids; entries
   referencing an unknown/foreign/deleted item (either side of a compare pair) → `rejected`
   with `reason: "unknown_item"`; valid entries proceed. This closes, for the batch route,
   the gap the single route still has (`purses-stln`).
3. **Idempotency:** one `SELECT` of existing `(sessionId, clientKey)` matches for the batch's
   keys → those entries are `duplicate`, skipped.
4. **Insert remaining entries in array order** with:
   - `createdAt`: **one shared `new Date()`** captured once per batch (the repository sets
     timestamps in JS — parent DATA-4 — so the spec pins the value, not a DB default);
   - `id`: from **`monotonicFactory()`** (the `ulid` package; `src/lib/id.ts` today exports
     plain `ulid()`, which is *not* monotonic within a millisecond) — a new
     `generateOrderedIdFactory()` used per batch. Latest-wins then resolves an in-batch
     same-item conflict to the later array entry by the id tie-break.
5. `recalculatePreferences(collectionId, userId)` — **once**.
6. Disposition-clear (`bringBack`) once per **distinct triaged itemId** among the *inserted*
   entries only.

On `23505` from a concurrent duplicate insert: re-read and mark `duplicate` (mirror the single
route's race backstop).

PostHog: **one** `sort_decision_batch_recorded` capture per request with
`{ created, duplicate, rejected }` counts (not 50 events).

### 2.4 Shared tie-break comparator (parent ARCH-6)

New `src/lib/decision-order.ts`: `compareByCreatedAtThenId(a, b)` (code-unit id comparison,
documented). `ScoringService` (currently `localeCompare`) and `insertion-ranking.ts`
(currently `>`) both switch to it. Behavior-identical for ULIDs; the point is one definition
now that id order is load-bearing.

### 2.5 Single route

Kept for compat; round UIs stop calling it. It does **not** gain the semantic item check in
this epic (filed as `purses-stln`) — Epic P doesn't widen its blast radius, it stops using it.

## 3. Client

### 3.1 Queue module — `src/features/sorting/decisionQueue.ts`

Pure + storage; no React. Storage key **`adored.pending.v1.{curatorId}.{sessionId}`**:

```ts
{ v: 1, curatorId: string, sessionId: string, entries: PendingEntry[] }
type PendingEntry =
  | { kind: "decision", clientKey: string, type: "triage" | "pairwise_compare",
      decision: TriageDecision | CompareDecision, enqueuedAt: string }
  | { kind: "disposition", clientKey: string, itemId: string,
      disposition: "set_aside" | "deferred" | "clear", enqueuedAt: string }
```

- `enqueue()` appends + writes localStorage synchronously **before** returning (the UI
  advances only after it returns). Array order in storage **is** flush order; no seq field.
- `removeQueued(clientKey)` — undo of a not-yet-in-flight entry.
- Entries have three client states: `queued` → `inFlight` → gone (acked). `inFlight` is
  in-memory only; a reload demotes everything back to `queued` (safe: flush is idempotent).
- Quarantine: entries failing the shared Zod schema at flush time (stale shape after a
  deploy) move to `adored.quarantine.v1.…` and surface one gentle notice; never retried
  (parent ARCH-4).

### 3.2 Flusher — single-flight, sequential, ordered

One flusher instance per mounted round surface (a `useDecisionFlusher(sessionId)` hook owning
the interval + listeners; module-level single-flight guard so two mounts can't double-flush).

- **Triggers:** ≥5 pending · 4 s after the oldest pending entry · round end · before the
  pause PATCH ("Take a break") · before any session PATCH to a terminal status
  (flush-then-complete; today only the generic PATCH reaches `completed`, so the rule lives
  in the shared session-PATCH client helper) · `pagehide`/`visibilitychange:hidden` with
  `fetch(…, { keepalive: true })`.
- **Drain algorithm:** take the queue head; batch the longest contiguous run of `decision`
  entries (chunked ≤50) → `POST …/decisions/batch`; a `disposition` entry flushes alone to
  its existing endpoint (`POST`/`DELETE /api/collections/[id]/dispositions…` — upsert/delete,
  naturally idempotent). Strictly sequential: the next request starts only after the previous
  ack. Preserves cross-endpoint order — `[set aside X, triage X]` lands in that order.
- **Ack handling:** per-entry — `created`/`duplicate`/`rejected` all remove the entry
  (`rejected` also logs + surfaces once, and the optimistic UI for that item is reverted on
  the next `router.refresh()`); network/5xx → retry with backoff (1 s · 4 s · 15 s · 60 s cap),
  queue intact; 400 → re-validate locally, quarantine offenders, retry the rest; 401 →
  preserve, stop until re-auth; 403 → preserve and stop permanently for this queue (not this
  curator's — never delete); 409 mid-round → stop the round gently, preserve; 409 during
  recovery → surface once, then discard (terminal-session disposal, parent ARCH-2/SEC-B4).

### 3.3 Optimistic rounds

- **Triage:** `triage/page.tsx` currently server-selects **one** item per render and
  round-trips `router.refresh()` per decision. It changes to server-select the **round
  queue** (existing `selectTriageItem` logic generalized to `selectTriageQueue(events, items,
  n)` — same ordering, first *n*) and hand it to a client round component that advances
  locally on tap, enqueueing each decision. Data fetching stays in Server Components; only
  advancement moves client-side. `router.refresh()` happens once at round end, not per tap.
- **Dispositions:** `TriageUndoProvider`'s POST/DELETE become queue enqueues (`disposition`
  entries; undo of a queued disposition = `removeQueued`). The optimistic item-advance it
  already does stays; the network leaves the tap path.
- **Compare:** unchanged loop (await → next pair), but submits via the batch route with 1
  entry + `clientKey` — gaining idempotent retry; on transient failure the same pair is
  re-asked, and the retry can't double-fold.
- **Undo-as-revisit (parent D6):** the round's back/undo affordance re-presents the last
  item. If its entry is still `queued`, it's removed (pure client). If `inFlight` or acked,
  the entry stands and the person's next answer supersedes (latest-wins). No
  return-to-unknown.

### 3.4 Recovery — `PendingDecisionsGate`

A thin client component mounted on the sort hub, round pages, and Standing/results pages:

- Reads all `adored.pending.v1.{currentCuratorId}.*` keys (other curators' keys untouched).
- Empty (the normal case): renders children immediately, zero cost.
- Non-empty: flush sequentially → `router.refresh()` → reveal. Copy is one quiet line
  ("catching up…" register, TONE-reviewed), no spinner theater, no count.
- Guarantees the parent's ordering claim: pending decisions land **before** any server-
  computed round queue, recommendation, or Standing view is trusted.

## 4. Testing floor

Exactly the parent spec §4 "Epic P — server" and "Epic P — client" lists (they were written
as this epic's obligations; not restated). Additions from this mechanism spec:

- `compareByCreatedAtThenId`: property test vs both old comparators on ULID corpora
  (behavior-identical), and the in-batch conflict test exercises it end-to-end.
- `generateOrderedIdFactory`: two ids in the same millisecond are strictly increasing.
- Batch route: 413 over the body cap; compare entry with one unknown side → `rejected`;
  `rejected` entries don't trigger disposition-clear or count toward the recompute decision.
- Drain algorithm: mixed queue `[triage, set_aside, triage]` produces batch(1) → disposition
  → batch(1) in order (fake fetch, assert call sequence).
- `PendingDecisionsGate`: non-empty queue delays reveal until ack + refresh (jsdom);
  cross-curator keys untouched.
- Benchmark: `seed-load` comparison — 50 single-POST decisions vs 1×50 batch (documents the
  recompute-amortization win; informs the flush thresholds).
- Playwright (dependency `purses-yuw`): crash-reload lands decisions before the round
  renders; pagehide delivery.

## 5. Rollout

Three PRs off one feature branch is over-slicing (memory: batch changes, gate once):
**one PR** — server (route + comparator + factory) lands with the client queue + triage/
dispositions/compare wiring + gate, gated by the full test floor. The single route stays as
the fallback path the whole time; if the queue misbehaves in prod, reverting the PR restores
today's behavior with zero data loss (events are events either way).
