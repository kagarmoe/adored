# Design: Epic P — Batched decision pipeline (mechanism spec)

- **Date:** 2026-07-06 (rev 2 — adversarial-review findings folded: 6 personas, 34 confirmed
  findings → 20 edits; verdicts architect/qa/craftsman BLOCK, data/security/tone CONCERNS,
  all resolved below)
- **Status:** Reviewed — ready for `writing-plans`
- **Bead:** `purses-5mxt` (parent epic `purses-9v1f`)
- **Parent spec (rules fixed there, mechanisms here):**
  [`2026-07-06-usage-round-and-sort-unification-design.md`](2026-07-06-usage-round-and-sort-unification-design.md)
  §D6/§D7. Authorities: `PRODUCT.md`, `TONE.md`, `DESIGN.md` (first-order, unchanged).

## 1. Scope

One client queue + one batch endpoint so **no tap in any round waits on the database**:
triage decisions, dispositions ("Not mine"/"Not yet"), compare (as idempotent batch-of-1),
crash/pause/completion recovery. No schema migration — the `clientKey` partial unique index
and all gates already exist. Usage events are Epic R; the pipeline is type-agnostic so Epic R
only extends a Zod union.

Out of scope (parent §5): client-side compare pair selection (`purses-ka07`), tombstone/undo
events, offline beyond localStorage.

## 2. Server

### 2.1 Route

`POST /api/sessions/[id]/decisions/batch` — `runtime: nodejs`, `maxDuration: 30` (same
protection as the single route; one recompute dominates the transaction regardless of batch
size).

Request (Zod, in a shared module so the client pre-validates with the same schema — §3.1):

```ts
// ClientKey: client-generated bare ULID, lowercase by construction (the client generates
// ulid().toLowerCase(); lowercase-only regex means case games can't create look-alike keys
// that the byte-exact (sessionId, clientKey) unique index would treat as distinct).
const ClientKey = z.string().length(26).regex(/^[0-9a-hjkmnp-tv-z]{26}$/);
// ItemId: server-issued prefixed id exactly as generateId("item") produces it
// (src/lib/id.ts: `item_` + 26 lowercase Crockford chars = 31 chars; within parent
// SEC-B2's ~64 cap). NOT a bare ULID — a bare-ULID schema here would 400 every real
// batch and quarantine every pending decision client-side (review F1, block).
const ItemId = z.string().max(64).regex(/^item_[0-9a-hjkmnp-tv-z]{26}$/);

const BatchEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("triage"),
             decision: z.object({ itemId: ItemId, result: z.enum(["top","high","medium","low"]) }),
             clientKey: ClientKey }),
  z.object({ type: z.literal("pairwise_compare"),
             decision: z.object({ itemAId: ItemId, itemBId: ItemId,
                                  result: z.enum(["item_a","item_b","tie","skip"]) }),
             clientKey: ClientKey }),
]);
const BatchRequestSchema = z.object({ decisions: z.array(BatchEntrySchema).min(1).max(50) });
```

Body size is capped **before parsing by stream-budget reading, not a Content-Length check**
(App Router has no `bodyParser.sizeLimit`; Content-Length is absent under chunked transfer —
review F17): a helper `readJsonWithLimit(req, 65_536)` reads `req.body` with a byte budget,
returns **413** and cancels the stream the moment the budget is exceeded, then parses the
buffered bytes. 50 entries are ~10 KB; the cap exists to stop jsonb-bloat/parse-cost abuse
(parent SEC-B2).

Response `201` if ≥1 entry was inserted, else `200`:

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
   with `reason: "unknown_item"`; valid entries proceed. Closes, for the batch route, the gap
   the single route still has (`purses-stln`).
3. **Idempotency (cross-request):** one `SELECT` of existing `(sessionId, clientKey)` matches
   for the batch's keys → those entries are `duplicate`, skipped.
4. **In-batch key dedupe (review F2):** dedupe the survivors by clientKey in memory — the
   first occurrence proceeds, later occurrences are marked `duplicate` (same semantics as a
   replay). Cross-request duplicates cannot reach the insert — the advisory lock serializes
   all writers, so step 3 is authoritative. As defense-in-depth the insert uses
   `ON CONFLICT (session_id, client_key) WHERE client_key IS NOT NULL DO NOTHING` with
   `RETURNING`, and any entry whose row comes back absent is marked `duplicate` — **never a
   mid-transaction re-read**, which would die with 25P02 inside the aborted transaction.
