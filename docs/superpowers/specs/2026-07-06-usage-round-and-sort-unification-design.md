# Design: Usage round + three-sort unification + batched decision pipeline

- **Date:** 2026-07-06 (rev 3 — timer-default decision folded; rev 2 was post-adversarial-review)
- **Status:** Adversarially reviewed (5 personas, all CONCERNS→resolved below); user-approved
  direction incl. timer default (2026-07-06)
- **Authorities (first-order, unchanged):** [`PRODUCT.md`](../../../PRODUCT.md),
  [`TONE.md`](../../../TONE.md), [`DESIGN.md`](../../../DESIGN.md). Where any design choice and
  `TONE.md` disagree, `TONE.md` wins.
- **Parent:** [`2026-06-30-wireframes-workflow-alignment-design.md`](2026-06-30-wireframes-workflow-alignment-design.md)
  — this spec designs the "Useful round" that spec deferred (§6), plus the write-path and
  results changes it implies. Its settled decisions (binary insertion, rounds-in-a-session,
  Decide surface, no swiping) are inputs here, not re-litigated.

## 1. What the user asked for (2026-07-06)

1. A plan for a **"Do you use this?" sort** — a faster pass: see the image briefly, tap yes or
   no; an undecided item returns at the end of the round.
2. **Binning and usage are the primary sorts** — results must be derivable from either alone.
3. A way to **reconcile "I love it" with "I don't use it"** in the ranking.
4. **Comparison stays optional** — it refines; it is never required.
5. A coherent **UX for three sorts**.
6. **DB writes are too slow** — batch decisions, compute once, then write.
7. A story for **pause / crash / sudden shutdown** so no decisions are lost.

Clarified by the user during design (2026-07-06):

8. **Timed-round choices span 30 seconds – 5 minutes.** Sorts longer than 5 minutes are
   exhausting; the bound is care, not gamification.
9. The usage sort is **not presented as a game** — no lightning-round framing in the UI — but
   it must fit Adored's tone. The design goal for the yes/no decision is that the person
   **becomes comfortable making it**: comfort through low stakes and repetition, not speed for
   its own sake.
10. **The persistence fix covers every sort** — "it is the same problem in three locations" —
    including the disposition taps ("Not mine" / "Not yet") inside the triage round.
11. **Manual re-ranking doesn't work** — confirmed: the backend is fully built
    (`PATCH /api/sort-results/[id]/items/[rid]` + `/reset`, repo/service/authz tests) but no
    client UI ever calls it. Epic S ships the missing surface.
