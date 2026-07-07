# Design: Epic R — Usage round, end to end (mechanism spec)

- **Date:** 2026-07-07
- **Rev:** 2
- **Status:** Adversarially reviewed (4 personas, 18 confirmed findings folded) — open items
  in §7 user-confirmed 2026-07-07; proceeding to writing-plans
- **Bead:** `purses-sisy` (parent epic `purses-9v1f`)
- **Parent spec (rules fixed there, mechanisms here):**
  [`2026-07-06-usage-round-and-sort-unification-design.md`](2026-07-06-usage-round-and-sort-unification-design.md)
  §1.8/9/12, §D2 (round mechanics, pacing, a11y floor, timer default), §D3 (usage events,
  derived at read time), §D5 (hub ladder + anti-nagging), §4 (test obligations).
  Authorities: `PRODUCT.md`, `TONE.md`, `DESIGN.md` (first-order, unchanged).
- **Sibling precedent:** [`2026-07-06-epicP-batched-decisions-design.md`](2026-07-06-epicP-batched-decisions-design.md)
  — Epic P is **shipped** (PR #307); every mechanism below is pinned against the shipped
  code, not the Epic P plan.

## 1. Scope

The "Do you use this?" round, end to end, in **two PRs** (parent §3):

- **PR 1 (dark backend):** the `usage` event type in the domain types, the shared batch
  schema, and the single-route schema; the recompute-skip predicate; the `deriveUsage`
  pure fold; the cross-session curator decision-log read. No UI writes usage; nothing
  user-visible changes.
- **PR 2 (round UI):** the usage round page + client component (Relaxed/Quick pacing,
  at-most-twice pass cycling, a11y floor, first-Quick education), the round-length change
  (30 s–5 m, default 2 m, "No timer" first-class, mid-round switch), hub wiring
  (`recommendNextRound` ladder + device-local anti-nagging demotion, round chooser card),
  recap extension.

Out of scope (parent §5 + §3): Standing/reconciliation and the `sort_result_items.usage`
snapshot (Epic S); a materialized `item_usage` table; revisit-usage flows (re-asking known
items); usage history; any blended love×use score; tombstone/clear events.

No schema migration in either PR: `decision_events.type` is `text` and `decision` is
`jsonb` (`src/lib/db/schema.ts:218-236`), so `usage` is purely additive.

## 2. PR 1 — Dark backend

### 2.1 Domain types

`src/types/domain.ts:114-131`:

- `DecisionType` gains `"usage"`.
- New `UsageDecision { itemId: string; result: "uses" | "not_uses" }` (parent D3's payload,
  verbatim).
- `DecisionEvent.decision` union gains `UsageDecision`.

A **pass writes nothing** — there is no pass/skip member in the result enum, deliberately:
absence of an event *is* "undecided" (parent D2), so the type system cannot express a
counted non-answer.

### 2.2 Shared batch schema — `src/lib/decision-batch-schema.ts`

`BatchEntrySchema` (L17-35) gains a third discriminated-union variant, reusing the existing
`ItemId` / `ClientKey` validators unchanged:

```ts
z.object({
  type: z.literal("usage"),
  decision: z.object({ itemId: ItemId, result: z.enum(["uses", "not_uses"]) }),
  clientKey: ClientKey,
}),
```

Everything downstream is already type-agnostic: the flusher pre-validates each entry with
this exact schema (`decisionFlusher.ts:226-233`) and batches all `kind: "decision"` entries
in contiguous runs (`decisionFlusher.ts:214-219`), so once the schema knows `usage` the
pipeline carries it with **zero flusher changes**.

**Deploy-order constraint (named):** a client that enqueues usage entries against a server
without this variant gets a whole-batch 400 → the flusher quarantines the chunk
(`decisionFlusher.ts:296-303`) and those answers are lost-to-resurface. That is exactly why
the schema lands in PR 1, dark, and PR 2 (the only writer) ships strictly after PR 1 is
deployed.

### 2.3 Single route — `src/app/api/sessions/[id]/decisions/route.ts`

`DecisionRequestSchema` (L27-52) gains:

```ts
z.object({
  type: z.literal("usage"),
  decision: z.object({ itemId: z.string().min(1), result: z.enum(["uses", "not_uses"]) }),
}),
```

(`min(1)` matches the route's existing laxness for the other variants; the inherited
missing item-∈-collection check stays `purses-stln`'s, not this epic's.)

**Why the single route must accept usage at all** (decided from code, not just parent D3's
"same log"): the shipped quota fallback degrades to this route. `TriageRound.tsx:161-179`
POSTs a single decision when localStorage is unusable (`needs_fallback`), and the usage
round reuses that mechanism (§3.6) — so the single route is a real, rare usage write path,
not merely compat.

**What it does with a usage event:**

- **Accepted** into the same transaction shape: advisory lock → clientKey idempotency read
  → insert (`generateId("event")`) — unchanged (L107-148).
- **Recompute skipped:** L150 becomes conditional —
  `if (body.type !== "usage") await PreferenceController…recalculatePreferences(…)`.
  Rationale from code: `ScoringService.computePreferences` ignores unknown types (both
  passes filter on `"triage"` / `"pairwise_compare"`, `ScoringService.ts:93-106`), so the
  recompute *output* would be identical — but `PreferenceStateService.recalculatePreferences`
  still clears every orderRank and bulk-upserts the whole preference set
  (`PreferenceStateService.ts:52-64`). For a usage event that is pure waste inside the
  advisory lock; skip the call entirely (parent D3's recompute-skip, applied to both
  routes).
- **Dispositions never cleared:** the clear is already conditioned
  `if (body.type === "triage")` (L154-156) — usage bypasses it by construction; a test pins
  it so a refactor can't regress it silently.
- Analytics: the existing `sort_decision_recorded` capture (L166-181) carries
  `decision_type` — `"usage"` flows through with no change.

### 2.4 Batch route — recompute-skip predicate composition

`src/app/api/sessions/[id]/decisions/batch/route.ts`:

- **Semantic validation:** `referencesUnknownItem` (L31-36) gains the usage arm — same
  check as triage: `!liveItemIds.has(entry.decision.itemId)`. Note `liveItemIds` is
  non-deleted items (L115-124); **disposed items are live rows**, so a usage event for a
  now-disposed item (cross-device race) is *accepted* — parent D3/QA-7 satisfied with no
  extra code, pinned by test.
- **Predicate:** the shipped route recomputes iff `insertedCount > 0` (L188, L196 — Epic P
  §2.3.6, whose parenthetical anticipated exactly this extension). PR 1 splits the counter:
  keep `insertedCount` for the 201/200 status (L230) and add **`insertedScoringCount`**,
  incremented only for inserted entries with `entry.type !== "usage"`. The recompute
  **and** the disposition-clear block (L196-207) run iff `insertedScoringCount > 0`.
  Composition with the shipped "only if inserted" rule:
  - usage-only batch → inserts happen, `insertedScoringCount === 0` → **no replay, no
    preference rewrite, no bringBack** — the transaction is just the lock + inserts.
  - mixed usage + triage/compare batch → exactly **one** recompute (unchanged), and the
    disposition-clear still iterates only `insertedTriagedItemIds` (L149, L189 — populated
    only for `type === "triage"`), so usage entries can never clear a disposition (QA-9).
  - a batch whose triage entries are all `duplicate` but whose usage entries insert →
    `insertedScoringCount === 0` → no recompute. Correct: the duplicates already drove a
    recompute when first inserted; the usage inserts don't need one. (New edge this
    mechanism introduces; test-pinned.)