5. **Insert remaining entries in array order** with:
   - `createdAt`: **omitted — the column's `defaultNow()` applies** (review F3). Postgres
     `now()` is transaction-start-fixed, so every row in the batch shares one timestamp from
     the **same clock domain** as every historical row and every row the still-live single
     route writes (that route also omits `createdAt`; the repository's JS `new Date()` path
     is seed/test-only). Do NOT set it in JS: an app-server timestamp on the
     ordering-load-bearing column would let clock skew invert latest-wins across the two
     routes during the §5 compat window. *(Parent-spec erratum: D6's "createdAt is set in JS
     per row today" described the seed-only repository path; production has always used the
     DB default. Noted at §6.)*
   - `id`: from a new `generateOrderedIdFactory()` wrapping the `ulid` package's
     `monotonicFactory()`, **preserving the existing convention:
     `` event_${monotonicUlid().toLowerCase()} ``** (review F10). Lowercasing is
     order-preserving for Crockford base32, so within-batch monotonicity survives, and the
     prefix keeps new ids in the same code-unit ordering regime as existing rows; bare or
     uppercase output is forbidden — it would sort before all legacy ids and invert
     createdAt-tie resolution against single-route rows. (The table also holds legacy
     `evt_`-prefixed ids from seed/DB-test paths; see §2.4.)
     In-batch same-item conflicts resolve to the later array entry via the id tie-break.
6. `recalculatePreferences(collectionId, userId)` — **once, and only if step 5 inserted ≥1
   entry** (review F13). A batch whose entries are all `duplicate`/`rejected` (e.g. the
   recovery gate replaying a batch whose ack was lost after commit) skips recompute and
   step 7 and returns 200 — mirroring the single route's clientKey-hit path. (Epic R extends
   the predicate per parent §D3: inserted-entries-all-usage also skips.)
7. Disposition-clear (`bringBack`) once per **distinct triaged itemId** among the *inserted*
   entries only — never for `duplicate`/`rejected` entries.

PostHog: **one** `sort_decision_batch_recorded` capture per request with
`{ created, duplicate, rejected }` counts (ids never; parent PII discipline), delivered via
`flush()`.

### 2.4 Shared tie-break comparator (parent ARCH-6)

New `src/lib/decision-order.ts`: `compareByCreatedAtThenId(a, b)` (code-unit id comparison,
documented). `ScoringService` (currently `localeCompare` — host-locale-dependent, part of why
it goes) and `insertion-ranking.ts` (currently `>`) both switch to it. **Behavior-identical
on the real id corpus** — prefixed lowercase ULIDs, both `event_` and `evt_` prefixes exist —
asserted by the §4 property test, not assumed (review F10). At equal `createdAt` a
cross-format tie (`event_…` < `evt_…` code-unit) resolves by prefix, which is accepted: it
can only arise against seed/test-era rows; the comparator's job is determinism, with recency
guaranteed by `createdAt` plus same-format monotonic ids for all new writes.

### 2.5 Single route

Kept for compat; round UIs stop calling it. It does **not** gain the semantic item check in
this epic (`purses-stln`). Its existing 23505 catch-and-re-read is dead-and-broken (the
re-read would 25P02 inside the aborted transaction; the advisory lock makes the race
unreachable anyway — review F2) — it is **removed/simplified in this epic**, not mirrored.

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

**Deviations from parent D6 (deliberate — review F16):** (1) `curatorId` lives on the
envelope and in the storage key, not per entry; the isolation parent ARCH-7/SEC-B3 require is
preserved because entries exist only inside the curator-keyed envelope, and every
flush/recovery path MUST verify envelope `curatorId` against the logged-in user before
reading or deleting a queue. (2) The `.v1.` segment makes future shape migrations detectable;
parent D6's unversioned key is superseded.