12. **A timer is the default** (user decision 2026-07-06, resolving rev 2's open question 1):
    rounds default to a timed box; **"No timer" remains a clear, first-class option** — always
    visible on the length chooser, never buried. This deliberately supersedes the shipped
    `"none"` default and its code comment.

## 2. Core design decisions

### D1 — Usage is a second *axis*, not a third *tier*

Love (triage buckets + orderRank) answers *"how much do I love this?"*. Usage answers a
different, factual question: *"is this in my life right now?"*. The two are orthogonal:

- **Usage never moves the love ranking.** No blended score, no penalty, no decay. A blended
  number would be opaque, machine-side, and quietly judgmental — exactly what TONE forbids.
  Love stays the canonical ranking axis; usage annotates it.
- **Reconciliation is presentation, not arithmetic** (D4). "Loved but not used" is a real,
  honorable category (heirlooms, occasion pieces, display treasures). The product's job is to
  *show the person that pairing gently*, not to resolve it for them.

### D2 — The Usage round: mechanics

A third round type alongside Triage and Compare, reusing the shipped round machinery
(`RoundShell`, `RoundSurface`, `RoundTimer`, `WhatMoved`, `roundCopy`).

- **Design goal (user): comfort with the decision.** The round exists to make the yes/no
  answer feel easy and safe to give, one honest fact at a time. Everything below — pacing,
  pass semantics, copy — serves decision-comfort, not throughput. "Lightning round" is
  internal shorthand only; the UI never frames the round as a game, a challenge, or a race.
- **Question:** one item, photo dominant, "Do you use this?" — two tap targets ≥44px:
  **"Yes, I use it"** / **"Not these days"**, plus an always-visible **"Skip for now"**. Copy
  is person-side and judgement-free (final wording is a TONE-review item); a "no" is a fact
  the person already knows, and answering it should feel lighter each time, not braver.
- **Queue:** built once at round start, server-side (today's SSR pattern): items not disposed
  (`set_aside`/`deferred`), usage currently unknown. Untriaged items are included — usage is a
  primary sort (user point 2), not a triage postscript.
- **Pacing:** **Relaxed is the default** — no auto-advance, ever, unless the person turns on
  **Quick**, a quiet in-round toggle (persisted per device). In Quick, an undecided item
  gently advances after a fixed beat (start 5 s, a const) and re-enters the tail of the round
  queue. No pre-round pace chooser — a decision screen in front of a low-load round is its own
  cognitive load (review finding A5b); the toggle lives unobtrusively on the round surface.
- **First-use education (review finding UX-4):** the first time Quick is enabled, one line of
  copy states the contract before anything moves: *"If you're not sure, it just comes around
  again."* The return must be known **before** the first item slides away, or consequence-free
  isn't felt as consequence-free.
- **Pass semantics and termination (review findings UX-5, QA-6):** a pass (tap or
  auto-advance) writes **nothing** — absence of an event *is* "undecided", so nothing is ever
  counted against the person. Each item is presented **at most twice per round**; a second
  pass removes it from this round's queue (it stays usage-unknown for a future round, never an
  error). An all-pass round therefore provably terminates: queue exhaustion or ring expiry,
  whichever first.
- **No per-item countdown display.** No ticking numerals, no shrinking bar on the card. The
  round-level ring (existing `RoundTimer`, with its shipped a11y treatment) remains the only
  time signal. The per-item beat is felt as rhythm, not watched as a deadline.
- **Round-length choices (user points 8 + 12; review findings UX-1/QA-5/A3, then resolved by
  the user 2026-07-06):** the shipped preference is `5 | 10 | 20 | "none"` minutes, default
  `"none"`. This spec changes the **timed** choices to span **30 s – 5 min**
  (30 s · 1 m · 2 m · 5 m) for every round type, and **the default becomes timed — 2 m**
  (mid-range: long enough to feel unhurried, well short of exhausting; a named const, tunable
  on device). **"No timer" survives as a clear, first-class choice** presented alongside the
  timed options on the round surface's length chooser — never buried in settings. This is a
  deliberate product decision by the user superseding the shipped no-countdown default (the
  review's regression warning was answered, not ignored): WCAG 2.2.1 stays satisfied because
  the person can switch to "No timer" (or another length) before and during a round, and the
  timer's expiry is consequence-free — the round simply closes into "what moved"; nothing is
  lost, nothing is counted. Stale stored `10`/`20` values clamp on read to 5 m; a stored
  `"none"` stays valid.

**TONE analysis (commitment 4 — unpressured, no urgency, no deadlines):** the design passes
without an amendment because (a) Quick is *chosen by the person*, never the default; (b) the
person can leave Quick **mid-round** with the same toggle — "the person sets the pace" is a
designed control, not an assertion (review finding UX-3); (c) a pass is consequence-free and
identical in outcome to "Skip for now"; (d) the return of a passed item is stated up front;
(e) there is no visible per-item countdown and no urgency copy. Felt quality: "answer from
your first instinct; if you're not sure, it'll come around again."

The **default-on round timer** (point 12) is held to the same standard: the time-box is care —
it bounds effort so a session ends before it exhausts — not pressure. Its expiry ends the
round gently (into "what moved"), never mid-decision penalty; the ring keeps its shipped a11y
treatment; and "No timer" is one visible tap away before or during any round. Round copy
presents the box person-side ("a short round — it wraps up gently"), never machine-side
("time limit").

**Accessibility floor (rewritten per review finding UX-2):** the parent spec's round-timer
floor applies, plus for Quick specifically: (a) **auto-advance suspends while keyboard focus
is inside the decision controls** (focus is trivially detectable; this serves sighted keyboard
users and screen-reader users alike — the previous "not detectable" hedge was wrong); (b) on
advance, **focus moves to the new item's question heading** (defined destination, WCAG 2.4.3);
(c) item changes are announced via `aria-live`; (d) reduced motion ⇒ instant swap, the advance
callback still fires; (e) Quick + screen reader is served by (a) — suspension while
interacting — not by hoping SR users stay on Relaxed. WCAG 2.2.1 is satisfied by Relaxed
being the default and Quick being toggle-off-able mid-round.

### D3 — Data model: `usage` decision events, derived at read time

- **Event:** new `decision_events` type `"usage"`, payload
  `{ itemId, result: "uses" | "not_uses" }`. A pass writes nothing. Appended to the same log,
  same session container, same `clientKey` idempotency. Latest event per item wins, tie-break
  on id — via the **one shared comparator** Epic P extracts (review finding ARCH-6:
  `ScoringService` uses `localeCompare`, `insertion-ranking` uses code-unit compare; the batch
  design makes id-order load-bearing, so both consumers point at one function).
- **No projection table** (reversal of rev 1, per converged review findings A2 + DATA-1/2/3):
  usage is derived at read time by a pure fold `deriveUsage(events)` in `src/lib/` (same shape
  as `deriveStanding`): latest usage event per item, dropping itemIds not in the live item
  set (purged/deleted items fall out naturally, as `standing.ts` already does). Consumers:
  Standing and `recommendNextRound` — two readers of one cheap fold over event volumes that
  are already loaded wholesale on every recompute today. A materialized `item_usage` table
  bought: a migration, three purge-service integrations (nothing in this schema cascades — the
  purge flows delete FK children explicitly and would all 23503), a Standing index, and a
  replay-vs-upsert consistency contract. Per the repo's "no premature abstraction": derive
  now; materialize later **only if** a real query plan hurts (follow-up bead, not Epic scope).
- **Recompute skip:** usage events change no scores and no orderRank. Batches containing only
  usage events skip the insertion-ranking replay and the preferences rewrite entirely; any
  triage/compare event in a batch triggers the full existing recompute (once).
- **Usage events do not clear dispositions** (unlike triage): answering a factual question is
  not claiming the item. Disposed items never enter the usage queue; a usage event arriving
  for a now-disposed item (cross-device race) is accepted — harmless under latest-wins, and
  Standing excludes disposed items anyway (review finding QA-7).

### D4 — Results from either sort; reconciliation in Standing

`deriveStanding` grows from one axis to two, composing whatever data exists:

- **Triage only** (today): loved/onward tiers, orderRank where placed. Unchanged.
- **Usage only:** two gentle groups — **"In your life"** (uses) and **"Resting"** (not these
  days). Undecided items are absent from the groups, but with one non-counting line so absence
  doesn't read as loss: *"More will appear here as you answer."* — no denominator, no "N
  unanswered" (review finding UX-7).
- **Both:** the love tiers remain the spine (love is the headline, per PRODUCT); usage appears
  as a quiet annotation on each item (colorblind-safe, never hue-alone) and as an optional
  lens: **"Loved, and resting"** — the love-high/usage-no pairing, framed as recognition, not
  prescription. The product names the pairing and stops: no "consider letting go" nudge, no
  discard call-to-action. Acting on it belongs to the person, via the existing set-aside /
  story-forward affordances. (Review-cleared against TONE commitment 1: passes the litmus
  test as an optional lens with no CTA.)
- **Finalize:** a finalized ranked list still requires love decisions (it *is* the love
  ranking). Usage annotations are snapshotted into `sort_result_items` (nullable `usage`
  column — a non-rewriting migration) at draft materialization, so a finalized keepsake list
  never re-reads live data. A usage-only collection can't finalize a ranking — Standing is its
  result; the hub doesn't offer Finalize until love data exists. **Revision semantics (review
  finding DATA-5):** a "(Revision)" draft clones its source's items — including the usage
  annotations *as of the original snapshot*. Chosen deliberately: a revision revises the
  *ranking*, and its provenance is the finalized result, not live data. Epic S pins this with
  a test.

### D5 — Three sorts, one hub

- **Round types:** Get acquainted (triage) · Do you use this? (usage) · Which do you love
  more? (compare).
- **`recommendNextRound` ladder:** untriaged items → **Triage**; usage-unknown items →
  **Usage**; unplaced Love/Like items → **Compare**; else → Decide. One recommended round as
  the single dominant action; the other available rounds as quiet secondary entries.
- **Anti-nagging rule (review finding UX-5):** because a pass writes nothing, the hub can't
  distinguish "never asked" from "asked, declined twice" — so a person done with the usage
  question would otherwise see it recommended forever. Rule: after a usage round completes on
  this device, the hub demotes Usage below Compare for that session (device-local memory
  beside the round prefs; no schema). Their implicit "not now" is honored.
- **Compare stays optional by construction** (parent decision B): finishing on buckets alone
  is valid; unplaced Love/Like items still materialize at their tier's end. Copy frames
  Compare as refinement ("put a few in order"), never as remaining work.
- **Session model unchanged:** one durable session per (collection, curator); rounds of any
  type are ephemeral time-boxes inside it. No rounds table.

### D6 — Batched decision pipeline (one mechanism for every sort)

Today every decision is a blocking `POST` → advisory lock → full event-log replay →
delete-all-then-insert of `preferences` → `router.refresh()`. The person waits on all of it,
per item — the same problem in three locations (user point 10). One client queue and one
batch endpoint fix it everywhere.

**Client — optimistic queue (single-flight, ordered):**
- Round pages keep fetching their queue server-side (SSR, per Next.js opinion #3); the round
  then advances from client state on tap — no awaited network, no `router.refresh()` per
  decision.
- Each action is enqueued with a client-generated ULID `clientKey` and synchronously persisted
  to `localStorage` **before the UI advances**. Storage shape refined in Epic P §3.1
  (erratum F16): versioned, curator-keyed envelope
  **`adored.pending.v1.{curatorId}.{sessionId}`** — envelope `curatorId` supersedes this
  spec's earlier per-entry copy; the isolation intent stands (review findings ARCH-7/SEC-B3:
  a shared browser profile must never flush one curator's decisions under another's login,
  and recovery must leave a foreign queue untouched). Queue order in storage **is** the flush
  order; no per-entry seq (review finding A5a).
- **The queue carries all round actions:** triage, compare, and usage decisions (batch
  entries) **and dispositions** ("Not mine"/"Not yet" — user point 10). The flusher drains
  sequentially, **single-flight** (normative — review finding ARCH-5: sequential flushing is
  what makes cross-transaction same-millisecond ordering a non-issue): contiguous runs of
  decision entries go to the batch endpoint (chunked ≤50, in order); disposition entries flush
  individually to their existing endpoint between runs (the upsert is naturally idempotent),
  preserving overall order — a queued `[set aside X, triage X]` lands in that order.
- Flush triggers: 5 pending · 4 s since first pending · round end · pause ("Take a break"
  flushes before the PATCH) · **session completion (flush-then-complete — review finding
  ARCH-2)** · `pagehide`/`visibilitychange` via `fetch(…, { keepalive: true })`.
- Entries are removed from storage only on server ack (per-entry).
- **Failure taxonomy (review finding ARCH-4 — no poison-batch jam):** transient (network /
  5xx) → retry with backoff, queue intact. Permanent (400) → the client validates entries
  against the shared Zod schema *before* flush; anything invalid (e.g. stale-shape entries
  surviving a deploy) is quarantined out of the queue, surfaced once, never retried. 401 →
  queue preserved across re-login. 403 (not this curator's session) → preserve and stop —
  never delete another curator's queue. 409 mid-round (session left in-progress state) → stop
  the round gently, preserve the queue; 409 at *recovery* time (terminal session) → surface
  once, then discard the orphaned queue (review findings ARCH-2/SEC-B4: "preserved into a
  black hole" is not preservation).
- **Undo (review findings ARCH-1/A4 — designed, not asserted):** the affordance is *revisit*,
  not erase. Undo of a **queued** entry removes it from the queue and re-presents the item.
  An entry **in flight or already flushed** cannot be un-written (the event union has no
  tombstone, deliberately): undo re-presents the item and the person's next answer supersedes
  by latest-wins. Returning a flushed answer to "unknown" is **not offered** — named scope
  cut, consistent with re-triage semantics today. In-flight entries are un-undoable until
  ack (single-flight makes this window one batch wide).

**Server — batch endpoint:**
- `POST /api/sessions/[id]/decisions/batch`: `{ decisions: [{ type, decision, clientKey }, …] }`,
  `clientKey` required per entry, **max 50 entries**, ids/clientKey length-capped (~64;
  ULIDs are 26 chars) and a request-body size cap (review finding SEC-B2).
- Gates identical to the single route (auth → collection access → curator ownership 403 →
  in-progress 409), then one transaction: one advisory lock (`lockCollectionCurator`) → insert
  events in array order → **one** recompute → one disposition-clear pass for the triaged
  itemIds only (mixed batches must not let usage entries clear dispositions — review QA-9).
- **Validation semantics (review findings SEC-B1 + QA-7):** *shape*-invalid request (fails
  Zod) → whole-batch 400, nothing written. *Semantically* invalid entries — an itemId not in
  this collection's live items (the existing single route never checks this; the batch closes
  the inherited gap with one indexed query per batch) — are **rejected per-entry** while valid
  entries proceed. Response:
  `{ results: [{ clientKey, status: "created" | "duplicate" | "rejected" }] }`.
- **Ordering correctness (erratum via Epic P rev 2, F3):** the *production* decisions route
  omits `createdAt`, so the column's `defaultNow()` (transaction-start-fixed) applies — the
  repository's JS `new Date()` path is seed/test-only. Epic P therefore keeps **DB `now()` as
  the ordering authority** (one shared timestamp per batch for free, same clock domain as all
  historical and single-route rows) **+ ids from a monotonic ULID factory in array order**
  (base `ulid()` is not monotonic within a millisecond). Latest-wins resolves in-batch
  conflicts to the later array entry — named test. Cross-batch ordering is protected by the
  single-flight sequential flusher (normative; Web-Lock across tabs, Epic P §3.2).
- **Compare is carved out of the optimistic queue (review finding A1 — the one scope
  correction):** compare's next pair *depends on the previous answer* (binary insertion), so
  there is no prefetchable queue. Epic P scopes optimistic batching to the answer-independent
  flows (triage, usage, dispositions); **compare submits through the batch route as a
  batch-of-1 with a `clientKey`** (gaining idempotent retry, losing nothing) and keeps its
  await-then-next-pair loop. A named follow-up (bead, not this epic set) can port client-side
  pair selection using the shared pure engine — `insertion-ranking.ts` is isomorphic and
  deterministic, so the client can run `placeItem` locally against a round-start snapshot —
  if compare latency still hurts after Epic P removes the per-decision `router.refresh()`.
- The single-decision route remains (compat); round UIs stop using it.

**Accepted trade-offs (named):** server-rendered Standing lags live taps by ≤ the flush
window — closed for the surfaces that matter by D7's await-pending gate; a hard device loss
can drop at most the unflushed tail (≤5 decisions / ≤4 s); on a shared device another user of
the same browser profile could *read* pending entries (itemIds + yes/no — low sensitivity,
same class as any client cache; review SEC-B3 residue), retained at most Epic P's storage GC
TTL (30 days — erratum F18).

### D7 — Pause / crash / sudden shutdown

- **Durability ladder:** tap → localStorage (synchronous, same tick) → batched flush (≤4 s) →
  `decision_events` (durable). Each rung replays idempotently onto the next via `clientKey`.
- **Recovery mechanism (named per review finding ARCH-3 — the SSR collision):** round/hub/
  Standing pages keep fetching data in Server Components. A thin client boundary
  (`PendingDecisionsGate`) mounts on every sort/results surface: if a pending queue exists for
  the **current curator**, it flushes first, then `router.refresh()`, and only then reveals
  the surface (a quiet "catching up…" beat, no spinner theater). No pending queue (the normal
  case) → zero cost, no gate. This keeps data fetching server-side (Next.js opinion #3) while
  guaranteeing the queue lands before any round queue, recommendation, or Standing view is
  computed from stale events — and it closes the "I just answered and Standing doesn't show
  it" gap (review finding UX-6). Mechanism pinned in Epic P §3.4 (errata F7/F8): reveal =
  conditional mount after the refresh transition settles, time-bounded (~5 s, then
  availability wins with a quiet catch-up line); the pause pre-flush is best-effort and
  non-blocking — stepping away is never gated on the network.
- **Pause** is already durable (status `paused` holds the slot; decisions accepted while
  paused). "Take a break" gains a pre-flush.
- **Round/timer state is deliberately ephemeral** (parent spec: a round is a time-box, not a
  table). A crash mid-round ends the round; undecided items resurface naturally because no
  event exists for them. Returning after a crash looks identical to returning after a break —
  which is also the TONE-correct behavior.
- **Multi-device:** queues are device-local; the event log merges by latest-wins under the
  advisory lock. A stale device flushing old decisions can resurrect a superseded answer only
  if its events insert later — same semantics as today's re-triage; accepted, and **pinned by
  a test** so a future refactor changes it consciously (review finding QA-8).

## 3. Epic decomposition (foundation-first, each independently shippable)

Each epic gets its own spec → adversarial review → plan → execute cycle. (Rev 2 collapses
rev 1's four epics to three: the projection-table reversal in D3 dissolved most of "Epic U";
its remnant — event type + fold + recompute-skip — ships as Epic R's dark-launch first PR.)

- **Epic P — Batched decision pipeline.** D6 + D7 for the *existing* flows: batch endpoint
  (validation semantics, ordering mechanism, bounds), shared tie-break comparator, client
  queue + optimistic advance for triage (decisions **and** dispositions), compare via
  batch-of-1, `PendingDecisionsGate`, flush triggers incl. flush-then-complete, failure
  taxonomy, undo-as-revisit. First: it fixes the felt slowness of everything already shipped
  and is the foundation the usage round's pacing requires.
- **Epic R — Usage round, end to end.** PR 1 (dark): `usage` event type in the Zod union,
  `deriveUsage` fold, recompute-skip, latest-wins/isolation tests. PR 2: the round UI
  (D2 — Relaxed/Quick, pass/re-queue, termination, a11y floor, first-use education, TONE'd
  copy), round-length clamp + "No timer" preservation, hub wiring (D5 ladder + anti-nagging
  demotion).
- **Epic S — Standing, reconciliation & re-rank by hand.** D4: two-axis `deriveStanding`,
  usage-only view, "Loved, and resting" lens, `sort_result_items.usage` snapshot + revision
  semantics; **the manual re-rank UI** (user point 11): a "Put in order by hand"
  drag-to-reorder surface on the draft result (drag is explicitly sanctioned by PRODUCT for
  reordering) wired to the existing PATCH/reset endpoints — optimistic per-drop writes, no
  batch machinery needed at that frequency.

Dependencies: P is independent. R needs P (pacing) — its dark PR 1 can land in parallel.
S needs R's PR 1; best after R has produced data.

## 4. Testing floor (per CLAUDE.md override — YAGNI never applies to tests)

Expanded per the QA persona's gap audit; obligations are grouped by what runs where. **Tier
honesty (review finding QA-4):** jsdom can only prove keepalive/pagehide *wiring*; the
browser-delivery claim is a named Playwright obligation, which makes **`purses-yuw` (e2e as a
required CI check) a dependency of Epic P** — the crash-recovery story is not "tested" until
that tier gates merges. Until then the keepalive test is wiring-only and the residual risk is
named in Epic P's PR.

- **Epic P — server (DB-backed, `RUN_DB_TESTS=1`):** batch of k events → exactly one
  recompute; in-batch same-item conflict resolves to the later array entry (shared-timestamp +
  monotonic-id mechanism); partial-duplicate retry neither errors nor double-folds; shape-
  invalid → 400 writes nothing; foreign/deleted itemId → that entry `rejected`, others
  written (and: the disposition-clear runs only for triaged itemIds in a mixed batch; usage
  entries never clear dispositions); >50 entries rejected; oversized ids/body rejected;
  concurrent batches serialize under the advisory lock; 409 gate on the new route; clientKey
  scope pinned (same key, different session/curator → both insert); the un-mocked
  route→service→repo→DB seam test exercises **the batch route itself**. Mixed usage+triage
  batch: full recompute exactly once *and* usage derivable (QA-9). Usage-only batch skips the
  replay — asserted via the recompute-count observable, not a mock spy (QA-14), plus the
  `seed-load` benchmark for the latency claim.
- **Epic P — client (vitest/jsdom):** persist-before-advance; ack removes exactly the acked
  keys; **all five flush triggers** (5-pending, 4 s, round end, pause-before-PATCH,
  flush-then-complete) under fake timers; single-flight (a timer firing mid-flight does not
  start a second flush); >50 pending chunks sequentially in order; rehydrated queue flushes in
  stored order; failure taxonomy (5xx retries; 400 quarantines the invalid entry and flushes
  the rest; 401/403/409 per D6 — 403 never deletes; recovery-409 discards once); undo-queued
  removes from queue only; undo-in-flight blocked until ack; curator-keyed storage (curator
  B's mount leaves A's queue untouched). **Playwright (gated on purses-yuw):** pagehide
  delivery; crash-reload → decisions land before the round queue renders
  (`PendingDecisionsGate` ordering).
- **Epic R:** `recommendNextRound` ladder — all four branches + the anti-nagging demotion
  (QA-1: the hub's core routing was previously untested by this spec); usage-queue inclusion
  branches (untriaged in, disposed out, usage-known out); Quick auto-advance re-queues at the
  tail (fake timers) **and pass-tap does the same**; at-most-twice → all-pass round
  terminates; tap racing auto-advance resolves to the tap; auto-advance suspends while focus
  is in the decision controls; focus lands on the new item's heading; `aria-live` announces;
  reduced-motion suppresses animation while the advance fires; Relaxed default; mid-round
  pace toggle; first-Quick education copy shown before first advance; round-length choices
  clamp to 30 s–5 m, **default is the 2 m timed box**, "No timer" offered as a visible
  first-class choice and switchable mid-round, stale stored `10`/`20` clamp on read while a
  stored `"none"` stays valid; no counts/denominators/urgency copy in `roundCopy` (assert the
  strings); round-expiry vs queue-empty both terminate.
- **Epic R (dark PR):** latest-wins per item via the shared comparator; usage never touches
  `score`/`orderRank` (recompute output identical with and without usage events); per-curator
  isolation; usage event for a disposed item accepted and excluded from Standing.
- **Epic S:** Standing correct for triage-only / usage-only / both; undecided items absent
  *and* the non-counting line renders (fixtures must include undecided items); "Loved, and
  resting" lens = exact intersection; finalize snapshots usage (later usage edits don't
  mutate a finalized result); revision clones source annotations (D4 semantics pinned);
  Finalize not offered for usage-only collections; `sort_result_items.usage` migration;
  cross-device stale-flush semantics pinned (QA-8); manual re-rank: drag reorder persists via
  PATCH, reset restores computed order, manual overlay survives into the finalize snapshot
  (parent Epic 5's promise, now testable because the UI exists).

## 5. Out of scope

Client-side compare pair selection (named follow-up bead; see D6); an `item_usage`
materialized projection (only if a real query plan demands it — follow-up bead);
revisit-usage flows (re-asking known items); usage history/trends (one latest fact — anything
more is inventory-tracker territory); any blended love×use score (rejected, D1); a tombstone/
clear event type (undo is revisit, D6); offline-first beyond the localStorage queue; voice;
multi-curator usage reveal semantics.

## 6. Pre-existing issues surfaced by review (filed as beads, not this spec's scope)

- **Recompute can resurrect purged items** (DATA-3): decision events survive item purge, and
  `computePreferences` doesn't filter to live items — a recompute after purge may recreate
  preference rows for purged items. Latent today; needs investigation + regression test.
- **Single decisions route never validates itemId ∈ collection** (SEC-B1): the batch route
  closes this for itself; the single route inherits it until fixed (same one-query check).
- **`decision_events` grows unboundedly** (DATA-6): fine at realistic scale (statement
  timeout 25 s, benchmark exists); a compaction/archival story is a someday-bead, named so
  growth is a conscious assumption.
- **Timestamp precision:** `timestamptz` for new datetime columns per the `photos` precedent
  (DATA nit) — Epic S's migration follows it.

## 7. Open questions for the user

1. ~~"No timer" as default?~~ **Resolved 2026-07-06:** a timer is the default (2 m proposed);
   "No timer" stays a clear, first-class option. Folded into D2 and §1.12.
2. Final copy: "Do you use this?" / "Yes, I use it" / "Not these days" / "Skip for now" /
   "In your life" / "Resting" / "Loved, and resting" — all TONE-review items in Epic R/S.
3. Quick beat default (5 s), default round length (2 m), and flush thresholds (5 pending /
   4 s / 50 per batch) — tune with the Epic P benchmark and on-device feel.