- Response semantics unchanged: 201 iff ≥1 entry of *any* type was created. Analytics
  counts (`created/duplicate/rejected`, L218-228) unchanged — no per-type breakdown (PII
  discipline; nothing consumes it).

### 2.5 `deriveUsage` — the pure fold

New file **`src/lib/derive-usage.ts`** (parent D3 pins `src/lib/`; sibling shape:
`deriveStanding`, `src/features/results/standing.ts:14`):

```ts
import { compareByCreatedAtThenId } from "@/lib/decision-order";
import type { DecisionEvent, UsageDecision } from "@/types";

export type UsageAnswer = "uses" | "not_uses";

export function deriveUsage(
  events: readonly DecisionEvent[],
  liveItemIds: ReadonlySet<string>,
): Map<string, UsageAnswer>;
```

Mechanics: filter to `type === "usage"`; sort ascending with
`compareByCreatedAtThenId` (`src/lib/decision-order.ts:11` — the **one shared comparator**,
same latest-wins regime `ScoringService.ts:90` already uses, parent ARCH-6); fold into a
`Map` so the last write per `itemId` wins; drop itemIds ∉ `liveItemIds` (purged/deleted
items fall out naturally, mirroring standing's drop of items missing from its lookup).
Pure — no DB, no React. Consumers in this epic: `selectUsageQueue` (via the round page)
and `recommendNextRound`; Epic S adds Standing.

### 2.6 Cross-session read — `DecisionController.listForCurator`

Usage is a per-curator, whole-log fact (D3 latest-wins; D7 multi-device merge): an item
answered in session 1 must not be re-asked by session 2's queue. The hub and round pages
currently load only `listBySession` (`sort/[sessionNumber]/page.tsx:54`,
`triage/page.tsx:60`), so PR 1 adds
**`DecisionController.listForCurator(collectionId, curatorId): Promise<DecisionEvent[]>`**
(`src/server/api/decisions.ts`). PR 1 extracts the curator-log read into a shared helper
`loadCuratorDecisionEvents(sessionRepo: SessionRepository, decisionRepo: DecisionEventRepository, collectionId: string, curatorId: string): Promise<DecisionEvent[]>`
(new file, e.g. `src/server/services/decision-log.ts`), whose body is today's private
`PreferenceStateService.loadDecisionEvents` verbatim (`PreferenceStateService.ts:99-108`:
`sessionRepo.findByCollectionAndCurator` → `decisionRepo.findBySession` per session, in
parallel, flattened). `PreferenceStateService.loadDecisionEvents` becomes a one-line call
to it, and `DecisionController.listForCurator` calls it too — `DecisionController` gains a
`SessionRepository` dependency (constructor + `fromDb`, `src/server/api/decisions.ts:5-10`).
One definition of "the curator's decision log": the recompute and the round page provably
read the same log. Same event volume the recompute loads wholesale today — parent D3's
"already loaded on every recompute" cost argument, verified.

### 2.7 Usage never clears dispositions — pinned, not asserted

Where the clear lives today: single route `route.ts:154-156` (`type === "triage"` guard);
batch route L189 + L204-206 (`insertedTriagedItemIds`, triage-only by construction). Usage
bypasses both without new code; PR 1's tests (§5) make that an invariant a refactor must
consciously break.

## 3. PR 2 — Round UI + hub

### 3.1 Round length — `src/lib/round-preference.ts` (every round type)

Parent §1.8/§1.12/D2, verbatim rules; mechanisms:

```ts
export type RoundBox = 0.5 | 1 | 2 | 5 | "none";
export const DEFAULT_ROUND_BOX: RoundBox = 2; // named const, tunable (parent §1.12)
export const ROUND_BOX_OPTIONS: ReadonlyArray<{ value: RoundBox; label: string }> = [
  { value: 0.5, label: "30 seconds" },
  { value: 1, label: "1 minute" },
  { value: 2, label: "2 minutes" },
  { value: 5, label: "5 minutes" },
  { value: "none", label: "No timer" },
];
```

`ROUND_BOX_OPTIONS` is the **one home** for the option list: **both** `StartSessionForm`
and the new `RoundLengthChooser` render their selects from it (the module is
client-importable; the clamp/migration behavior below is unchanged).

- `getRoundBox()` **clamps on read**: `"none"` → `"none"` (stays valid); `0.5|1|2|5` →
  itself; stale `10`/`20` (the shipped choices) → `5`; anything else → `DEFAULT_ROUND_BOX`.
  `setRoundBox` keeps `String(value)` (`"0.5"` round-trips through `Number()`); key stays
  `pi-round-box` — the clamp **is** the migration, no key change.
- The module's "Default is none: calm, no-pressure" comment (L5-6) is rewritten to cite
  parent §1.12's deliberate supersession — the review's regression warning was answered,
  not ignored.
- Consumers multiply by `MINUTE_MS` (`TriageRound.tsx:112`, `RoundSurface.tsx:58`):
  `0.5 × 60_000 = 30 s` — no consumer change for the value itself.
- **`RoundTimer` sub-minute honesty:** `minutesLeft` rounds up (`RoundTimer.tsx:19-21`), so
  a 30 s box would read "About 1 minute left" for its whole life. When remaining < 60 s the
  label becomes **"Less than a minute left in this round"** (exported string; TONE item).
  Bar, ring a11y treatment, and expiry behavior unchanged (D2: no per-item countdown; the
  round ring stays the only time signal).
- **`StartSessionForm`** (`StartSessionForm.tsx:20, 80-85`): default state `"2"`; options
  become 30 seconds · 1 minute · 2 minutes · 5 minutes · **No timer** (rendered from
  `ROUND_BOX_OPTIONS`, same flat list — first-class, never buried). One quiet helper line
  under the control, **keyed to the selection**: *"A short round — it wraps up gently."*
  when a timed option is selected; *"Take all the time you like."* when **No timer** is
  selected (both person-side per parent D2; TONE items). Note: the POSTed
  `timebox` field has no server-side reader (no reference outside this component) — left
  as-is; cleanup bead, §7.4.
- **Mid-round switch** (parent D2: switchable "before and during a round"; §4 obligation):
  new **`RoundLengthChooser`** client component (`src/features/sorting/`), a compact
  select rendered beside the timer in the round header; on change it calls
  `setRoundBox(box)` **and** an `onChange(box)` prop so the mounted round updates its
  `boxMs` state live against the *unchanged* `startedAtRef`. Wired into `TriageRound`,
  `RoundSurface` (compare), and the new `UsageRound` — D2's rules apply to every round
  type. Semantics of a live change: `RoundTimer`'s effect re-arms on the `boxMs` prop
  change (`RoundTimer.tsx:54`); switching to `"none"` removes the countdown and expiry;
  switching to a box shorter than the already-elapsed time expires at the next tick and
  ends the round **gently into the recap** — consequence-free by the same D2 argument as
  natural expiry (named choice; test-pinned). The chooser is not rendered on the recap.

### 3.2 Server queue selection — `selectUsageQueue`

New **`src/lib/usage-selection.ts`**:

```ts
export function selectUsageQueue(
  items: Item[],
  usageByItemId: ReadonlyMap<string, UsageAnswer>,
  dispositionByItemId: Map<string, Disposition>,
): Item[];
```

Eligible (parent D2, verbatim): usage currently unknown (`!usageByItemId.has(item.id)`)
**and** not disposed — both `set_aside` **and** `deferred` excluded. Untriaged items are
included (usage is a primary sort, parent §1.2). Ordering: input order (the same
`listItems` ordering triage uses). Returns bare `Item[]` — no `deferred` flag, no banner:
the deliberate fork from `selectTriageQueue` (`triage-selection.ts:11-25`) is that a defer
is a *love-question* disposition ("Not yet"), and the usage round honors it by absence
(see §7.7 for the flagged asymmetry).

### 3.3 The usage round page — `src/app/collections/[id]/sort/[sessionNumber]/usage/page.tsx`

Mirrors `triage/page.tsx:24-127` exactly for the guard ladder (login redirect →
`requireCollectionAccess` → session-number integrity → `collectionId` integrity redirect →
curator-only redirect), `TakeABreakControl` in the layout actions, and the
`PendingDecisionsGate` wrap (same reason as `triage/page.tsx:96-99`: the round snapshots
the server queue into client state at mount; pending usage answers must land first or
answered items re-enter the queue). Differences:

- **Reads:** items · sortSession · dispositions · **one** decision-log read —
  `DecisionController.listForCurator(collection.id, userId)` (§2.6). The curator log is
  consumed **server-side only**: it feeds `deriveUsage` (queue) and the
  `usageByItemId.size` seed. The recap's server-log prop is an **empty
  `MovedDecision[]`**: `whatMoved` window-filters to the round start (`what-moved.ts:48`;
  window fixed at mount, `TriageRound.tsx:101`), and every curator-log event predates
  mount, so the curator log can never contribute a recap count — it is **never serialized
  into the RSC payload** (it would be pure hydration-payload weight on a table the parent
  spec names unbounded, DATA-6). No `listBySession` read on this page.
- **Queue:**
  `selectUsageQueue(items, deriveUsage(curatorEvents, new Set(items.map(i => i.id))), dispositionByItemId)`,
  then cover photos exactly as triage does (`PhotoController.findCoverPhotosByItemIds` →
  `getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card })`,
  `triage/page.tsx:62-75`).
- **Seed** for the answered-count cue: `usageByItemId.size` (the distinct usage-known
  count — triage's analogue of `preferences.length`, `triage/page.tsx:119`).
- **No `TriageUndoProvider`** — the usage round has no set-aside/defer affordances (D2:
  Yes / Not these days / Skip for now, nothing else).

### 3.4 `UsageRound` client component — what generalizes vs what forks

New `src/features/sorting/UsageRound.tsx`. `TriageRound` (shipped, 400 lines) is the
pattern source; with a second real consumer, the shared plumbing is extracted — DRY within
reason, pinned by TriageRound's existing test suite as the behavior-identical regression
net.

**Generalizes — extracted into `src/features/sorting/useOptimisticRound.ts`** (nominally
one hook, consumed by both rounds — see the shape caveat below):

1. Queue key memo + `useDecisionFlusher(key)` wiring (`TriageRound.tsx:71-75`).
2. **Persist-before-advance enqueue with quota fallback** (`TriageRound.tsx:149-198`):
   `enqueue(key, entry, () => triggerFlush(key))`; on `needs_fallback`, the awaited
   single-route submit (the usage payload is `{ type: "usage", decision, clientKey }` —
   accepted since PR 1, §2.3) and advance only on its ack; else `awaitAck` → outcome map.
   The stumble state + `STUMBLE_LINE` ride along.
3. Round tap log + frozen recap + end sequence (`TriageRound.tsx:88-143`): `roundLogRef`,
   `serverLogRef`, `initialQueueEmpty`, freeze-once at end, then
   `triggerFlush(key)` → exactly one `router.refresh()` (F15), empty-mount guard. The
   extracted hook accepts the server-log prop **as-is** — usage passes `[]` (§3.3), triage
   keeps its existing session-log behavior unchanged.
4. Undo-as-revisit state machine (`TriageRound.tsx:96-98, 204-226`): queued → remove +
   re-present fresh; in-flight/acked → standing answer shown (`priorAnswer` on
   `DecisionControls`, `DecisionControls.tsx:25`), next answer supersedes by latest-wins
   (holds for usage exactly as for triage — same event domain, same comparator); rejected
   → no-op.
5. Round clock: `startedAtRef` + `boxMs` from `getRoundBox()` in a mount effect + expiry
   state, now with the §3.1 `onBoxChange` hook.

**Hook contract (sketch, names illustrative):**
`useOptimisticRound({ key, ended, decisionType, fallbackBody(decision, clientKey), labelFor(itemId, result), toMoved(decision, enqueuedAt) })`
— each round injects its decision type (`"triage"`/`"usage"`), fallback POST body, label
resolver (`triageDecisions`/`usageDecisions`), and `MovedDecision` mapper; `ended` is
computed by each round from its **own** queue fork (entries+handled vs
entries+handled+passes) and passed in — the hook owns the freeze-once/flush/refresh
sequence, never the queue-state derivation.

**Shape caveat:** the single-hook shape is the default, not the invariant. If the seam
resists — e.g. the API degenerates into a wide config object or callback soup to carry the
per-round divergences (entry payload, fallback body, label/log-line construction) — the
extraction may land as fewer or smaller shared units instead (for example, the round clock
or enqueue-with-fallback as separate helpers). The binding requirements are: (a) both
rounds consume the same shared units, and (b) behavior identity, proven by
`TriageRound.test.tsx` passing unchanged.

**Stays in `TriageRound` (triage-only):** dispositions (defer/set-aside + the
disposition-vs-flushed-triage revisit rules), the "Ready when you are" deferred banner,
the "Set aside" link, `TriageUndoProvider` integration, triage labels.

**Forks — `UsageRound`-only:**

- **Queue state:** `entries: Array<{ item, heroPhotoUrl? }>` + `handled` set +
  `passes: Map<itemId, number>` (round-local, ephemeral — a crash forgets pass counts by
  design, parent D7).
- **Surface:** `RoundShell` (step 2 of the 4-step arc, §3.9; `roundLabel` pinned as
  **"This round"**, matching triage's shipped label — §4 copy item) + `RoundTimer` +
  `RoundLengthChooser` + `PendingNotices` (outside the content swap, as
  `TriageRound.tsx:291-296`); question `<h1 tabIndex={-1}>` renders
  **`ROUND_COPY.usage.name`** ("Do you use this?" — `roundCopy.ts` is server-safe per its
  own note, so the reference is free); `ItemCard` photo-dominant
  (`imageClassName="h-64"`); two decision buttons via `DecisionControls` with
  `submit={{ kind: "local", … }}` — `DecisionControlsProps.type` (`DecisionControls.tsx:17`)
  widens `"triage" | "pairwise_compare"` to include `"usage"` in this PR, and `UsageRound`
  passes `type="usage"` (never a reused `"triage"`): the prop is runtime-inert on the
  local path (no fetch), but on the session path it flows verbatim into the §2.3
  single-route body (`DecisionControls.tsx:51`), so the label must be truthful — and a new
  `usageDecisions(itemId)` in `roundCopy.ts` (mirrors `triageDecisions`,
  `roundCopy.ts:19-28`): **"Yes, I use it"** → `uses`, **"Not these days"** → `not_uses`;
  plus an always-visible **"Skip for now"** tertiary button (h-11, below a hairline —
  the demoted-escape slot triage uses at `TriageRound.tsx:374`), carrying
  `title="It'll come around again"` and
  `aria-label="Skip for now — it'll come around again"` (the `DeferControl.tsx:24-26`
  precedent: the escape's contract lives in its accessible name, restating parent D2 for
  users who never see the first-Quick education line; adjudicates §7.9).
- **Pass semantics + termination (parent D2, UX-5/QA-6):** `pass(item)` — from the Skip
  tap or the Quick beat — writes **nothing** (no event, no queue entry, no log line):
  `passes[id] += 1`; if the item has now been *presented* twice (`passes[id] >= 2`) it
  leaves the round queue (`handled`), staying usage-unknown for a future round; else it
  moves to the tail (the `handleDefer` reorder pattern, `TriageRound.tsx:256-260`).
  Termination is provable: each presentation strictly consumes one of ≤ 2n presentation
  slots, so an all-pass round ends at queue exhaustion or ring expiry, whichever first.
- **Answer handler:** closes over the shown item (the `handleTriage(target, …)` pattern,
  `TriageRound.tsx:149`) and marks **that item** handled wherever it sits — so an answer
  that races an auto-advance records against the item the person *saw*, even if the pass
  already moved it to the tail. That is the "tap racing auto-advance resolves to the tap"
  mechanism: the pass wrote nothing, so the answer simply lands and the item leaves the
  queue. Taps synchronously cancel the armed beat (`busyRef` + clearTimeout) before
  enqueueing.
- **Answered-count cue:** `seed (usageByItemId.size) + newlyAnswered.size`, ticks on the
  Yes/No tap only — never on a pass, never on the flush (the F20 pattern verbatim).

### 3.5 Quick pacing — mechanics of the D2 a11y floor

- **Preference module — `src/lib/usage-round-prefs.ts`** (one home for the three
  device-local facts; `round-preference.ts`'s `typeof window` + try/catch pattern):
  - `getUsagePace() / setUsagePace(p)`: `type UsagePace = "relaxed" | "quick"`, default
    `"relaxed"` (D2: Relaxed is the default, ever). Key **`adored.usagePace.v1`** —
    device-global ("persisted per device"), not per session.
  - `hasSeenQuickIntro() / markQuickIntroSeen()`: key **`adored.usageQuickIntro.v1`**.
  - `markUsageRoundRan(curatorId, sessionId) / hasUsageRoundRan(…)`: key
    **`adored.usageRoundRan.v1.{curatorId}.{sessionId}`**, value = completion ISO
    timestamp (§3.8).
- **The toggle:** a quiet control on the round surface (below the header, above the card —
  no pre-round chooser, review A5b), rendered as a button with `aria-pressed`, label
  **"Quick pace"**, ≥44 px. Toggling writes the pref and updates state; leaving Quick
  mid-round is the same toggle (UX-3). Read at mount in an effect (hydration-safe, the
  `getRoundBox` pattern).
- **The beat:** `export const QUICK_BEAT_MS = 5_000` (named const, parent §7.3 tunable).
  While pace is `quick`, the round is live (not ended, not revisiting), and the suspension
  conditions below don't hold, a `setTimeout(QUICK_BEAT_MS)` keyed to the current item is
  armed; on fire it calls `pass(current)`. **No per-item countdown is rendered** — the
  beat is felt, never watched (D2).
- **A11y floor, as mechanisms (parent D2 (a)-(e)):**
  - (a) **Suspend while focus is on any of the round surface's interactive chrome, not
    only the decision controls:** one `focusin`/`focusout` listener pair on the
    round-surface root clears/re-arms the beat whenever the focus target is an
    interactive element (decision controls, Skip, Back/undo, the Quick toggle, the
    `RoundLengthChooser`, `RoundShell`'s Pause). Re-arm restarts the **full** beat
    (restart, not resume — simpler and gentler; named choice). Rationale: the WCAG 2.2.1
    escape hatches this spec relies on (toggle, length chooser, "No timer", Pause) must
    be operable without the beat firing beneath them. This serves keyboard and
    screen-reader users alike; Quick + SR is served by suspension, not by hoping SR users
    stay on Relaxed (e).
  - (b) **Focus destination:** in Quick, every advance (auto-pass, Skip tap, answer) moves
    focus to the new item's question heading (`h1[tabIndex=-1].focus()`) — a defined
    destination (WCAG 2.4.3). Additionally: an auto-pass **never** moves focus when
    `document.activeElement` is an interactive element outside the card/heading region —
    focus is only moved from a position the advance itself made stale (belt-and-braces
    should (a)'s listener miss a target). In Relaxed, tap-advance keeps today's triage
    behavior (no focus move).
  - (c) **`aria-live`:** a visually-hidden `role="status"` region announces the new item
    on advance ("Now: {item name}"). Distinct from `RoundTimer`'s own live region.
  - (d) **Reduced motion:** the card swap uses CSS transitions with
    `motion-reduce:transition-none` (the house pattern, `TriageRound.tsx:342`) — no
    JS-gated animation, so reduced motion *cannot* suppress the advance callback by
    construction; the beat is a timeout, unaffected.
  - WCAG 2.2.1 stands on Relaxed-default + the mid-round toggle + §3.1's "No timer".
- **First-Quick education (UX-4):** on enabling Quick with `adored.usageQuickIntro.v1`
  unset: the line *"If you're not sure, it just comes around again."* renders as
  `role="status"` in the same commit as the toggle state change, and the first beat arms
  only after that commit — the contract is on screen (and announced) a full beat before
  anything moves. The line stays visible for the remainder of the round; the flag is set
  at enable, so later rounds skip it.

### 3.6 Enqueue path

Yes/No taps enqueue
`{ kind: "decision", clientKey: newClientKey(), type: "usage", decision: { itemId, result }, enqueuedAt }`
through the shipped `decisionQueue.enqueue` — `PendingEntry`'s decision `type` union
(`decisionQueue.ts:23`) gains `"usage"` in this PR (its only writer). The flusher, Web-Lock
sequencing, failure taxonomy, `PendingDecisionsGate` recovery, and GC all apply unchanged —
usage entries are ordinary decision entries. Flush triggers: the shipped 5-pending / 4 s /
pagehide (`useDecisionFlusher`) plus the round-end `triggerFlush` from the extracted end
sequence. A `rejected` (`unknown_item`) usage ack rides the existing `PendingNotices`
line; the optimistic-state staleness window and round-end reconcile are exactly Epic P
§3.2's.

### 3.7 Recap — `what-moved.ts` + `WhatMoved.tsx`

- `MovedDecision.type` union gains `"usage"`; its decision shape
  `{ itemId, result: "uses" | "not_uses" }` (`src/lib/what-moved.ts:12-18`).
- `WhatMovedSummary` gains `uses: number; resting: number`; `whatMoved` counts usage
  results into them and into `total`. Passes appear nowhere — no event, no round-log
  entry, so the recap can't count them even by accident.
- `WhatMoved.tsx` `lines()` adds, count-gated like the others: **"{n} in your life"** /
  **"{n} resting for now"** (TONE items; the group nouns anticipate Epic S's Standing
  groups). Triage/compare recaps are unaffected (zero counts render no line); the
  zero-total "gentle pass" line is reused as-is.
- `UsageRound` pushes a `MovedDecision` per Yes/No into the round log with the enqueue
  timestamp (the F5 client-clock rule), exactly as `TriageRound.tsx:186-191`.

### 3.8 Hub wiring — ladder, demotion, chooser entry

- **`roundCopy.ts`:** `ROUND_COPY.usage = { name: "Do you use this?", explainer: "One
  piece at a time — is it in your life these days?" }` (TONE item). The hub grid
  (`sort/[sessionNumber]/page.tsx:97-116`) gains the third card linking to
  `${collectionHref}/sort/${number}/usage`, between Triage and Compare (the D5 ladder
  order).
- **Hub naming decision (review adjudication, default option (a); §7.8):** the third card
  ("Do you use this?") would otherwise sit between the shipped noun-names "Triage" and
  "Compare" — a register clash. In the **same PR** as the hub card, rename
  `ROUND_COPY.triage.name` → **"Get acquainted"** and `ROUND_COPY.compare.name` →
  **"Which do you love more?"** (parent D5's person-side names; the `/welcome` walkthrough
  follows for free via the shared module, partially defusing §7.6). Both strings join the
  §4 copy inventory as TONE-review items and the §5 `roundCopy.test.ts` verbatim
  assertions; the hub PR screenshots are refreshed accordingly. *(Chosen over the
  alternative — keeping the sibling-noun register and giving usage a noun name — because
  the arc names are the parent's own person-side vocabulary; confirmed by user 2026-07-07 ("continue until all follow-ups are done")
  with the other §4 copy.)*
- **`recommendNextRound` (`src/lib/next-round.ts`)** — ladder extension (D5):
  - `NextRoundKind` gains `"usage"`; `NextRoundInput` gains
    `curatorDecisions: DecisionEvent[]` (the §2.6 cross-session log — the hub **swaps**
    its `listBySession` call (`page.tsx:54`) for one `DecisionController.listForCurator`
    read and derives the session-scoped `decisions` input for `selectNextPair`/analytics
    by filtering the curator log on `event.sessionId === sortSession.id` —
    `DecisionEvent` carries `sessionId`, and the hub's curator guard makes the curator
    log a strict superset of the session log, so the filtered subset is identical to
    today's `listBySession` result. **One decision read serves both consumers**, the same
    one-read pattern as §3.3. The session-scoped *input* to `selectNextPair` is unchanged
    — §7.3's pre-existing scoping quirk is preserved, not fixed, here).
  - Ladder: `selectTriageItem` hit → **triage**; else
    `selectUsageQueue(items, deriveUsage(curatorDecisions, liveIds), dispositions)`
    non-empty → **usage**; else `selectNextPair` hit → **compare**; else **decide**.
    Reuses the very selectors the rounds use — recommendation and round agree by
    construction (the shipped F6 principle).
  - **Return type changes** to support device-local demotion the server cannot see:
    `recommendNextRound(input): { primary: NextRound; whenUsageDemoted?: NextRound }`.
    `whenUsageDemoted` is present iff `primary.kind === "usage"`, computed by re-running
    the ladder as triage → **compare → decide** — usage is **never re-promoted** on a
    demoted device; the always-present usage chooser card on the hub grid (this section,
    first bullet) is the honored path back (parent D5's "quiet secondary entries"). This
    is an explicit narrowing of parent D5's "demoted below Compare, not removed" wording,
    adjudicated in adversarial review: re-recommending a twice-declined question once
    Compare exhausts is the nag D5's anti-nagging rule exists to prevent (TONE litmus:
    the quiet card waiting is the person's choice; the re-promoted slot is the machine's
    agenda). See §7.1 — confirmed by user 2026-07-07 ("continue until all follow-ups are done"). One caller (the hub) updates.
  - Usage copy for the card: label references **`ROUND_COPY.usage.name`** ("Do you use
    this?" — one home, §3.4), description *"An easy pass — just whether each piece is in
    your life right now."*, cta **"Begin"** (description and cta remain the card's own
    copy, matching the shipped triage/compare precedent of distinct card descriptions;
    TONE items; non-numeric, per the module's contract).
- **Anti-nagging demotion (D5), device-local:** the storage fact is
  **`adored.usageRoundRan.v1.{curatorId}.{sessionId}` = completion ISO timestamp**,
  written by the round's end sequence **only when the round ends without engagement** —
  (a) always on **queue exhaustion** (every remaining item was passed twice: the D5
  "asked, declined" case), and (b) on **timer expiry only if the round recorded zero
  Yes/No answers** (round-local `newlyAnswered.size === 0`, the §3.4 answered-count state
  the end sequence already holds). An expired round with ≥ 1 answer writes **nothing**:
  the still-non-empty server queue keeps usage as primary, which is correct for a person
  who was actively answering — with the default 2 m box (§3.1), expiry alone must not be
  read as "not now". Never written on Pause/navigation away (an abandoned round is not an
  implicit "not now"). Curator-scoped key: a shared browser profile never demotes on
  another curator's flag (the ARCH-7 isolation posture). Semantics: presence ⇒ this device
  shows `whenUsageDemoted` instead of a usage `primary` for that session, indefinitely
  (no expiry — the session is the scope, parent D5). Keys accumulate one tiny string per
  (curator, session); accepted residue, named (they are not under the pending/quarantine
  GC prefixes).
- **Applying it:** the presentational `RecommendedRoundCard` stays server-rendered; a new
  thin client wrapper **`RecommendedRound`** (`src/features/sessions/`) receives
  `{ primary: { round, href }, whenUsageDemoted?: { round, href }, curatorId, sessionId }`,
  renders `primary` on the server/first paint, and after mount swaps to
  `whenUsageDemoted` if `hasUsageRoundRan(curatorId, sessionId)` — the same
  read-device-state-after-hydration pattern as `getRoundBox` in rounds. On a demoted hub
  the `primary` (usage) card is visible and its link **live** from server paint until the
  client bundle hydrates and the mount effect commits — an unbounded window on a slow
  tablet, during which a tap re-enters the usage round D5 demotes. Alternative
  considered: render a neutral placeholder until the mount read resolves (the
  `getRoundBox` null-`boxMs` pattern, `RoundTimer.tsx:57`). Rejected: a neutral flash
  would hit every hub load for the never-demoted majority, while the wrong-card window
  only affects a device that already completed a usage round; accepted as a named
  trade-off (§7.2). The swap renders with **no transition or animation** — a plain
  same-slot re-render of `RecommendedRoundCard` with the demoted round's props — and must
  cause **zero layout shift**: both rounds' cards share the `RecommendedRoundCard`
  footprint (the card reserves enough height that primary and demoted copy render at the
  same size at hub widths), so a demoted hub never visibly reflows on load. The hub
  computes both hrefs (usage → `/usage`, compare → `/compare`, etc.).

### 3.9 The 4-step round arc

`RoundShell` renders a fixed step indicator (`step: 1 | 2 | 3`, `totalSteps`;
`RoundShell.tsx:5-16`), with triage = 1 and compare = 2 of 3 today. D5's arc is now
Get acquainted → Do you use this? → Which do you love more? → Decide, so:
`RoundShell.step` widens to `1 | 2 | 3 | 4`; all call sites pass `totalSteps={4}`;
triage stays 1, **usage = 2**, compare moves 2 → 3 (`RoundSurface` call site on the
compare page). This touches shipped triage/compare chrome — flagged for review (§7.5) and
covered by the RoundShell tests + refreshed PR screenshots.

## 4. Copy inventory (all TONE-review items; proposals, person-side)

| Slot | Proposed string |
|---|---|
| Round question (h1) | renders `ROUND_COPY.usage.name` — "Do you use this?" (parent §7.2 candidate; one home, §3.4) |
| Yes button | "Yes, I use it" (parent candidate) |
| No button | "Not these days" (parent candidate) |
| Pass button | "Skip for now" (parent candidate) |
| Pass button aria-label | "Skip for now — it'll come around again" (title: "It'll come around again") |
| `ROUND_COPY.usage` | name "Do you use this?" · explainer "One piece at a time — is it in your life these days?" |
| `ROUND_COPY.triage.name` (rename, §3.8) | "Get acquainted" (was "Triage"; parent D5 arc name) |
| `ROUND_COPY.compare.name` (rename, §3.8) | "Which do you love more?" (was "Compare"; parent D5 arc name) |
| `RoundShell` `roundLabel` (usage) | "This round" (matches triage's shipped label) |
| Recommended card (usage) | label references `ROUND_COPY.usage.name` · description "An easy pass — just whether each piece is in your life right now." · cta "Begin" (description/cta are the card's own copy, per the shipped triage/compare precedent) |
| Quick toggle | "Quick pace" (aria-pressed switch) |
| First-Quick education | "If you're not sure, it just comes around again." (parent-fixed, verbatim) |
| Answered-count cue | "{n} answered so far" |
| Recap lines | "{n} in your life" · "{n} resting for now" |
| Round-length options | "30 seconds" · "1 minute" · "2 minutes" · "5 minutes" · "No timer" — strings live **only** in `ROUND_BOX_OPTIONS` (§3.1) |
| Length helper line | timed: "A short round — it wraps up gently." · no timer: "Take all the time you like." |
| RoundTimer sub-minute | "Less than a minute left in this round" |

Register rules carried from D2: no game/challenge/race framing; no urgency copy; no counts
of what *remains* anywhere ("answered so far" affirms what's done, ceiling-free — the F20
precedent); pass and second-pass are silent. `roundCopy` string assertions (§5) enforce
the no-denominator rule mechanically.

## 5. Testing floor

Parent §4's "Epic R" and "Epic R (dark PR)" lists are the base obligations; every bullet
is mapped below, plus the obligations this spec's mechanisms introduce (house rule: YAGNI
never applies to tests; DB tests behind `RUN_DB_TESTS=1`, serial, in `src/lib/db/`).

**PR 1 — server (DB-backed, `RUN_DB_TESTS=1`; extend
`src/lib/db/decision-batch.integration.test.ts` + a new `usage-events.integration.test.ts`):**

- Usage-only batch → entries `created`, **zero recomputes** (the same recompute-count
  observable the batch suite already uses — never a mock spy, QA-14) and **zero**
  `bringBack` effects (no disposition rows change).
- Mixed usage+triage batch → exactly **one** recompute, disposition-clear only for the
  triaged itemIds, and usage derivable afterwards via `deriveUsage` over the session's
  events (QA-9).
- Triage-all-duplicate + usage-created batch → 201, zero recomputes (§2.4's new edge).
- **Recompute-output invariance:** seed triage events, recompute, snapshot `preferences`
  rows; add usage events; force a recompute (via one more triage event); assert
  score/orderRank identical to the same run without the usage events (parent: usage never
  touches score/orderRank).
- Usage event for a **disposed** (live) item → `created` (accepted, D3/QA-7); usage entry
  with an unknown/foreign/deleted itemId → per-entry `rejected`, others written.
  *Deferred half of this parent bullet: "excluded from Standing" cannot be tested until
  Epic S integrates usage into `deriveStanding` — it moves to Epic S's test floor
  (Standing excludes a disposed item's usage answer from "In your life"), not dropped.*
- Latest-wins per item **via the shared comparator**: two usage events for one item in one
  batch (shared `createdAt`) resolve to the later array entry by monotonic id; cross-batch
  (separate transactions) resolve by `createdAt` — asserted through `deriveUsage`.
- Per-curator isolation: two curators, usage events each; `listForCurator` returns only
  the caller's; `deriveUsage` over curator A's log never contains B's items. Cross-session:
  a usage event in session 1 appears in `listForCurator` and removes the item from a
  session-2 `selectUsageQueue`.
- Single route: usage → 201, event row, **zero recomputes** (observable), no disposition
  cleared for a disposed-then-usage-answered item; idempotent replay via clientKey → 200;
  malformed usage shape → 400 writes nothing.
- Schema (`decision-batch-schema.test.ts`, vitest): usage variant accepts a real
  `generateId("item")` id end-to-end and rejects a bare 26-char ULID (the F1 drift guard,
  extended); rejects out-of-enum results.
- `deriveUsage` unit table (`src/lib/derive-usage.test.ts`): empty log; latest-wins;
  equal-`createdAt` id tie-break; non-usage events ignored; non-live itemIds dropped.

**PR 2 — client (vitest/jsdom, fake timers), mapping parent §4 Epic R line by line:**

- `recommendNextRound` **all four branches** (`next-round.test.ts`): untriaged → triage;
  usage-unknown → usage (+ `whenUsageDemoted` present); usage-known + pair → compare;
  none → decide. Demoted ladder: pair remaining → compare; no pair → **decide** (usage
  never re-promoted when demoted, §3.8). **Anti-nagging application**
  (`RecommendedRound.test.tsx`): flag set → demoted card after mount; unset → primary;
  a different curator's/session's flag → primary (isolation); the swap is a **same-slot
  content change** — the demoted card replaces the primary's content inside the same
  rendered card container, and the swap container carries no transition/animation
  classes (§3.8). `markUsageRoundRan` pins three cases (§3.8): queue exhaustion → flag;
  expiry with zero answers → flag; expiry with ≥ 1 answer → **no flag**, usage stays
  primary; never on pause/unmount.
- `selectUsageQueue` inclusion branches (`usage-selection.test.ts`): untriaged **in**;
  `set_aside` **out**; `deferred` **out**; usage-known **out**; input order preserved;
  empty input.
- `UsageRound.test.tsx` (fake timers): Quick auto-advance re-queues at the tail **and**
  pass-tap does the same; at-most-twice → an all-pass round terminates into the recap
  (≤ 2n presentations); tap racing auto-advance resolves to the tap (item ends answered,
  not passed; no double-advance); auto-advance suspends while focus is on the
  `RoundLengthChooser`, the Quick pace toggle, Back, and Pause (not only inside the
  decision controls), re-arming the full beat on focusout; an auto-pass forced to fire
  with focus on such chrome does **not** move focus to the heading; focus lands on the
  new item's heading in Quick; the `role="status"` region announces the new item; reduced-motion (mocked
  matchMedia) leaves the advance firing and the swap container carries
  `motion-reduce:transition-none`; **Relaxed default** (no beat without the toggle);
  mid-round toggle off cancels the armed beat; first-Quick education line renders before
  any advance when the flag is unset, is absent when set, and the flag persists;
  round-expiry vs queue-exhaustion both terminate into the recap; a pass writes **nothing**
  (no enqueue, no round-log entry, recap counts unchanged); persist-before-advance +
  quota fallback posts `type: "usage"` to the single route and advances only on its ack;
  answered-count ticks on Yes/No only, never on a pass, decrements on queued undo;
  undo-as-revisit: queued → removed + re-presented fresh; in-flight/acked → standing
  answer shown via `priorAnswer`, next answer supersedes; zero mid-round
  `router.refresh()`, exactly one at round end.
- **Usage page payload scoping** (page-level test): the `UsageRound` server-log/decisions
  prop is an empty `MovedDecision[]` — a seeded prior-session or prior-visit event (usage
  or pairwise) never appears in the component's props (payload-scoping regression pin,
  §3.3).
- **TriageRound regression net:** the `useOptimisticRound` extraction ships with
  `TriageRound.test.tsx` passing **unchanged** — the gate proving every tested behavior
  is preserved; behaviors the suite doesn't pin (e.g. `outcomesRef` timing between
  `awaitAck` resolution and `goBack`) get a targeted look in the refactor review.
- Round length (`round-preference.test.ts` + component tests): clamp table — stored
  `10`/`20` → 5; stored `"none"` stays `"none"`; stored `0.5|1|2|5` stay; garbage →
  default **2**; `DEFAULT_ROUND_BOX === 2`. The option labels/values are asserted **once**
  against `ROUND_BOX_OPTIONS` in `round-preference.test.ts`; the per-component tests
  assert each chooser renders the shared list (e.g. by importing the constant), not
  re-pinned verbatim strings. `RoundLengthChooser`: renders "No timer" as a visible peer
  of the timed options; mid-round switch to `"none"` removes the countdown; switch to
  shorter-than-elapsed ends the round gently into the recap; the choice persists via
  `setRoundBox`. `StartSessionForm`: default "2", the five options present; the helper
  line shows the timed string for a timed selection and swaps to the no-timer string when
  "No timer" is selected (§3.1). `RoundTimer`: sub-minute label at < 60 s remaining; 30 s
  box never shows "About 1 minute".
- `roundCopy.test.ts`: `ROUND_COPY.usage` + `usageDecisions` strings asserted verbatim,
  plus the renamed `ROUND_COPY.triage.name` ("Get acquainted") and
  `ROUND_COPY.compare.name` ("Which do you love more?") (§3.8); the usage round name is
  asserted **once** in `ROUND_COPY.usage` plus identity (`===`) from the two consuming
  slots (the h1 and the recommended-card label, §3.4/§3.8); the pass button's accessible
  name is asserted as "Skip for now — it'll come around again" (WCAG 2.5.3: name begins
  with the visible label; UsageRound test); no digits/denominators/urgency terms in the
  usage round copy (the parent's assert-the-strings obligation).
- `what-moved.test.ts` + `WhatMoved.test.tsx`: usage results counted into
  `uses`/`resting`/`total`; recap lines render count-gated; triage-only input renders no
  usage lines; zero-total keeps the "gentle pass" line.
- Flusher (`decisionFlusher.test.ts` extension): a queue of
  `[usage, triage, set_aside, usage]` drains as batch(2) → disposition → batch(1), order
  preserved — usage entries join contiguous decision runs.
- `RoundShell.test.tsx`: the 4-step arc (step type widened; compare call site at 3).
- **Playwright (CI `e2e` job):** one usage-round smoke — from the hub's usage card,
  answer two items, Skip one, recap shows the two answers. This is the un-mocked
  full-stack crossing for the new surface; the DB batch tests cover the
  route→service→repo→DB seam. **The smoke's reload half stays out of PR 2** (honest
  scoping, chosen in review — option (b)): the crash-reload harness does **not** exist —
  Epic P deferred its Playwright tier (noted in `purses-5mxt`, gated on `purses-yuw`),
  and it is now tracked as its own prerequisite bead **`purses-hmjs`** (Epic P
  crash-reload + pagehide e2e). The usage-round reload assertion (reload lands the events
  before the round re-renders — the gate ordering) is added when that bead lands. Named
  as the fifth Epic-P-forced adjustment in §6.

**Screenshots:** PR 2 is user-visible UI → light + dark screenshots in the PR body
(house rule), including the hub's third card and the usage round in both paces.

## 6. Rollout — two PRs (parent §3), with Epic-P-forced adjustments

- **PR 1 (dark):** §2 whole — types, both schemas, batch predicate, single-route usage
  handling, `deriveUsage`, `listForCurator` — plus its test floor. Deployable alone;
  nothing user-visible; reverting it is safe (no writer exists yet).
- **PR 2:** §3 whole — strictly after PR 1 is **deployed** (not merely merged): the §2.2
  schema-skew hazard means a usage-writing client against a pre-PR-1 server quarantines
  answers. The `useOptimisticRound` extraction lands as a **refactor-only first step**
  (PR 2a, or a standalone first commit of PR 2 explicitly revertable independently):
  extract the hook, rewire `TriageRound` as its only consumer, `TriageRound.test.tsx`
  green unchanged, **before any usage-round code** — so reverting the usage round never
  drags the triage refactor.
- **Adjustments the shipped Epic P code forces (named):**
  - Parent D2's queue rule said "built once at round start, server-side (today's SSR
    pattern)" — "today" has moved: Epic P replaced per-item SSR with
    server-selected-whole-queue + client advance (`selectTriageQueue` + `TriageRound`).
    The usage round follows the shipped pattern, not the parent's wording.
  - Parent D3's recompute-skip lands as a predicate *composition* with Epic P's shipped
    "only if inserted ≥ 1" rule (§2.4) — exactly the extension Epic P §2.3.6
    pre-announced.
  - Undo in the usage round is Epic P's undo-as-revisit verbatim (queue introspection via
    `isInFlight`/`awaitAck`), not a bespoke mechanism.
  - The round-length chooser now has two homes (StartSessionForm pre-round + the new
    in-round `RoundLengthChooser`) because the shipped pre-round chooser already exists;
    parent D2 only ever described the in-round one. (Both render from the one
    `ROUND_BOX_OPTIONS` home, §3.1.)
  - Epic P deferred its Playwright tier (crash-reload + pagehide), so PR 2's usage smoke
    ships **without** its reload half: that obligation is now its own bead
    (`purses-hmjs`, gated on `purses-yuw`), and the usage-round reload assertion joins
    the suite when it lands (§5).

**Parent-D5 reading, amended (named):** parent D5's "after a usage round completes" is
read as "ends **without engagement**" (§3.8 — queue exhaustion, or expiry with zero
answers), per D5's own rationale (implicit not-now), not as any round end: with §3.1's
default 2 m box, bare expiry would demote people who were actively answering.

## 7. Open items (parent-spec contradictions / gaps — not resolved silently)

1. **Demotion vs. exhausted Compare:** parent D5 says usage is demoted *below Compare*,
   not removed — so once Compare is exhausted the demoted ladder would recommend Usage
   again, to a person who may have passed everything twice. **Recommended by review:
   the demoted ladder falls through to Decide (usage never re-promoted; the hub's quiet
   chooser card is the path back) — folded into §3.8 as a named narrowing of parent D5;
   confirmed by user 2026-07-07 ("continue until all follow-ups are done").**
2. **Where demotion applies:** the recommendation is computed server-side but the
   demotion memory is device-local (parent D5's own requirement) — the parent never says
   how they meet. Resolved here via the dual-return + client swap (§3.8) with a named
   pre-hydration wrong-card window on demoted hubs (server paint → hydration; live link
   throughout). **Recommended by review: accept the window (it only affects a device
   that already completed a usage round), constrained to a motionless, zero-layout-shift
   same-slot swap (§3.8); confirmed by user 2026-07-07 ("continue until all follow-ups are done").**
3. **Pre-existing scoping quirk surfaced:** the hub feeds *session-scoped* decisions to
   `selectNextPair` (`page.tsx:54`) while the recompute uses the curator-wide log — the
   compare recommendation could mis-predict pair availability across sessions. Pre-dates
   this epic; not fixed here; file a bead.
4. **Dead `timebox` payload:** `StartSessionForm` POSTs `timebox` but no server code reads
   it. Left untouched; cleanup bead.
5. **The 4-step arc (§3.9)** changes shipped triage/compare chrome (step indicator,
   compare's step number); the parent is silent on where usage sits in the indicator.
   Pinned here as ladder order. **Recommended by review: keep as pinned — the indicator
   is a fixed positional wayfinder over round types, not a remaining-work tally, so
   commitment 4's forbidden list is not triggered; usage = 2 in ladder order is right;
   confirmed by user 2026-07-07 ("continue until all follow-ups are done").**
6. **Walkthrough staleness:** `/welcome` (#304) teaches a two-round app and shares
   `ROUND_COPY`; adding `ROUND_COPY.usage` does not add a walkthrough beat. Parent silent.
   Follow-up bead (within the epic, per house rule on follow-ups). *Partially defused by
   §3.8's arc-name renames (the walkthrough picks up "Get acquainted" / "Which do you
   love more?" for free via the shared module); the missing usage beat remains the bead.*
7. **Deferred items and usage:** parent D2 excludes `deferred` from the usage queue, so a
   deferred item stays usage-unknown until brought back — the "Not yet" love-answer also
   defers the factual usage question. Followed the parent. **Recommended by review:
   confirm as deliberate — "Not yet" means "don't re-surface this item", and a factual
   question still re-surfaces the item; nothing is orphaned (the item becomes
   queue-eligible the moment it is brought back); confirmed by user 2026-07-07 ("continue until all follow-ups are done").**
8. **All §4 copy strings** are proposals pending the TONE review the parent (§7.2)
   requires; the parent-fixed candidates ("Do you use this?", "Yes, I use it",
   "Not these days", "Skip for now", the education line) are carried verbatim.
   **Recommended by review (folded as proposals, still TONE items): the selection-keyed
   length helper line (§3.1), the pass button's contract-bearing aria-label (§3.4), and
   the triage/compare arc-name renames (§3.8); confirmed by user 2026-07-07 ("continue until all follow-ups are done").**
9. **"Skip for now" vs triage's "Not yet":** adjacent rounds use near-synonymous labels
   with different semantics (write-nothing pass vs a `deferred` disposition).
   **Recommended by review: keep "Skip for now", and close the residual confusability
   with the contract-bearing accessible name pinned in §3.4
   ("Skip for now — it'll come around again", the DeferControl precedent); awaiting user
   confirmation.**