- `clientKey` is generated as `ulid().toLowerCase()` (matches §2.1's `ClientKey`).
- `enqueue()` appends + writes localStorage synchronously **before** returning (the UI
  advances only after it returns). **Quota failure (review F18):** if the synchronous write
  throws, `enqueue()` triggers an immediate flush to shrink the queue and retries the write
  once; if it still fails, that decision degrades to today's awaited direct submit
  (batch-of-1) and the UI advances only on its ack — never advance on an unpersisted,
  unacked tap.
- Array order in storage **is** flush order; no seq field.
- `removeQueued(clientKey)` — undo of a not-yet-in-flight entry.
- Client entry states: `queued` → `inFlight` → gone (acked). `inFlight` is in-memory only; a
  reload demotes everything to `queued` (safe: flush is idempotent).
- **Quarantine (parent ARCH-4; reviews F9, F18):** entries failing the shared Zod schema at
  flush time (stale shape after a deploy) move to `adored.quarantine.v1.…` — capped (50
  entries, FIFO eviction), deleted once older than the §3.4 GC TTL — and surface **one**
  notice for the whole quarantined set (never one per entry), on the next mounted sort
  surface (the same slot `PendingDecisionsGate` uses), dismissible, non-blocking. Register is
  person-side and non-error, TONE-reviewed, e.g. *"A few answers from before didn't reach us
  — those pieces will simply come around again."* **Resurfacing is the reconciliation, by
  design:** a quarantined decision produced no event, so its item re-enters future round
  queues naturally (parent §D7); no compensating write, no error framing. Never retried.

### 3.2 Flusher — one engine, single-flight across tabs, sequential, ordered

**One module-level engine per curator exporting `drain(keys): Promise<void>` — the only code
that POSTs** (review F12). Single-flight is promise-based, not skip-based: a caller that
finds a drain in flight awaits the same promise; `drain` resolves only when every entry
visible at call time (plus any enqueued during the drain for the same keys) is acked,
quarantined, or the failure taxonomy says stop. `useDecisionFlusher(sessionId)` owns only
triggers (interval + listeners) and calls `drain([sessionKey])`.

**Cross-tab exclusion (review F11):** the module guard is per-JS-realm, so every drain — and
every queue mutation that rewrites the stored blob (ack-removal, quarantine) — runs inside
`navigator.locks.request('adored.flush.v1.{curatorId}.{sessionId}', …)` (Web Locks). At most
one tab flushes or acks at a time (parent ARCH-5's normative sequencing), and a tab's
ack-removal can't clobber another tab's concurrent enqueue; the drain re-reads the queue from
storage under the lock before each request. Enqueue stays synchronous (append is safe once
removals are serialized; server clientKey idempotency backstops any residual duplicate
flush).

- **Triggers:** ≥5 pending · 4 s after the oldest pending entry · round end · before the
  pause PATCH · before any session PATCH to a terminal status (flush-then-complete; the rule
  lives in the shared session-PATCH client helper) · `pagehide`/`visibilitychange:hidden`
  with `fetch(…, { keepalive: true })`. **The pause pre-flush is best-effort and non-blocking
  (review F8):** the pause PATCH and navigation proceed even if the flush fails or is backing
  off — the queue persists and the gate recovers it on return; stepping away is never gated
  on the network. **Pagehide preempts an active backoff wait** (cancel the timer, flush
  immediately with keepalive); a request already in flight at pagehide is left to die — its
  entries remain queued (`inFlight` is memory-only) and recovery re-flushes.
- **Drain algorithm:** take the queue head; batch the longest contiguous run of `decision`
  entries (chunked ≤50, in order) → the batch route; a `disposition` entry flushes alone to
  the existing dispositions endpoint between runs. Strictly sequential; cross-endpoint order
  preserved — `[set aside X, triage X]` lands in that order.
- **Ack / failure taxonomy (reviews F4, F8, F9, F18):**
  - `created` / `duplicate` → remove the entry.
  - `rejected` (`unknown_item`) → remove the entry; log; surface one quiet, dismissible,
    person-side notice on the current round surface — `unknown_item` means the piece is no
    longer in the collection, so the honest copy is that the piece has moved on, e.g. *"One
    piece isn't in this collection anymore, so that answer wasn't needed"* — never
    "error"/"failed"/"invalid". **Accepted staleness window, named:** there is no per-ack
    refresh (§3.3 refreshes at round end), so the round keeps its optimistic state and a
    rejected decision can appear accepted for the rest of the round; server truth reconciles
    at the round-end `router.refresh()` (or the gate's), the notice must land no later than
    that revert so the disappearance is never unexplained; rejected entries never appear in
    round queues, Standing, or WhatMoved. Undo-as-revisit of a rejected entry is a no-op.
  - Network / 5xx → retry with backoff (1 s · 4 s · 15 s · 60 s cap), queue intact; a
    success resets the schedule.
  - 400 → re-validate locally against the shared schema, quarantine offenders (§3.1), retry
    the rest.
  - 401 → preserve, stop until re-auth.
  - 403 → preserve and stop for this queue (not this curator's) — retained until the §3.4 GC
    TTL, never deleted live.
  - **409 split by endpoint (review F4 — 4-persona convergence):** from the **sessions batch
    route** (in-progress gate): mid-round → stop the round gently, preserve; during recovery
    → surface once, then discard (terminal-session disposal, parent ARCH-2/SEC-B4). From a
    **disposition POST** (`PreferenceExistsError` — the item was triaged before this
    disposition flushed; permanent, disposed ⇔ untriaged) → **per-entry rejection**: remove
    that entry only, one gentle notice, optimistic revert at the next refresh; never
    session-level, never preserved, never stops the drain. A disposition **404** (item gone)
    → drop the entry silently; continue. (`DELETE /dispositions` is idempotent and cannot
    409.)

### 3.3 Optimistic rounds

- **Triage:** the page currently server-selects **one** item per render and round-trips
  `router.refresh()` per decision. It changes to server-select the **round queue** and hand
  it to a client round component that advances locally, enqueueing each decision;
  `router.refresh()` happens **once at round end**, never per tap. Data fetching stays in
  Server Components.
  - **`selectTriageQueue` defined (review F6):** `selectTriageQueue(items, preferenceItemIds,
    dispositionByItemId)` → `TriageQueueEntry[]`, `TriageQueueEntry = { item, deferred:
    boolean }`. **No count parameter:** the queue is the entire eligible remainder —
    untriaged, not set aside; active items first, then deferred, in today's ordering —
    because rounds are time-boxed (parent D2), never count-boxed. **Termination:** queue
    exhaustion or timer expiry, whichever first — exhaustion ends the round early into "what
    moved"; no mid-round refetch. The "Ready when you are" deferred banner becomes
    **per-entry** (shows while the current entry has `deferred: true`; the page-level
    `showingDeferred` flag is retired). `selectTriageItem` is reimplemented as "first entry
    of `selectTriageQueue`" so `next-round.ts` and the round page agree by construction.
  - **"{n} decided so far" cue (review F20):** client-maintained — seed with the
    server-computed distinct-decided count, keep a client set of newly-decided itemIds (add
    on triage enqueue; remove on `removeQueued` undo of an item not in the seed; a re-answer
    of a counted item doesn't increment; dispositions don't count). Renders seed + set size:
    ticks on the tap, never on the flush; reconciles at the round-end refresh.
- **Dispositions:** `TriageUndoProvider`'s POST/DELETE become queue enqueues; undo of a
  queued disposition = `removeQueued`. The optimistic item-advance stays; the network leaves
  the tap path.
- **Compare:** unchanged loop (await → next pair), but submits **through the queue and
  flusher** as a batch-of-1 (enqueue → immediate flush trigger → await that entry's ack),
  never a bare fetch — inside the same single-flight/Web-Lock sequencing as everything else
  (review F11), so it can't interleave with a draining queue. The compare surface doesn't
  wait out the 60 s backoff cap: after ~5 s of retries it shows the gentle retry state while
  the queue keeps the entry.
- **Undo-as-revisit (parent D6; reviews F4, F19):** the round's back affordance re-presents
  the last item. Still `queued` → entry removed (pure client). `inFlight`/acked → the entry
  stands and the person's next **triage** answer supersedes (latest-wins holds only within
  the decision-event domain). A disposition cannot supersede a flushed triage (server
  invariant disposed ⇔ untriaged; no tombstones), so a revisited item whose triage entry is
  in-flight/acked **hides the "Not mine"/"Not yet" affordances**; if the triage entry is
  still queued, choosing a disposition removes the queued triage first. The §3.2 per-entry
  409 rule backstops orderings the client can't see (cross-device). **The standing answer is
  shown (F19):** a revisited in-flight/acked item renders its prior choice as currently
  selected, copy in the *"You placed this with Like — change it?"* register — walking away
  without re-answering is an honest no-op because the answer was never shown as rescinded.
  `DecisionControls` gains an optional prior-answer prop; absent = today's fresh rendering.
- **Round-end recap — "What moved" (review F5, data+tone convergence):** the recap must
  never be computed from pre-round server data (it would render "a gentle pass" after twelve
  decisions — the epic's signature affirmation moment inverted). When the round ends, the
  surface computes the summary **once** by merging (a) the server-fetched decision log with
  (b) this session's pending/in-flight entries mapped to the recap's shape, using each
  entry's `enqueuedAt` (same client clock as the round window start, keeping the window
  filter consistent; the pure `whatMoved` function just receives the merged array). The
  summary is **frozen at that instant**; the round-end flush and the single
  `router.refresh()` proceed behind it and must not re-render it (also prevents
  double-counting an entry momentarily present in both the refreshed log and the not-yet-
  pruned queue). Round-end ordering: trigger the final flush → await ack (or terminal
  failure per §3.2) → `router.refresh()` — while the flush is retrying, the recap may render
  (its counts are client-owned) but no server-derived surface is trusted until ack + refresh.

### 3.4 Recovery — `PendingDecisionsGate`

A thin client component on the sort hub, round pages, and Standing/results pages:

- Reads all `adored.pending.v1.{currentCuratorId}.*` keys (other curators' keys untouched);
  verifies envelope curatorId (§3.1).
- Empty (the normal case): renders children immediately, zero cost.
- **Non-empty (reviews F7, F8, F12 — one contract):** children are **not mounted** during
  recovery — the gate conditionally renders one quiet person-side line instead (conditional
  mount, never CSS-hide: a mounted round component would already have copied the stale
  server-selected queue into client state). It `await drain(allPendingKeysForCurrentCurator)`
  — the same module engine, so a drain already started by a hook is awaited, never raced —
  then `startTransition(() => router.refresh())` and treats the refresh as complete only
  when the transition settles (`useTransition`'s `isPending` → false; `router.refresh()`
  itself returns void). Only then mount children, which render from the post-flush RSC
  payload. **Reveal is time-bounded (F8):** if every entry hasn't acked within ~5 s (one
  backoff step), reveal anyway with one quiet line (*"A few of your answers are still on
  their way — everything here catches up in a moment"*), keep flushing in the background,
  and run one `router.refresh()` on final ack. 401 → reveal immediately with the re-auth
  affordance (queue preserved); 403 / recovery-409 → reveal immediately after the one-time
  surface/disposal. Named trade-off: after the bound, availability beats the ordering
  guarantee; the post-ack refresh restores it.
- **Storage GC (review F18):** after handling the current curator's keys, sweep every
  `adored.pending.v1.*` / `adored.quarantine.v1.*` key whose newest `enqueuedAt` is older
  than a TTL (30 days) and delete it — including other curators' and 403-stopped queues. The
  TTL dwarfs any legitimate flush window; §3.2's "403 → never deleted" thus means "retained
  until GC TTL". Bounds shared-device residue (parent trade-offs line updated, §6).

## 4. Testing floor

Parent spec §4's "Epic P — server" and "Epic P — client" lists are this epic's base
obligations (not restated). Additions and strengthenings from this rev:

**Server (DB-backed, `RUN_DB_TESTS=1`):**
- Shape + semantic validation use **repository-format ids** (`generateId("item")`); one test
  asserts a real generated id passes the shared schema end-to-end (client + server) — the
  schema can never silently drift from the id format again (F1); a bare 26-char ULID itemId
  is rejected.
- Batch with two same-clientKey entries → 201, first `created`, second `duplicate`, exactly
  one row, one recompute — never a 500 (F2). Retry of a fully committed batch → 200, all
  `duplicate`, zero new rows, **zero recomputes**, no disposition-clear (F2+F13, via the
  recompute-count observable, not a mock spy); ≥1 inserted → 201 with exactly one recompute.
- **Cross-path latest-wins:** same item, single route then batch route (and vice versa) in
  separate transactions resolves to insertion order — guards the shared clock domain (F3);
  all rows of one batch share one DB-assigned `createdAt` and in-batch conflicts resolve by
  id.
- Comparator property test vs both old comparators (`localeCompare`, `>`) on realistic
  corpora: `event_`- and `evt_`-prefixed lowercase ULIDs mixed, plus
  `generateOrderedIdFactory` output — sign-equality with both, factory order surviving
  prefix+lowercase, and a factory id at equal `createdAt` ordering after an earlier
  same-batch id (F10). Factory: two ids in the same millisecond strictly increase.
- Gates (mirroring the single route's tests): 401 / unknown session 404 / non-curator member
  403, each asserting nothing written; register the route in the authz-enumeration
  `buildStrangerCases()` (F14).
- 413 asserted against a Request with a ReadableStream body and **no Content-Length header**
  — proves stream-enforcement, not header trust (F17). Compare entry with one unknown side →
  `rejected`; rejected entries trigger no disposition-clear and don't count toward the
  recompute predicate.
- Analytics: a mixed created+duplicate+rejected batch emits exactly one
  `sort_decision_batch_recorded` whose counts match the response, via `flush()` (F15).

**Client (vitest/jsdom, fake timers/fetch):**
- Drain: `[triage, set_aside, triage]` → batch(1) → disposition → batch(1), in order.
  Disposition 409 (`PreferenceExistsError`): entry removed, one notice, drain continues,
  round does not stop; recovery with `[set_aside X (409s), triage Y]` never discards Y (F4).
- Backoff schedule pinned: 1 s · 4 s · 15 s · 60 s, capped, reset on success (F15). Pagehide
  during a backoff wait fires the keepalive flush immediately (F11).
- Cross-tab: two simulated realms over one storage key acquire the Web Lock exclusively — no
  concurrent drain, no lost enqueue during ack-removal; compare's batch-of-1 goes through
  the flusher (call sequence), never a bare fetch (F11). Gate mounting during a hook-
  initiated drain awaits it — no second POST (F12).
- Triage round: n taps → **zero** mid-round `router.refresh()`, exactly one at round end
  (F15); "decided so far" ticks on tap, no double-count on revisit, decrements on queued
  undo (F20).
- `selectTriageQueue`: first-entry equivalence with today's `selectTriageItem` across the
  existing fixture table (item + banner flag); active-then-deferred ordering with per-entry
  flags; triaged/set-aside exclusion; empty input; exhaustion ends the round early into the
  recap (F6).
- Undo/revisit: in-flight/acked item re-presents with the standing answer selected; a
  different tap enqueues a superseding entry; navigating away leaves queue + answer
  untouched; disposition affordances hidden for in-flight/acked triage; queued-triage +
  disposition = only the disposition remains (F19+F4).
- Recap: N unflushed optimistic decisions render a recap counting all N ("gentle pass" copy
  asserted absent; a truly empty round still shows it); refresh fires only after final ack;
  a post-end refresh/prune doesn't change displayed counts (F5).
- Rejection/quarantine: a `rejected` ack renders its notice exactly once (copy asserted
  against the exported constant), no refresh at ack time, optimistic state retained until
  the round-end refresh, notice present when the revert lands; N quarantined entries → one
  notice; quarantine reconciliation proven — a quarantined item reappears in the next
  `selectTriageQueue` (F9).
- Gate: children **unmounted** (not hidden) until last ack **and** the refresh transition
  settles (mocked refresh exposes a controllable completion signal); bounded reveal after
  ~5 s with queue intact + background flush continuing; 401 immediate reveal + re-auth;
  cross-curator keys untouched; GC removes an expired foreign key, keeps fresh ones (F7,
  F8, F18). Enqueue quota-throw falls back to awaited direct submit (F18).
- "Take a break" with a failing/backing-off pre-flush still pauses and navigates, queue
  preserved (F8).

**Playwright (dependency `purses-yuw`):** crash-reload lands decisions before the round
renders; pagehide delivery.

**Benchmark:** `seed-load` — 50 single POSTs vs 1×50 batch (documents the amortization win;
informs thresholds).

## 5. Rollout

**One PR** (memory: batch changes, gate once): server (route + comparator + factory) + client
queue + triage/dispositions/compare wiring + gate, gated by the full test floor. The single
route stays as the fallback the whole time; reverting the PR restores today's behavior with
zero data loss (events are events either way).

## 6. Parent-spec errata recorded by this rev

- D6 "createdAt is set in JS per-row" → production uses the DB default; DB `now()` stays the
  ordering authority (F3).
- D6 per-entry curatorId + unversioned key → envelope curatorId + `.v1.` key (F16).
- D6 accepted trade-offs → shared-profile residue retained at most the GC TTL (F18).
- D7 recovery bullet → reveal = conditional mount after the refresh transition settles,
  time-bounded; pause pre-flush is non-blocking (F7/F8).
