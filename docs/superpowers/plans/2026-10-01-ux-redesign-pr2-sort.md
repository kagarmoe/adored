# Adored UX redesign — PR 2 (sort, ranking, save and share) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax. Track each task as a bead (`bd`, child of `purses-w7ss.2`), never TodoWrite.

**Goal:** One sort path — collection home → **Start/Keep sorting** → one Sort screen (feelings, then
pairs over Love + Like, Undo, Pause, a numberless progress line) → the live **Ranking** (hand moves
pin into one lazily created draft, Unpin, Still deciding, Set aside with Bring back) → one atomic
**Save and share** — with the old round pages redirected, the timer removed and the onboarding
rewritten for the two phases.

**Architecture:** Two pure modules carry the rules: `src/lib/sort-phase.ts` (which phase, which
queue or pair, progress) and the ranking helpers added to
`src/server/services/sortResultMaterialization.ts` (tier-first order, `applyPins`, `buildRanking`).
Selection and order derivation share one comparable-set function, so they agree by construction.
`SortResultService` gains one locked-transaction helper (`inCuratorTx`) that every draft writer uses —
pin, unpin, save-and-share, revision, legacy create — so the new partial unique index
(`sort_results_open_draft_unique`) is a backstop, never a 500. Pages stay Server Components that read
and pass plain props; the client islands write only through API routes (two new: pins, save).

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle 0.45/Postgres (postgres-js), zod 4,
vitest + Testing Library (jsdom/node), Playwright (WebKit tablet in CI).

**Spec:** `docs/superpowers/specs/2026-10-01-adored-ux-redesign-design.md` — PR 2 = §8 item 2:
§4 Part B, §6 (sessions, results, redirects), the §7 rows for the sort/ranking/save, §9 (timer
removed, no photo drag, one quiet Save). PR 1's plan
(`docs/superpowers/plans/2026-10-01-ux-redesign-pr1-item-panel.md`) is format and interface reference
only (pill `Button`/`Input`, `rounded-pill`, `InYourLifeChip`'s lazy-session pattern).

## Global Constraints (from the spec)

- Vocabulary is fixed: tiers **Love / Like / Maybe / Onward**; escapes **Not yet / Not mine**;
  "Set aside" only ever means an item set aside with Not mine. No timer anywhere.
- Sort is one screen at `/collections/[id]/sort`, two phases in order, never interleaved:
  *Feelings* ("How do you feel about this one?", every live item once, Not yet returns at the end of
  the phase) then *Pairs* ("Now, between these two…", "Which would you reach for first?", Tie, Skip)
  over the **comparable set = Love + Like only**. Ranking orders by tier first, then derived order.
- Controls: **Undo** shows the last answer ("Undo: Love"); **Pause** returns home with the session
  paused; numberless thin progress line, count in screen-reader text only; Not yet and Not mine are
  outside the denominator. End: "That's everything for now" + one button to the Ranking. No celebration.
- Ranking at `/collections/[id]/results`: "What you love most" first, the ordered list with photos,
  an Onward row, a quiet **Still deciding** row (Not yet), a collapsed **Set aside** row with **Bring
  back**. **Viewing creates nothing.** The first adjustment lazily creates the one open draft;
  later adjustments reuse it; a pinned item does not move with later pair answers; **Unpin** returns it.
- Save and share: one button, name prefilled with the collection name and date, one server
  transaction (create-or-reuse draft → finalize → share link) with an idempotency key, closes the
  session, shows the link. Saved rankings stay at `/results/[resultNumber]`, immutable; **Make a
  revision** opens a new copy; the old link keeps the old order; saving the revision issues its own link.
- Removed: `sort/new`, `sort/[s]`, `sort/[s]/triage|usage|compare`, `sort/set-aside`,
  `results/set-aside`, round recaps, "Take a break", session set-aside, "Adjust results" mode, the
  round timer + dial, `/tutorials/timers`, the ring tokens. Redirects are `page.tsx` files that run
  the DAL guard **first**: the five `sort/…` routes → `/collections/[id]/sort`; `sort/set-aside` and
  `results/set-aside` → `/collections/[id]/results`.
- Production holds real data. Schema change = one **additive** drizzle migration from
  `npm run db:generate`, reviewed, pinned in `scripts/migration-hashes.test.ts`; never a reset, no
  data rewrite. Existing drafts stay reachable; paused sessions resume via Keep sorting; sessions
  already set aside stay excluded (accepted loss).
- Tablet-first, tap-first, 44px targets (`h-11`), colour never the only signal, WCAG 2.1 AA.
- Every test runs in CI. DB tier only for real DB crossings; one un-mocked crossing per route.
  E2E at one viewport (tablet) in CI; phone is a local pre-PR gate (`PW_VIEWPORT=phone`).
- Commits end with the session attribution lines from the current system reminder. Do not push.

## Review Focus — five uncovered input classes (each pinned in its owning task)

1. **A Not yet on a piece that already came back** (deferred twice) — must let it rest so the phase
   ends; re-queuing it would loop forever. Pinned: Task 8, `TriageRound.test.tsx` "a second Not yet
   lets a returning piece rest and the phase hands off".
2. **Out-of-range or foreign pin targets** — position `0`, non-integer, extra keys, a position past
   the list, an Onward or untriaged piece, a piece from another collection: 400/404 with nothing
   opened, or clamped to the nearest end. Pinned: Task 3 `applyPins` "clamps a pin past either end";
   Task 4 route test "404s a foreign piece and opens nothing" (the 400/Onward/untriaged permutations are
   unit tests on `RankingController` / `pinItem`).
3. **Save retried or replayed** — double tap, network retry, the same key aimed at another
   collection: same link back with nothing new; 409 across collections. Pinned: Task 6 "a retry with
   the same key returns the same link and creates nothing new" + "a key used in another collection is a 409".
4. **A piece archived after it was triaged or pinned** — must leave the live ranking and the save
   (saved rankings it is already in keep it). Pinned: Task 3 `buildRanking` "drops pieces that are no
   longer live, and their pins"; Task 2 "does not count a preference for a piece that is no longer live".
5. **Two pins on one slot** (move B to 2, later move C to 2) — newest holds the slot, the older shifts
   down, nothing lost or duplicated. Pinned: Task 3 `applyPins` "gives a shared slot to the newer pin".

## Decisions this plan takes where the spec is silent (call them out in review)

- **Comparable set changes behaviour.** Today `selectComparableItems` admits every live, undisposed
  item and order derivation ranks all of them. Both now admit Love + Like only, and
  `rankPreferencesToItems` sorts **tier first**, then `orderRank` (nulls last), then `itemId` (today a
  global `orderRank` sort can lift an Onward item above Love). Stale `orderRank`s on Maybe/Onward rows
  in prod are cleared by the next recompute and are harmless to tier-first ordering until then.
- **Phase hand-off** is `?phase=pairs`. The feelings phase walks its queue client-side; when the last
  piece has passed through it drains its queue and `router.replace`s to `/sort?phase=pairs`. The
  chooser treats the param as "the deferred tail was offered this visit". Any *active* unplaced piece
  (a stale tab, a Bring back) still wins and sends the screen back to feelings.
- **Undo** reverts the last *decision* (a tier or a pair answer). A still-queued answer is removed; an
  answer already sent is re-presented with the prior choice selected, and the new tap supersedes it
  (the log is append-only, latest wins). Not mine keeps its own "Bring back" notice; Not yet needs no
  undo (the piece returns at the end of the phase).
- **Progress**: feelings = placed / (placed + active unplaced), pairs = pieces placed by the
  insertion order / comparable count. Shown as a bar; the numbers are `sr-only`.
- **Pins live inside the loved list** (Love, Like, Maybe). Onward is shown, not reordered. The new
  surface writes `manualRank` only (`manualBucket` stays null); a legacy draft's cross-tier
  `manualBucket` is ignored by the live ranking. **`manualRank` stays 0-based** (the existing
  convention); the pure `Pin.position` and the pins API are 1-based, and the service converts at the
  boundary (`pinsFromRows` reads `manualRank + 1`; `pinItem` and revision write `position - 1`). Legacy
  rows are not cleared: an old hand order simply reads as pins at the right slots.
- **The lazy draft is an empty `sort_results` row named "Still deciding"**; it gains a
  `sort_result_items` row only for a pinned piece. Save rebuilds its rows from the live order (pins
  applied), stamps usage, then finalizes it. The saved snapshot carries plain `computedRank`s.
- **Idempotency key storage**: a nullable `sort_results.save_key` with a partial unique index
  `(curator_id, save_key) WHERE save_key IS NOT NULL`, in the same migration as the open-draft index.
- **Duplicate drafts in prod** would make `CREATE UNIQUE INDEX` fail. Migration 0003 therefore carries
  one reviewed data step before the index: per (collection, curator) it removes every open draft except
  the newest (`created_at DESC, id DESC`), items first. `sort_results` has no terminal status other than
  `finalized` (`SortResultStatus = "draft" | "finalized"`) and no `deleted_at`, so removal is the only
  option that does not mint a saved ranking; it is what `createDraftResult` already does to a prior
  draft. Recorded in decision 42 as an amendment to spec §6 ("no data rewrite"); the PR body flags it
  for owner veto. Finalized rows and answers are untouched.
- **`POST /api/sort-results` stays** (API compatibility, no UI caller): `createDraftResult` now reaps
  the open draft *inside* the same locked transaction before inserting the new one.
- **Revision** (`supersede`) replaces the open draft with a copy whose loved rows are pinned at their
  saved positions, then sends the person to the live Ranking to adjust and save.
- `results/[n]` for a **draft** redirects to `/results` (the URL still resolves); a non-draft result
  renders read-only as today. `results/[n]/finalize` redirects to `/results`.
- `/sort` with no in-progress session renders a calm start state with the same button (it does not
  redirect), so the Build/Sort/Decide chip never dead-ends.
- Home keeps one primary: **Start sorting** / **Keep sorting** (+ a quiet "See your ranking" once
  anything is sorted). `ActiveSessionPanel` (with its "N of M sorted so far" meta and session
  set-aside) is retired; PR 3 redesigns home.
- The ranking keeps the quiet usage note ("In your life" / "Resting") next to the tier.
- Onboarding becomes purpose → feelings → pairs (Love + Like only) → ranking → hand-off; the usage,
  round-standing and refine beats go.

## File map

| Area | Create | Modify | Delete |
|---|---|---|---|
| Rules | `src/lib/sort-phase.ts`, `src/lib/compare-selection.test.ts` | `src/lib/compare-selection.ts`, `src/lib/pairwise-selection.ts`, `src/server/services/sortResultMaterialization.ts`, `src/server/services/PreferenceStateService.ts` | `src/lib/next-round.ts`, `round-timer.ts`, `round-preference.ts`, `usage-selection.ts`, `usage-round-prefs.ts`, `what-moved.ts` (+ tests) |
| Data | `drizzle/0003_*.sql` (generated), DB tests | `src/lib/db/schema.ts`, `scripts/migration-hashes.test.ts`, `SortResultRepository`, `SortResultItemRepository`, `SortResultService`, `src/server/api/http-errors.ts` | — |
| API | `src/server/api/ranking.ts`, `src/app/api/collections/[id]/ranking/{pins/[itemId],save}/route.ts` | `route-authz-enumeration.integration.test.ts` | — |
| Sort UI | `SortProgress.tsx`, `PauseControl.tsx`, `src/features/sessions/KeepSortingButton.tsx`, `src/lib/collections/retired-redirect.ts` | `sort/page.tsx`, `TriageRound.tsx`, `useOptimisticRound.ts`, `CompareChoice.tsx` | hub, round chrome, timer, usage round, `StartSessionForm`, `TakeABreakControl`, `StartSortingButton`, `SortHelpDialog`, sessions hub cards |
| Ranking UI | `RankingList.tsx`, `SaveAndShare.tsx`, `MakeRevisionButton.tsx` | `results/page.tsx`, `results/[resultNumber]/page.tsx` | `FinalizeEntry`, `FinalizeResultForm`, `RerankPanel`, `standing.ts` (+ tests) |
| Home | — | `collections/[id]/page.tsx` (+ test) | `ActiveSessionPanel`, `SessionResumeCard`, `ResumeControl`, `roundProgress` (+ tests) |
| Onboarding | — | `WalkthroughShell`, `WelcomePurpose`, `WelcomeStanding`, `sampleData`, `tutorials.ts`, `roundCopy.ts` | `WelcomeUsage`, `WelcomeRoundStanding`, `WelcomeRefine`, `src/app/tutorials/timers`, `rerank-copy.ts` |
| E2E/CI | `e2e/sort-journey.spec.ts` | `a11y.spec.ts`, `sort-images.spec.ts`, `welcome-walkthrough.spec.ts`, `.github/workflows/ci.yml`, `e2e/screenshots/capture.ts` | 14 sort/results specs (Task 13) |

---

## Task 1: Comparable set = Love + Like; ranking orders by tier first

**Files:** Modify `src/lib/compare-selection.ts` (whole file), `src/lib/pairwise-selection.ts` (whole
file), `src/server/services/PreferenceStateService.ts:84-98` (`deriveOrderRanks`),
`src/server/services/sortResultMaterialization.ts:28-56` (`rankPreferencesToItems`),
`src/lib/next-round.ts:95` and `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx:109-114`
(drop the removed `dispositionByItemId` argument — both files are retired in Task 8).
Tests: create `src/lib/compare-selection.test.ts`; replace `src/lib/pairwise-selection.test.ts`;
modify `src/server/services/PreferenceStateService.test.ts:204-257`,
`src/server/services/sortResultMaterialization.test.ts:75-93`,
`src/lib/db/binary-insertion-ranking.integration.test.ts:360-383`.

**Interfaces:**
- Produces: `selectComparableItems(items: readonly Item[], preferences: readonly CollectionPreferenceItem[]): Item[]`
  (live items whose preference bucket is `top` or `high`).
- Produces: `selectNextPair({ preferences, items, decisions }): [Item, Item] | null` — the
  `dispositionByItemId` option is gone (a disposed item is untriaged, so it has no preference and is
  never comparable).
- Produces: `rankPreferencesToItems(preferences)` ordering = bucket priority → `orderRank` ascending
  (nulls last) → `itemId`.

- [ ] **Step 1: Failing tests.** Create `src/lib/compare-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CollectionPreferenceItem, Item, RankBucket } from "@/types";
import { selectComparableItems } from "./compare-selection";

const item = (id: string, archived = false) => ({ id, deletedAt: archived ? new Date(0) : null }) as Item;
const pref = (itemId: string, rankBucket: RankBucket) => ({ itemId, rankBucket }) as CollectionPreferenceItem;

describe("selectComparableItems (spec §4: comparable set = Love + Like)", () => {
  it("keeps only live Love and Like pieces", () => {
    const items = [item("love"), item("like"), item("maybe"), item("onward"), item("untriaged"), item("archived", true)];
    const prefs = [pref("love", "top"), pref("like", "high"), pref("maybe", "medium"), pref("onward", "low"), pref("archived", "top")];
    expect(selectComparableItems(items, prefs).map((i) => i.id)).toEqual(["love", "like"]);
  });
});
```

Replace `src/lib/pairwise-selection.test.ts` with (helpers `item`/`pref`/`compareEvent` are the
file's existing ones, kept verbatim):

```ts
import { describe, expect, it } from "vitest";
import { selectNextPair } from "./pairwise-selection";
import { deriveOrder, type ComparisonEvent, type RankItem } from "./insertion-ranking";
import type { CollectionPreferenceItem, DecisionEvent, Item, RankBucket } from "@/types";

function item(id: string, createdAtMs = 0): Item {
  return {
    id, collectionId: "col-1", name: id, brand: null, style: null, color: null, material: null,
    category: null, number: null, height: null, width: null, depth: null, weight: null, unit: "in",
    status: null, notes: null, createdAt: new Date(createdAtMs), updatedAt: new Date(createdAtMs), deletedAt: null,
  };
}

function pref(itemId: string, rankBucket: RankBucket = "top"): CollectionPreferenceItem {
  return {
    id: `pref-${itemId}`, collectionId: "col-1", curatorId: "curator-1", itemId, score: 0.5,
    confidence: 0.5, rankBucket, comparisonCount: 0, orderRank: null, lastSeen: new Date(),
    createdAt: new Date(), updatedAt: new Date(),
  };
}

function compareEvent(id: string, itemAId: string, itemBId: string, result: "item_a" | "item_b" | "tie" | "skip", createdAtMs = 0): DecisionEvent {
  return { id, sessionId: "sess-1", type: "pairwise_compare", decision: { itemAId, itemBId, result }, createdAt: new Date(createdAtMs) };
}

describe("selectNextPair — the insertion engine over Love + Like", () => {
  it("returns the engine's next pair for two loved pieces", () => {
    const pair = selectNextPair({ preferences: [pref("a", "top"), pref("b", "high")], items: [item("a", 1), item("b", 2)], decisions: [] });
    expect(pair!.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("returns null once the comparable set is fully ordered", () => {
    const pair = selectNextPair({
      preferences: [pref("a"), pref("b")],
      items: [item("a", 1), item("b", 2)],
      decisions: [compareEvent("d1", "a", "b", "item_a", 10)],
    });
    expect(pair).toBeNull();
  });

  it("agrees with the engine mid-insertion (three pieces, one answer)", () => {
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const pair = selectNextPair({ preferences: items.map((i) => pref(i.id)), items, decisions: [compareEvent("d1", "a", "b", "item_a", 10)] });
    const rankItems: RankItem[] = items.map((i) => ({ id: i.id, createdAt: i.createdAt }));
    const comparisons: ComparisonEvent[] = [{ aId: "a", bId: "b", result: "item_a", createdAt: new Date(10), id: "d1" }];
    expect(pair!.map((i) => i.id)).toEqual(deriveOrder(rankItems, comparisons).nextPair);
  });

  it("never offers a Maybe, Onward or untriaged piece", () => {
    const items = [item("a", 1), item("m", 2), item("o", 3), item("u", 4), item("b", 5)];
    const pair = selectNextPair({ preferences: [pref("a", "top"), pref("m", "medium"), pref("o", "low"), pref("b", "high")], items, decisions: [] });
    expect(pair!.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("offers nothing when fewer than two pieces are Love or Like", () => {
    expect(selectNextPair({ preferences: [pref("a", "top"), pref("m", "medium")], items: [item("a", 1), item("m", 2)], decisions: [] })).toBeNull();
  });

  it("usage-only decisions do not block a pair", () => {
    const decisions: DecisionEvent[] = [
      { id: "u1", sessionId: "sess-1", type: "usage", decision: { itemId: "a", result: "uses" }, createdAt: new Date(10) },
    ];
    const pair = selectNextPair({ preferences: [pref("a"), pref("b")], items: [item("a", 1), item("b", 2)], decisions });
    expect(pair!.map((i) => i.id)).toEqual(["b", "a"]);
  });
});
```

In `PreferenceStateService.test.ts`, replace the test "assigns dense order ranks to compare-only
neutral rows with no triage buckets" (lines 204-257) with:

```ts
  it("orders only Love and Like: a Maybe row gets no orderRank (spec §4)", async () => {
    const t0 = new Date("2026-06-01T00:00:00Z");
    const t1 = new Date("2026-06-01T00:00:01Z");
    const t2 = new Date("2026-06-01T00:00:02Z");
    const computed = [
      scored({ itemId: "a", score: 0.875, rankBucket: "top", comparisonCount: 3 }),
      scored({ itemId: "b", score: 0.625, rankBucket: "high", comparisonCount: 2 }),
      scored({ itemId: "c", score: 0.375, rankBucket: "medium", comparisonCount: 2 }),
    ];
    const scoringService = { computePreferences: vi.fn().mockResolvedValue(computed) } as unknown as ScoringService;
    let captured: BulkUpsertRow[] = [];
    const preferenceRepo = {
      findByCollection: vi.fn().mockResolvedValue([]),
      bulkUpsert: vi.fn<CollectionPreferenceItemRepository["bulkUpsert"]>().mockImplementation(async (rows) => { captured = rows; }),
      clearOrderRanks: vi.fn().mockResolvedValue(undefined),
    } as unknown as CollectionPreferenceItemRepository;
    const items: Item[] = [
      { id: "a", createdAt: t0, deletedAt: null } as Item,
      { id: "b", createdAt: t1, deletedAt: null } as Item,
      { id: "c", createdAt: t2, deletedAt: null } as Item,
    ];
    const decisionRepo = {
      findBySession: vi.fn().mockResolvedValue([
        { id: "e1", sessionId: "sess-1", type: "pairwise_compare", decision: { itemAId: "a", itemBId: "b", result: "item_b" }, createdAt: t1 },
        { id: "e2", sessionId: "sess-1", type: "pairwise_compare", decision: { itemAId: "a", itemBId: "c", result: "item_a" }, createdAt: t2 },
      ]),
    } as unknown as DecisionEventRepository;
    const service = new PreferenceStateService(preferenceRepo, scoringService, makeItemRepo(items), makeSessionRepo([{ id: "sess-1" } as Session]), decisionRepo);

    await service.recalculatePreferences(COLLECTION, CURATOR);

    const rankOf = (id: string) => captured.find((c) => c.itemId === id)!.orderRank;
    expect(rankOf("b")).toBe(0);
    expect(rankOf("a")).toBe(1);
    expect(rankOf("c")).toBeNull();
  });
```

In `sortResultMaterialization.test.ts`, replace "orders globally by orderRank when compare evidence
exists, then falls back to bucket order" with:

```ts
  it("orders by tier first, then orderRank (nulls last) within the tier, then itemId", () => {
    const out = rankPreferencesToItems([
      preference({ itemId: "like-0", rankBucket: "high", orderRank: 0 }),
      preference({ itemId: "love-2", rankBucket: "top", orderRank: 2 }),
      preference({ itemId: "love-null", rankBucket: "top", orderRank: null }),
      preference({ itemId: "love-1", rankBucket: "top", orderRank: 1 }),
      preference({ itemId: "onward", rankBucket: "low", orderRank: 3 }),
    ]);
    expect(out.map((o) => o.itemId)).toEqual(["love-1", "love-2", "love-null", "like-0", "onward"]);
    expect(out.map((o) => o.computedRank)).toEqual([0, 1, 2, 3, 4]);
  });
```

In `binary-insertion-ranking.integration.test.ts`, replace "records pairwise-only Compare and assigns
dense orderRank without triage" with the same body renamed **"pairwise-only Compare on untriaged
pieces assigns NO orderRank (comparable set = Love + Like)"**, keeping the two `rankBucket` →
`"medium"` assertions and changing the last two to:

```ts
    expect(a?.orderRank).toBeNull();
    expect(b?.orderRank).toBeNull();
```

- [ ] **Step 2: Run, expect FAIL.**
  `npx vitest run src/lib/compare-selection.test.ts src/lib/pairwise-selection.test.ts src/server/services/PreferenceStateService.test.ts src/server/services/sortResultMaterialization.test.ts`
  → the new cases fail (Maybe/untriaged still comparable; Onward-with-rank sorts first).

- [ ] **Step 3: Implement.** `src/lib/compare-selection.ts`:

```ts
import type { CollectionPreferenceItem, Item, RankBucket } from "@/types";

// The comparable set (spec §4): live pieces felt as Love or Like. Pair selection
// and order derivation both call THIS function, so the order a pair answer builds
// is the order the ranking shows — they agree by construction.
const COMPARABLE_BUCKETS: ReadonlySet<RankBucket> = new Set<RankBucket>(["top", "high"]);

export function selectComparableItems(
  items: readonly Item[],
  preferences: readonly CollectionPreferenceItem[],
): Item[] {
  const bucketOf = new Map(preferences.map((p) => [p.itemId, p.rankBucket]));
  return items.filter((item) => {
    const bucket = bucketOf.get(item.id);
    return item.deletedAt === null && bucket !== undefined && COMPARABLE_BUCKETS.has(bucket);
  });
}
```

`src/lib/pairwise-selection.ts`:

```ts
import type { CollectionPreferenceItem, DecisionEvent, Item } from "@/types";
import { deriveOrder, toComparisonEvents, type RankItem } from "@/lib/insertion-ranking";
import { selectComparableItems } from "@/lib/compare-selection";

interface SelectionOptions {
  preferences: CollectionPreferenceItem[];
  items: Item[];
  /** The curator's decision log; only pairwise events feed the engine. */
  decisions: DecisionEvent[];
}

/**
 * The live "which pair next" selector: the same binary-insertion engine the
 * recompute runs, over the same comparable set (Love + Like), so both ask the
 * same next question. Null when the comparable set is fully ordered.
 */
export function selectNextPair({ preferences, items, decisions }: SelectionOptions): [Item, Item] | null {
  const comparable = selectComparableItems(items, preferences);
  const rankItems: RankItem[] = comparable.map((i) => ({ id: i.id, createdAt: i.createdAt }));
  const { nextPair } = deriveOrder(rankItems, toComparisonEvents(decisions));
  if (nextPair === null) return null;
  const byId = new Map(comparable.map((i) => [i.id, i]));
  const x = byId.get(nextPair[0]);
  const pivot = byId.get(nextPair[1]);
  return x && pivot ? [x, pivot] : null;
}
```

`PreferenceStateService.deriveOrderRanks`: replace the `rankItems` line with

```ts
    const rankItems: RankItem[] = selectComparableItems(items, preferences)
      .map((i) => ({ id: i.id, createdAt: i.createdAt }));
```

and update its comment to "the comparable set (Love + Like) — the same set `selectNextPair` reads".

`sortResultMaterialization.rankPreferencesToItems`:

```ts
/**
 * Pure: rank a curator's preferences into computed items — tier first (spec §4),
 * then the pair-derived orderRank within the tier (unordered rows last), then
 * itemId. orderRank only exists for Love + Like, so it never lifts a lower tier.
 */
export function rankPreferencesToItems(
  preferences: CollectionPreferenceItem[],
): MaterializedItem[] {
  return [...preferences]
    .sort((a, b) => {
      const byTier = BUCKET_PRIORITY[a.rankBucket] - BUCKET_PRIORITY[b.rankBucket];
      if (byTier !== 0) return byTier;
      if (a.orderRank !== b.orderRank) {
        if (a.orderRank === null) return 1;
        if (b.orderRank === null) return -1;
        return a.orderRank - b.orderRank;
      }
      return compareItemId(a.itemId, b.itemId);
    })
    .map((pref, index) => ({
      itemId: pref.itemId,
      computedRank: index,
      computedBucket: pref.rankBucket,
    }));
}
```

In `src/lib/next-round.ts` and the old compare page, delete the `dispositionByItemId` property from
the `selectNextPair({...})` call (and the now-unused local in `next-round.ts`'s `runLadder` call if
TypeScript reports it unused).

- [ ] **Step 4: Run, expect PASS.** Step 2 command → PASS. `npm run build` (type check). Then
  `bash e2e/fixtures/test-db.sh up && RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts src/lib/db/sort-pipeline.integration.test.ts src/lib/db/decision-batch.integration.test.ts`
  → PASS. If `decision-batch` "case 4" fails because it compared Maybe/Onward pieces, give those
  fixtures `top`/`high` triage so the invariance it proves still covers ordered rows.
- [ ] **Step 5: Commit.** `git add src/lib src/server/services "src/app/collections/[id]/sort" && git commit -m "feat(sort): compare and rank over Love + Like; ranking orders by tier first"`

## Task 2: Sort phase chooser (pure)

**Files:** Create `src/lib/sort-phase.ts`, `src/lib/sort-phase.test.ts`.

**Interfaces:**
- Consumes: `selectTriageQueue(items, preferenceItemIds, dispositionByItemId): TriageQueueEntry[]`
  (`src/lib/triage-selection.ts`), `selectNextPair` / `selectComparableItems` (Task 1),
  `deriveOrder`, `toComparisonEvents` (`src/lib/insertion-ranking.ts`).
- Produces:

```ts
export interface SortProgressCount { done: number; total: number }
export type SortPhase =
  | { kind: "feelings"; queue: TriageQueueEntry[]; progress: SortProgressCount }
  | { kind: "pairs"; pair: [Item, Item]; progress: SortProgressCount }
  | { kind: "done"; progress: SortProgressCount };
export function chooseSortPhase(input: {
  items: Item[]; preferences: CollectionPreferenceItem[];
  dispositionByItemId: Map<string, Disposition>; curatorDecisions: DecisionEvent[];
  deferredOffered: boolean;
}): SortPhase;
```

- [ ] **Step 1: Failing test** `src/lib/sort-phase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CollectionPreferenceItem, DecisionEvent, Disposition, Item, RankBucket } from "@/types";
import { chooseSortPhase } from "./sort-phase";

const item = (id: string, at = 0) => ({ id, createdAt: new Date(at), deletedAt: null }) as Item;
const pref = (itemId: string, rankBucket: RankBucket) => ({ itemId, rankBucket }) as CollectionPreferenceItem;
const compare = (id: string, a: string, b: string, result: "item_a" | "item_b", at: number) =>
  ({ id, sessionId: "s", type: "pairwise_compare", decision: { itemAId: a, itemBId: b, result }, createdAt: new Date(at) }) as DecisionEvent;
const run = (over: Partial<Parameters<typeof chooseSortPhase>[0]>) =>
  chooseSortPhase({ items: [], preferences: [], dispositionByItemId: new Map(), curatorDecisions: [], deferredOffered: false, ...over });

describe("chooseSortPhase (spec §4: feelings, then pairs, never interleaved)", () => {
  it("stays in feelings until every live piece is placed, with Not yet pieces last", () => {
    const phase = run({
      items: [item("a"), item("b"), item("c")],
      preferences: [pref("a", "top")],
      dispositionByItemId: new Map<string, Disposition>([["b", "deferred"]]),
    });
    expect(phase.kind).toBe("feelings");
    if (phase.kind !== "feelings") return;
    expect(phase.queue.map((e) => [e.item.id, e.deferred])).toEqual([["c", false], ["b", true]]);
    expect(phase.progress).toEqual({ done: 1, total: 2 });
  });

  it("never queues a Not mine piece and keeps it out of the denominator", () => {
    const phase = run({ items: [item("a"), item("b")], dispositionByItemId: new Map<string, Disposition>([["b", "set_aside"]]) });
    expect(phase.kind === "feelings" && phase.queue.map((e) => e.item.id)).toEqual(["a"]);
    expect(phase.progress).toEqual({ done: 0, total: 1 });
  });

  it("offers the Not yet tail until this visit has passed through it, then moves to pairs", () => {
    const base = {
      items: [item("a", 1), item("b", 2), item("c", 3)],
      preferences: [pref("a", "top"), pref("b", "high")],
      dispositionByItemId: new Map<string, Disposition>([["c", "deferred"]]),
    };
    expect(run(base).kind).toBe("feelings");
    const phase = run({ ...base, deferredOffered: true });
    expect(phase.kind === "pairs" && phase.pair.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("ignores ?phase=pairs while an active piece is still unplaced (stale tab, Bring back)", () => {
    expect(run({ items: [item("a"), item("b")], preferences: [pref("a", "top")], deferredOffered: true }).kind).toBe("feelings");
  });

  it("pairs only Love and Like, and measures progress over that set", () => {
    const phase = run({ items: [item("a", 1), item("b", 2), item("m", 3)], preferences: [pref("a", "top"), pref("b", "high"), pref("m", "medium")] });
    expect(phase.kind).toBe("pairs");
    expect(phase.progress).toEqual({ done: 1, total: 2 });
  });

  it("is done when the comparable set is fully ordered", () => {
    const phase = run({
      items: [item("a", 1), item("b", 2)],
      preferences: [pref("a", "top"), pref("b", "top")],
      curatorDecisions: [compare("d1", "a", "b", "item_a", 10)],
    });
    expect(phase).toEqual({ kind: "done", progress: { done: 2, total: 2 } });
  });

  it("is done with nothing to pair (one loved piece, or an empty collection)", () => {
    expect(run({ items: [item("a")], preferences: [pref("a", "top")] }).kind).toBe("done");
    expect(run({}).kind).toBe("done");
  });

  it("does not count a preference for a piece that is no longer live", () => {
    expect(run({ items: [item("a")], preferences: [pref("gone", "top")] }).progress).toEqual({ done: 0, total: 1 });
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/sort-phase.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/sort-phase.ts`:

```ts
import type { CollectionPreferenceItem, DecisionEvent, Disposition, Item } from "@/types";
import { selectTriageQueue, type TriageQueueEntry } from "@/lib/triage-selection";
import { selectNextPair } from "@/lib/pairwise-selection";
import { selectComparableItems } from "@/lib/compare-selection";
import { deriveOrder, toComparisonEvents } from "@/lib/insertion-ranking";

export interface SortProgressCount {
  done: number;
  total: number;
}

export type SortPhase =
  | { kind: "feelings"; queue: TriageQueueEntry[]; progress: SortProgressCount }
  | { kind: "pairs"; pair: [Item, Item]; progress: SortProgressCount }
  | { kind: "done"; progress: SortProgressCount };

export interface SortPhaseInput {
  /** The collection's live items. */
  items: Item[];
  preferences: CollectionPreferenceItem[];
  dispositionByItemId: Map<string, Disposition>;
  /** The curator's cross-session decision log (the one the recompute reads). */
  curatorDecisions: DecisionEvent[];
  /** This visit already walked the Not yet tail (the feelings phase handed off). */
  deferredOffered: boolean;
}

/**
 * Which phase the Sort screen shows (spec §4). Feelings first: every live piece
 * passes through once, Not yet pieces at the end; Not mine pieces never. Then
 * pairs over Love + Like. Progress never counts Not yet or Not mine pieces.
 */
export function chooseSortPhase(input: SortPhaseInput): SortPhase {
  const { items, preferences, dispositionByItemId, curatorDecisions, deferredOffered } = input;
  const liveIds = new Set(items.map((i) => i.id));
  const placed = new Set(preferences.filter((p) => liveIds.has(p.itemId)).map((p) => p.itemId));
  const queue = selectTriageQueue(items, placed, dispositionByItemId);
  const active = queue.filter((e) => !e.deferred).length;
  if (active > 0 || (queue.length > 0 && !deferredOffered)) {
    return { kind: "feelings", queue, progress: { done: placed.size, total: placed.size + active } };
  }

  const comparable = selectComparableItems(items, preferences);
  const { order } = deriveOrder(
    comparable.map((i) => ({ id: i.id, createdAt: i.createdAt })),
    toComparisonEvents(curatorDecisions),
  );
  const pair = selectNextPair({ preferences, items, decisions: curatorDecisions });
  return pair
    ? { kind: "pairs", pair, progress: { done: order.length, total: comparable.length } }
    : { kind: "done", progress: { done: comparable.length, total: comparable.length } };
}
```

- [ ] **Step 4:** Step 2 command → PASS. `npm run lint`.
- [ ] **Step 5:** `git add src/lib/sort-phase.ts src/lib/sort-phase.test.ts && git commit -m "feat(sort): phase chooser — feelings then pairs, numberless progress counts"`

## Task 3: Ranking with pins (pure)

**Files:** Modify `src/server/services/sortResultMaterialization.ts` (append), its test
`src/server/services/sortResultMaterialization.test.ts` (append).

**Interfaces:**
- Consumes: `rankPreferencesToItems` (Task 1), `effectiveBucket` (`src/lib/results-buckets.ts`).
- Produces:

```ts
export interface Pin { itemId: string; position: number; pinnedAt: Date }   // position is 1-based
export interface RankingEntry { itemId: string; bucket: RankBucket; pinned: boolean }
export function applyPins(derived: readonly string[], pins: readonly Pin[]): string[];
export function buildRanking(
  preferences: readonly CollectionPreferenceItem[],
  liveItemIds: ReadonlySet<string>,
  pins: readonly Pin[],
): { loved: RankingEntry[]; onward: RankingEntry[] };
export function savedOrderPositions(rows: readonly SortResultItem[]): Map<string, number>;
export function pinsFromRows(rows: readonly SortResultItem[]): Pin[];   // manualRank (0-based) -> Pin.position (1-based)
```

- [ ] **Step 1: Failing tests** (append to `sortResultMaterialization.test.ts`; add `applyPins`,
  `buildRanking`, `savedOrderPositions`, `pinsFromRows`, `type Pin` to the import):

```ts
const pin = (itemId: string, position: number, at = 0): Pin => ({ itemId, position, pinnedAt: new Date(at) });

describe("applyPins (spec §4: a pinned piece does not move with later pair answers)", () => {
  it("keeps a pinned piece in its slot while the derived order moves around it", () => {
    expect(applyPins(["a", "b", "c", "d"], [pin("b", 1)])).toEqual(["b", "a", "c", "d"]);
    expect(applyPins(["d", "c", "b", "a"], [pin("b", 1)])).toEqual(["b", "d", "c", "a"]);
  });

  it("returns the derived order untouched once the pin is gone (Unpin)", () => {
    expect(applyPins(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("clamps a pin past either end", () => {
    expect(applyPins(["a", "b", "c"], [pin("a", 99)])).toEqual(["b", "c", "a"]);
    expect(applyPins(["a", "b", "c"], [pin("c", 0)])).toEqual(["c", "a", "b"]);
  });

  it("gives a shared slot to the newer pin and moves the older one down", () => {
    expect(applyPins(["a", "b", "c"], [pin("a", 2, 1), pin("c", 2, 2)])).toEqual(["b", "c", "a"]);
  });

  it("ignores pins for pieces no longer in the list", () => {
    expect(applyPins(["a", "b"], [pin("gone", 1)])).toEqual(["a", "b"]);
  });
});

describe("buildRanking", () => {
  it("splits loved (Love, Like, Maybe) from Onward and pins only inside the loved list", () => {
    const out = buildRanking(
      [
        preference({ itemId: "love", rankBucket: "top", orderRank: 0 }),
        preference({ itemId: "like", rankBucket: "high", orderRank: 1 }),
        preference({ itemId: "maybe", rankBucket: "medium" }),
        preference({ itemId: "onward", rankBucket: "low" }),
      ],
      new Set(["love", "like", "maybe", "onward"]),
      [pin("maybe", 1), pin("onward", 1)],
    );
    expect(out.loved.map((e) => [e.itemId, e.bucket, e.pinned])).toEqual([
      ["maybe", "medium", true],
      ["love", "top", false],
      ["like", "high", false],
    ]);
    expect(out.onward.map((e) => e.itemId)).toEqual(["onward"]);
  });

  it("drops pieces that are no longer live, and their pins", () => {
    const out = buildRanking(
      [preference({ itemId: "a", rankBucket: "top" }), preference({ itemId: "archived", rankBucket: "top" })],
      new Set(["a"]),
      [pin("archived", 1)],
    );
    expect(out.loved.map((e) => e.itemId)).toEqual(["a"]);
  });
});

describe("savedOrderPositions (a revision starts from the saved order)", () => {
  it("numbers the saved loved order from 1 and leaves Onward unpinned", () => {
    const rows = [
      sortResultItem({ itemId: "b", computedRank: 1, computedBucket: "high" }),
      sortResultItem({ itemId: "o", computedRank: 2, computedBucket: "low" }),
      sortResultItem({ itemId: "a", computedRank: 0, computedBucket: "top" }),
    ];
    expect([...savedOrderPositions(rows)]).toEqual([["a", 1], ["b", 2]]);
  });
});

describe("pinsFromRows (manualRank stays 0-based; a Pin is 1-based)", () => {
  it("reads manualRank 0 as position 1 and skips unpinned rows", () => {
    const rows = [
      sortResultItem({ itemId: "a", manualRank: 0 }),
      sortResultItem({ itemId: "b", manualRank: 2 }),
      sortResultItem({ itemId: "c", manualRank: null }),
    ];
    expect(pinsFromRows(rows).map((p) => [p.itemId, p.position])).toEqual([["a", 1], ["b", 3]]);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/server/services/sortResultMaterialization.test.ts` → FAIL (exports missing).
- [ ] **Step 3: Implement** (append to `sortResultMaterialization.ts`; add `SortResultItem` to the type
  import and `import { effectiveBucket } from "@/lib/results-buckets";`):

```ts
/** A hand-placed piece in the open draft: its 1-based slot in the loved list. */
export interface Pin {
  itemId: string;
  position: number;
  pinnedAt: Date;
}

export interface RankingEntry {
  itemId: string;
  bucket: RankBucket;
  pinned: boolean;
}

/**
 * Pure: lay pinned pieces into their slots and fill the rest in derived order
 * (spec §4: later pair answers never move a pinned piece). A pin past either end
 * clamps; two pins on one slot keep the newer there and move the older to the
 * next free slot. Pins for pieces not in `derived` are ignored — nothing is ever
 * added or lost.
 */
export function applyPins(derived: readonly string[], pins: readonly Pin[]): string[] {
  const present = new Set(derived);
  const ordered = pins
    .filter((p) => present.has(p.itemId))
    .sort(
      (a, b) =>
        a.position - b.position ||
        b.pinnedAt.getTime() - a.pinnedAt.getTime() ||
        compareItemId(a.itemId, b.itemId),
    );
  const slots: (string | null)[] = derived.map(() => null);
  const pinned = new Set<string>();
  for (const pin of ordered) {
    if (pinned.has(pin.itemId)) continue;
    let i = Math.min(Math.max(pin.position, 1), slots.length) - 1;
    while (i < slots.length && slots[i] !== null) i++;
    if (i === slots.length) i = slots.lastIndexOf(null);
    slots[i] = pin.itemId;
    pinned.add(pin.itemId);
  }
  const rest = derived.filter((id) => !pinned.has(id));
  let next = 0;
  return slots.map((slot) => slot ?? rest[next++]);
}

/**
 * Pure: the live ranking (spec §4) — tier-first derived order for live pieces,
 * pins applied inside the loved list (Love, Like, Maybe), Onward as its own row.
 * Shared by the Ranking page and Save-and-share, so what you see is what is saved.
 */
export function buildRanking(
  preferences: readonly CollectionPreferenceItem[],
  liveItemIds: ReadonlySet<string>,
  pins: readonly Pin[],
): { loved: RankingEntry[]; onward: RankingEntry[] } {
  const ranked = rankPreferencesToItems(preferences.filter((p) => liveItemIds.has(p.itemId)));
  const byId = new Map(ranked.map((m) => [m.itemId, m]));
  const pinnedIds = new Set(pins.map((p) => p.itemId));
  const lovedIds = ranked.filter((m) => m.computedBucket !== "low").map((m) => m.itemId);
  const loved = applyPins(lovedIds, pins).flatMap((itemId) => {
    const m = byId.get(itemId);
    return m ? [{ itemId, bucket: m.computedBucket, pinned: pinnedIds.has(itemId) }] : [];
  });
  const onward = ranked
    .filter((m) => m.computedBucket === "low")
    .map((m) => ({ itemId: m.itemId, bucket: m.computedBucket, pinned: false }));
  return { loved, onward };
}

/**
 * Pure: the open draft's pins. `manualRank` keeps its existing 0-based convention
 * (the legacy "Adjust results" rank space); a Pin is the 1-based slot, so this is
 * the one place the +1 happens. Used by both listPins and saveAndShare.
 */
export function pinsFromRows(rows: readonly SortResultItem[]): Pin[] {
  return rows.flatMap((r) =>
    r.manualRank === null ? [] : [{ itemId: r.itemId, position: r.manualRank + 1, pinnedAt: r.updatedAt }],
  );
}

/** Pure: a saved ranking's loved order as 1-based positions (Onward excluded). */
export function savedOrderPositions(rows: readonly SortResultItem[]): Map<string, number> {
  const ordered = [...rows].sort(
    (a, b) => (a.manualRank ?? a.computedRank) - (b.manualRank ?? b.computedRank),
  );
  return new Map(
    ordered.filter((r) => effectiveBucket(r) !== "low").map((r, i) => [r.itemId, i + 1]),
  );
}
```

- [ ] **Step 4:** Step 2 command → PASS. `npm run lint`.
- [ ] **Step 5:** `git add src/server/services/sortResultMaterialization.ts src/server/services/sortResultMaterialization.test.ts && git commit -m "feat(ranking): pins hold their slot; one ranking builder for page and save"`

## Task 4: The open draft — locked writes, pins API, legacy create and revision

**Files:** Modify `src/server/repositories/implementations/SortResultRepository.ts` (add one
method), `SortResultItemRepository.ts` (add one), `src/server/services/SortResultService.ts`
(`createDraftResult`, `supersedeResult`, new helpers + pin methods; delete `supersedePriorDrafts`
and `createResultWithItems`), `src/server/api/http-errors.ts` (map two errors),
`src/server/services/SortResultService.test.ts` (mocks + two assertions),
`src/lib/db/route-authz-enumeration.integration.test.ts` (stranger cases).
Create `src/server/api/ranking.ts`, `src/server/api/ranking.test.ts`,
`src/app/api/collections/[id]/ranking/pins/[itemId]/route.ts`,
`src/lib/db/ranking-pins-routes.integration.test.ts`.

**Interfaces:**
- Consumes: `Pin`, `pinsFromRows`, `savedOrderPositions`, `cloneItemsFrom`, `rankPreferencesToItems` (Task 3/1);
  `lockCollectionCurator(tx, collectionId, curatorId)`, `withTransaction` (`src/lib/transactions.ts`).
- Produces (repositories):
  `SortResultRepository.findDraftForUpdate(collectionId, curatorId): Promise<SortResult | null>`;
  `SortResultItemRepository.findByResultAndItem(sortResultId, itemId): Promise<SortResultItem | null>`.
- Produces (service): `OPEN_DRAFT_NAME = "Still deciding"`, `PinTargetError` (→ 404),
  `listPins(collectionId, curatorId): Promise<Pin[]>`,
  `pinItem(collectionId, curatorId, itemId, position): Promise<void>`,
  `unpinItem(collectionId, curatorId, itemId): Promise<void>`, and the private helpers
  `inCuratorTx`, `getOrCreateOpenDraft`, `deleteDrafts`, `insertResultWithItems` that Task 6 reuses.
- Produces (API): `RankingController` with `listPins`, `pin(collectionId, curatorId, itemId, body: unknown)`,
  `unpin(...)`; routes `PUT|DELETE /api/collections/[id]/ranking/pins/[itemId]` (body `{ position: int 1..10000 }`,
  strict) → `200 { ok: true }`.

- [ ] **Step 1: Failing DB test** `src/lib/db/ranking-pins-routes.integration.test.ts`:

```ts
// @vitest-environment node
// The live ranking's hand placement (spec §4 "Adjusting"), un-mocked: route ->
// RankingController -> SortResultService -> repos -> Postgres. Mocks only auth + db.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import type { RankBucket } from "@/types";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { PUT as pin, DELETE as unpin } from "@/app/api/collections/[id]/ranking/pins/[itemId]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function req(method: "PUT" | "DELETE", body?: unknown): Request {
  return new Request("http://localhost/api/collections/c/ranking/pins/i", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string, itemId: string) => ({ params: Promise.resolve({ id, itemId }) }) as any;

describeDb("ranking pins (route -> service -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  });
  afterAll(async () => {
    await closeDb();
  });

  async function seedRanked(buckets: RankBucket[]) {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const prefs = new CollectionPreferenceItemRepository(db);
    const itemIds: string[] = [];
    for (const [i, rankBucket] of buckets.entries()) {
      const item = await new ItemRepository(db).create({ collectionId, name: `Piece ${i + 1}` });
      await prefs.create({ collectionId, curatorId: ownerId, itemId: item.id, score: 0.5, confidence: 1, rankBucket, comparisonCount: 1 });
      itemIds.push(item.id);
    }
    return { collectionId, itemIds };
  }
  const drafts = async (collectionId: string) =>
    (await new SortResultRepository(getTestDb().db).findByCollection(collectionId)).filter((r) => r.status === "draft");
  const pinsOf = async (resultId: string) =>
    new Map((await new SortResultItemRepository(getTestDb().db).findByResult(resultId)).map((r) => [r.itemId, r.manualRank]));

  it("the first move opens the one draft; the next move reuses it", async () => {
    const { collectionId, itemIds } = await seedRanked(["top", "high", "medium"]);
    expect(await drafts(collectionId)).toHaveLength(0);

    expect((await pin(req("PUT", { position: 1 }), ctx(collectionId, itemIds[2]))).status).toBe(200);
    expect((await pin(req("PUT", { position: 3 }), ctx(collectionId, itemIds[0]))).status).toBe(200);

    const open = await drafts(collectionId);
    expect(open).toHaveLength(1);
    expect(open[0].name).toBe("Still deciding");
    expect(await pinsOf(open[0].id)).toEqual(new Map([[itemIds[2], 0], [itemIds[0], 2]])); // manualRank is 0-based
  });

  it("unpin clears the placement and keeps the draft (idempotent)", async () => {
    const { collectionId, itemIds } = await seedRanked(["top", "high"]);
    await pin(req("PUT", { position: 1 }), ctx(collectionId, itemIds[1]));
    expect((await unpin(req("DELETE"), ctx(collectionId, itemIds[1]))).status).toBe(200);
    expect((await unpin(req("DELETE"), ctx(collectionId, itemIds[1]))).status).toBe(200);
    const [open] = await drafts(collectionId);
    expect(await pinsOf(open.id)).toEqual(new Map([[itemIds[1], null]]));
  });

  it("404s a piece from another collection and opens nothing", async () => {
    const { collectionId } = await seedRanked(["top"]);
    const other = await seedRanked(["top"]);
    expect((await pin(req("PUT", { position: 1 }), ctx(collectionId, other.itemIds[0]))).status).toBe(404);
    expect(await drafts(collectionId)).toHaveLength(0);
  });
});
```

- [ ] **Step 2:** `bash e2e/fixtures/test-db.sh up && RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/ranking-pins-routes.integration.test.ts`
  → FAIL (route module missing).

- [ ] **Step 3: Repositories.** `SortResultRepository` (add `desc` to the `drizzle-orm` import):

```ts
  // The curator's open draft for the collection, row-locked. Callers hold the
  // (collection, curator) advisory lock, so this is the only draft writer at a time.
  // Newest first: a legacy pair of drafts (pre-0003) resolves to the newer one.
  async findDraftForUpdate(collectionId: string, curatorId: string): Promise<SortResult | null> {
    const [row] = await this.db
      .select()
      .from(sortResultsTable)
      .where(
        and(
          eq(sortResultsTable.collectionId, collectionId),
          eq(sortResultsTable.curatorId, curatorId),
          eq(sortResultsTable.status, "draft"),
        ),
      )
      .orderBy(desc(sortResultsTable.createdAt))
      .limit(1)
      .for("update");
    return row ? this.mapToResult(row) : null;
  }
```

`SortResultItemRepository`:

```ts
  async findByResultAndItem(sortResultId: string, itemId: string): Promise<SortResultItem | null> {
    const [row] = await this.db
      .select()
      .from(sortResultItemsTable)
      .where(and(eq(sortResultItemsTable.sortResultId, sortResultId), eq(sortResultItemsTable.itemId, itemId)));
    return row ? this.mapToResultItem(row) : null;
  }
```

- [ ] **Step 4: Service.** In `SortResultService.ts` add imports
  `import { lockCollectionCurator, withTransaction } from "@/lib/transactions";` and extend the
  materialization import with `pinsFromRows, savedOrderPositions, type Pin`. Add:

```ts
/** The open draft's name until Save and share names it. */
export const OPEN_DRAFT_NAME = "Still deciding";

/** Pin target is not a Love/Like/Maybe piece of this curator in this collection → 404. */
export class PinTargetError extends Error {
  constructor() {
    super("That piece isn't in your ranking yet.");
    this.name = "PinTargetError";
  }
}
```

Replace `createDraftResult`, `supersedePriorDrafts` and `createResultWithItems` with:

```ts
  async createDraftResult(collectionId: string, curatorId: string, name: string): Promise<SortResult> {
    const preferences = await this.preferenceRepo.findByCollection(collectionId, curatorId);
    const items = rankPreferencesToItems(preferences);
    const usageByItemId = await this.deriveCuratorUsage(collectionId, curatorId, items);
    // One open draft per (collection, curator) (sort_results_open_draft_unique): the
    // prior draft is reaped INSIDE the same locked transaction, before the insert,
    // so the index never sees two and a failure leaves the old draft in place.
    return this.inCuratorTx(collectionId, curatorId, "materialize_result", async (tx) => {
      await this.deleteDrafts(tx, collectionId, curatorId);
      return this.insertResultWithItems(tx, collectionId, curatorId, name, items, usageByItemId);
    });
  }

  /**
   * Every draft writer runs here: one transaction holding the (collection, curator)
   * advisory lock, so pin / unpin / save / revision / legacy create serialize and
   * the open-draft index is a backstop, never a 500. The (collection, number) race
   * (another curator saving in the same collection) aborts the transaction, so it is
   * retried at this boundary, up to 5 attempts.
   */
  private async inCuratorTx<T>(
    collectionId: string,
    curatorId: string,
    op: string,
    fn: (tx: Database) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await withTransaction(
          this.db,
          async (tx) => {
            await lockCollectionCurator(tx, collectionId, curatorId);
            return fn(tx);
          },
          { op, ctx: { collectionId, curatorId } },
        );
      } catch (error) {
        if (!isResultNumberConflict(error)) throw error;
        if (attempt === 4) throw new ResultNumberExhaustedError();
      }
    }
    throw new ResultNumberExhaustedError();
  }

  /** Lazily open the one draft (spec §4.3) — an empty row; pins add their own rows. */
  private async getOrCreateOpenDraft(tx: Database, collectionId: string, curatorId: string): Promise<SortResult> {
    const repo = new SortResultRepository(tx);
    const open = await repo.findDraftForUpdate(collectionId, curatorId);
    if (open) return open;
    const number = await repo.getNextResultNumber(collectionId);
    return repo.insertWithNumber({ collectionId, curatorId, name: OPEN_DRAFT_NAME, status: "draft", number });
  }

  /** Children first: the sort_result_items FK has no ON DELETE CASCADE. */
  private async deleteDrafts(tx: Database, collectionId: string, curatorId: string): Promise<void> {
    const resultRepo = new SortResultRepository(tx);
    const itemRepo = new SortResultItemRepository(tx);
    for (const draft of await resultRepo.findDrafts(collectionId, curatorId)) {
      await itemRepo.deleteByResult(draft.id);
      await resultRepo.delete(draft.id);
    }
  }

  // Invariant: tx-bound repos only — a write on this.sortResultRepo would not roll back.
  private async insertResultWithItems(
    tx: Database,
    collectionId: string,
    curatorId: string,
    name: string,
    items: MaterializedItem[],
    usageByItemId: ReadonlyMap<string, UsageAnswer>,
  ): Promise<SortResult> {
    const resultRepo = new SortResultRepository(tx);
    const itemRepo = new SortResultItemRepository(tx);
    const number = await resultRepo.getNextResultNumber(collectionId);
    const result = await resultRepo.insertWithNumber({ collectionId, curatorId, name, status: "draft", number });
    for (const item of items) {
      await itemRepo.create({ sortResultId: result.id, ...item, usage: usageByItemId.get(item.itemId) ?? null });
    }
    return result;
  }

  /** The open draft's pins (read-only — viewing the ranking creates nothing). */
  async listPins(collectionId: string, curatorId: string): Promise<Pin[]> {
    const draft = await this.sortResultRepo.findDraft(collectionId, curatorId);
    if (!draft) return [];
    return pinsFromRows(await this.sortResultItemRepo.findByResult(draft.id));
  }

  /** Hand-place one piece (spec §4 "Adjusting"); the first pin opens the draft. */
  async pinItem(collectionId: string, curatorId: string, itemId: string, position: number): Promise<void> {
    await this.inCuratorTx(collectionId, curatorId, "pin_ranking_item", async (tx) => {
      const pref = await new CollectionPreferenceItemRepository(tx).findByItem(itemId, curatorId);
      if (!pref || pref.collectionId !== collectionId || pref.rankBucket === "low") throw new PinTargetError();
      const draft = await this.getOrCreateOpenDraft(tx, collectionId, curatorId);
      const itemRepo = new SortResultItemRepository(tx);
      const row =
        (await itemRepo.findByResultAndItem(draft.id, itemId)) ??
        (await itemRepo.create({ sortResultId: draft.id, itemId, computedRank: position - 1, computedBucket: pref.rankBucket }));
      // manualRank is 0-based (existing convention); the API position is 1-based.
      await itemRepo.update(row.id, { manualRank: position - 1, manualBucket: null });
    });
  }

  /** Unpin: the piece returns to its derived place. Idempotent; opens nothing. */
  async unpinItem(collectionId: string, curatorId: string, itemId: string): Promise<void> {
    await this.inCuratorTx(collectionId, curatorId, "unpin_ranking_item", async (tx) => {
      const draft = await new SortResultRepository(tx).findDraftForUpdate(collectionId, curatorId);
      if (!draft) return;
      const itemRepo = new SortResultItemRepository(tx);
      const row = await itemRepo.findByResultAndItem(draft.id, itemId);
      if (row && row.manualRank !== null) await itemRepo.update(row.id, { manualRank: null, manualBucket: null });
    });
  }
```

Replace the body of `supersedeResult` after the two guards with:

```ts
    // Source is finalized/immutable, so reading its items pre-tx is benign.
    const sourceItems = await this.sortResultItemRepo.findByResult(id);
    const items = cloneItemsFrom(sourceItems);
    const usageByItemId = await this.deriveCuratorUsage(source.collectionId, source.curatorId, items);
    // Spec §4.4 "Make a revision opens a new copy to adjust": the copy becomes THE open
    // draft (replacing any other) with the saved loved order pinned, so the live
    // Ranking shows the saved order until the person moves or unpins something.
    const positions = savedOrderPositions(sourceItems);
    return this.inCuratorTx(source.collectionId, source.curatorId, "supersede_result", async (tx) => {
      await this.deleteDrafts(tx, source.collectionId, source.curatorId);
      const revision = await this.insertResultWithItems(
        tx, source.collectionId, source.curatorId, `${source.name} (Revision)`, items, usageByItemId,
      );
      const itemRepo = new SortResultItemRepository(tx);
      for (const row of await itemRepo.findByResult(revision.id)) {
        const position = positions.get(row.itemId);
        if (position !== undefined) await itemRepo.update(row.id, { manualRank: position - 1, manualBucket: null });
      }
      return revision;
    });
```

In `http-errors.ts` import `PinTargetError` from the service and add, beside
`ResultItemNotInResultError`:

```ts
  if (error instanceof ResultItemNotInResultError || error instanceof PinTargetError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
```

(and list `PinTargetError → 404` in the mapping comment).

- [ ] **Step 5: Controller + route.** `src/server/api/ranking.ts`:

```ts
import { z } from "zod";
import type { Database } from "@/lib/db";
import { SortResultService } from "@/server/services/SortResultService";
import type { Pin } from "@/server/services/sortResultMaterialization";

const PinSchema = z.strictObject({ position: z.number().int().min(1).max(10_000) });

/** The live Ranking's writes (spec §4). Curator is always the caller, never the body. */
export class RankingController {
  constructor(private service: SortResultService) {}

  static fromDb(db: Database): RankingController {
    return new RankingController(SortResultService.fromDb(db));
  }

  listPins(collectionId: string, curatorId: string): Promise<Pin[]> {
    return this.service.listPins(collectionId, curatorId);
  }

  pin(collectionId: string, curatorId: string, itemId: string, body: unknown): Promise<void> {
    const { position } = PinSchema.parse(body);
    return this.service.pinItem(collectionId, curatorId, itemId, position);
  }

  unpin(collectionId: string, curatorId: string, itemId: string): Promise<void> {
    return this.service.unpinItem(collectionId, curatorId, itemId);
  }
}
```

`src/app/api/collections/[id]/ranking/pins/[itemId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { RankingController } from "@/server/api/ranking";
import { errorResponse } from "@/server/api/http-errors";

type Params = { params: Promise<{ id: string; itemId: string }> };

// Hand-place one piece in the live ranking (spec §4 "Adjusting"). The first pin
// lazily opens the curator's one draft; later pins reuse it. Authz before body.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id, itemId } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    const body: unknown = await request.json();
    await RankingController.fromDb(db).pin(access.id, user.id, itemId, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

// Unpin: the piece goes back to its derived place. Idempotent.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, itemId } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    await RankingController.fromDb(db).unpin(access.id, user.id, itemId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

In `route-authz-enumeration.integration.test.ts`, after the dispositions block add:

```ts
    // ── /api/collections/[id]/ranking (UX redesign PR 2) ──────────────────
    // requireApiCollectionAccess → 403 for a non-member, before any body parse.
    c("collections/[id]/ranking/pins/[itemId]/route.ts", "PUT",
      `/api/collections/${collectionId}/ranking/pins/${itemAId}`,
      { id: collectionId, itemId: itemAId },
      { position: 1 }),
    c("collections/[id]/ranking/pins/[itemId]/route.ts", "DELETE",
      `/api/collections/${collectionId}/ranking/pins/${itemAId}`,
      { id: collectionId, itemId: itemAId }),
```

- [ ] **Step 6: Unit test wiring.** In `SortResultService.test.ts`: add
  `vi.mock("@/lib/transactions", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/transactions")>()), lockCollectionCurator: vi.fn() }));`
  next to the other mocks; add `findDrafts: vi.fn()` to `txResultRepo` and
  `findByResult: vi.fn(), update: vi.fn()` to `txItemRepo`; in `beforeEach` add
  `txResultRepo.findDrafts.mockResolvedValue([]); txItemRepo.findByResult.mockResolvedValue([]);`.
  In the first `createDraftResult` test, pass `{} as unknown as SortResultRepository` as the injected
  repo and add one
  `expect(txResultRepo.findDrafts).toHaveBeenCalledWith(COLLECTION, CURATOR);` (the first test has a
  single `findDrafts` assertion, at its line ~159; line ~147 is a comment — and keep
  `expect(txResultRepo.delete).not.toHaveBeenCalled();`). Add no further mock-wiring assertions: the
  DB tests own the behaviour. In the third test pass
  `{} as unknown as SortResultRepository` too.

- [ ] **Step 6b: Branch tests at the unit tier** (the DB test keeps one 404-foreign crossing).
  Create `src/server/api/ranking.test.ts` — body validation is pure Zod and needs no database:

```ts
import { describe, expect, it, vi } from "vitest";
import { RankingController } from "./ranking";
import type { SortResultService } from "@/server/services/SortResultService";

const pinItem = vi.fn().mockResolvedValue(undefined);
const controller = new RankingController({ pinItem } as unknown as SortResultService);

describe("RankingController.pin body", () => {
  it.each([[{ position: 0 }], [{ position: 1.5 }], [{ position: 1, extra: true }], [{}]])(
    "rejects %j before any write",
    (body) => {
      expect(() => controller.pin("c", "u", "i", body)).toThrow();
      expect(pinItem).not.toHaveBeenCalled();
    },
  );

  it("passes a valid 1-based position through", async () => {
    await controller.pin("c", "u", "i", { position: 3 });
    expect(pinItem).toHaveBeenCalledWith("c", "u", "i", 3);
  });
});
```

  In `SortResultService.test.ts` add, beside the other tx-bound repo mocks,
  `const { txPrefRepo } = vi.hoisted(() => ({ txPrefRepo: { findByItem: vi.fn() } }));` and
  `vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(function () { return txPrefRepo; }) }));`
  (the file already imports only the type), then a `describe("pinItem targets")` with two cases —
  `txPrefRepo.findByItem.mockResolvedValue(null)` (untriaged) and
  `mockResolvedValue(preference({ collectionId: COLLECTION, rankBucket: "low" }))` (Onward) — each
  `await expect(service.pinItem(COLLECTION, CURATOR, "item-1", 1)).rejects.toBeInstanceOf(PinTargetError)`
  and `expect(txResultRepo.insertWithNumber).not.toHaveBeenCalled()` (import `PinTargetError`).

- [ ] **Step 7: Run.** Step 2 command → PASS. `npx vitest run src/server` → PASS. Then
  `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/sort-results-pipeline.integration.test.ts src/lib/db/sort-pipeline.integration.test.ts src/lib/db/sort-results-usage-snapshot.integration.test.ts src/lib/db/route-authz-enumeration.integration.test.ts`
  → PASS. (The supersede and "at most one draft survives" tests keep passing: no prior draft
  exists in the first, and the reap still yields a new id in the second. In the usage-snapshot
  revision test, row A's saved bucket is Onward via its manual overlay, so it stays unpinned.)
- [ ] **Step 8:** `git add src/server src/app/api/collections src/lib/db && git commit -m "feat(ranking): pins open the one draft lazily; every draft writer holds the curator lock"`

## Task 5: Migration 0003 — one open draft per (collection, curator) + save key

**Files:** Modify `src/lib/db/schema.ts:330-355` (`sortResultsTable`), `scripts/migration-hashes.test.ts:21-28`.
Create (generated) `drizzle/0003_<drizzle-name>.sql`, `drizzle/meta/0003_snapshot.json`, journal entry.
Create `src/lib/db/sort-results-open-draft.integration.test.ts`.

**Interfaces:**
- Produces: column `sort_results.save_key text NULL`; unique index `sort_results_open_draft_unique`
  on `(collection_id, curator_id) WHERE status = 'draft'`; unique index
  `sort_results_save_key_unique` on `(curator_id, save_key) WHERE save_key IS NOT NULL`.
  The domain `SortResult` type is **unchanged** (the save key is read/written only by the
  repository methods in Task 6). No `deleted_at`; no reader changes.
- Data step (owner ruling, an amendment to spec §6 "no data rewrite"): before the open-draft index,
  the migration removes every open draft except the newest per `(collection_id, curator_id)`
  (`ORDER BY created_at DESC, id DESC`), `sort_result_items` first. `sort_results` has only the
  statuses `draft` and `finalized` (`SortResultStatus`), so there is no terminal status to move a
  duplicate to; removal matches what `createDraftResult` already does to a prior draft. Finalized
  rows, other curators, other collections and all answers are untouched.

- [ ] **Step 1: Know the blast radius (optional, read-only).** The owner may run in the Neon console
  against **production** to learn how many older drafts the data step will remove; record the number
  in the PR body. It is informational — the data step makes the index build unconditional.

```sql
SELECT collection_id, curator_id, count(*) AS drafts
FROM sort_results
WHERE status = 'draft'
GROUP BY collection_id, curator_id
HAVING count(*) > 1;
```

- [ ] **Step 2: Failing DB test** `src/lib/db/sort-results-open-draft.integration.test.ts`:

```ts
// @vitest-environment node
// Migration 0003 (spec §6): at most ONE open draft per (collection, curator). The
// service never relies on this to serialize — it holds the (collection, curator)
// advisory lock — the index is the backstop that makes a second draft impossible.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { sortResultItemsTable, sortResultsTable } from "@/lib/db/schema";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { isUniqueViolation } from "@/server/repositories/pg-conflict";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("sort_results: one open draft per (collection, curator)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("rejects a second draft for the same collection and curator", async () => {
    const repo = new SortResultRepository(getTestDb().db);
    const collectionId = await seedBareCollection(ownerId);
    await repo.create({ collectionId, curatorId: ownerId, name: "Open", status: "draft" });
    await expect(
      repo.create({ collectionId, curatorId: ownerId, name: "Second", status: "draft" }),
    ).rejects.toSatisfy((e: unknown) => isUniqueViolation(e, "sort_results_open_draft_unique"));
  });

  it("leaves saved rankings, other curators and other collections alone", async () => {
    const repo = new SortResultRepository(getTestDb().db);
    const collectionId = await seedBareCollection(ownerId);
    const elsewhere = await seedBareCollection(ownerId);
    const otherCurator = await seedUserRow("open-draft-other");
    await repo.create({ collectionId, curatorId: ownerId, name: "Saved", status: "finalized" });
    await repo.create({ collectionId, curatorId: ownerId, name: "Saved again", status: "finalized" });
    await repo.create({ collectionId, curatorId: ownerId, name: "Open", status: "draft" });
    await repo.create({ collectionId, curatorId: otherCurator, name: "Theirs", status: "draft" });
    await repo.create({ collectionId: elsewhere, curatorId: ownerId, name: "Elsewhere", status: "draft" });
    expect(await repo.findByCollection(collectionId)).toHaveLength(4);
  });

  // The 0003 data step on real rows: window function + partial unique index. The test
  // runs the migration FILE's own statements, so the shipped SQL is what is proven.
  it("0003's data step keeps the newest open draft per (collection, curator) and the index then builds", async () => {
    const { db } = getTestDb();
    const file = readdirSync("drizzle").find((f) => f.startsWith("0003_"))!;
    const statements = readFileSync(join("drizzle", file), "utf8").split("--> statement-breakpoint");
    const dedupe = statements.filter((q) => q.includes("row_number()"));
    const index = statements.find((q) => q.includes('CREATE UNIQUE INDEX "sort_results_open_draft_unique"'))!;
    expect(dedupe.length).toBeGreaterThan(0);

    const collectionId = await seedBareCollection(ownerId);
    const elsewhere = await seedBareCollection(ownerId);
    const otherCurator = await seedUserRow("open-draft-dedupe-other");
    const item = await new ItemRepository(db).create({ collectionId, name: "Piece" });
    const at = (n: number) => new Date(Date.UTC(2026, 0, n));
    const row = (id: string, cId: string, curatorId: string, number: number, status: string, day: number) =>
      ({ id, collectionId: cId, curatorId, number, status, name: id, createdAt: at(day), updatedAt: at(day) });

    try {
      await db.execute(sql`DROP INDEX IF EXISTS sort_results_open_draft_unique`);
      await db.insert(sortResultsTable).values([
        row("d1", collectionId, ownerId, 1, "draft", 1),
        row("d2", collectionId, ownerId, 2, "draft", 2),
        row("d3", collectionId, ownerId, 3, "draft", 3),
        row("theirs", collectionId, otherCurator, 4, "draft", 1),
        row("away", elsewhere, ownerId, 1, "draft", 1),
        row("saved", collectionId, ownerId, 5, "finalized", 1),
      ]);
      await db.insert(sortResultItemsTable).values(
        ["d1", "d3", "saved"].map((sortResultId) => ({
          sortResultId, itemId: item.id, computedRank: 0, computedBucket: "top",
        })),
      );

      for (const q of dedupe) await db.execute(sql.raw(q));
      await db.execute(sql.raw(index)); // building is the real assertion

      const ids = (await db.select({ id: sortResultsTable.id }).from(sortResultsTable)).map((r) => r.id).sort();
      expect(ids).toEqual(["away", "d3", "saved", "theirs"]);
      const kept = await db.select().from(sortResultItemsTable).where(eq(sortResultItemsTable.sortResultId, "d3"));
      expect(kept).toHaveLength(1); // the newest draft keeps its rows
      expect(await db.select().from(sortResultItemsTable)).toHaveLength(2); // d1's row went with d1; saved's stays
    } finally {
      await resetDb();
      await db.execute(sql.raw(index.replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS")));
    }
  });
});
```

- [ ] **Step 3:** `bash e2e/fixtures/test-db.sh up && RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/sort-results-open-draft.integration.test.ts`
  → FAIL (the second draft inserts).

- [ ] **Step 4: Schema + generate.** In `sortResultsTable` add the column after `finalizedAt` and the
  two indexes after `collectionNumberUnique` (`sql` is already imported in `schema.ts`):

```ts
    // Idempotency key of the Save-and-share that finalized this row (spec §4.4).
    // NULL for drafts and for rankings saved before PR 2.
    saveKey: text("save_key"),
```

```ts
    // Spec §4.3: one open draft per curator per collection. Every writer holds the
    // (collection, curator) advisory lock (SortResultService.inCuratorTx); this
    // index is the backstop, never the serializer.
    openDraftUnique: uniqueIndex("sort_results_open_draft_unique")
      .on(table.collectionId, table.curatorId)
      .where(sql`${table.status} = 'draft'`),
    saveKeyUnique: uniqueIndex("sort_results_save_key_unique")
      .on(table.curatorId, table.saveKey)
      .where(sql`${table.saveKey} is not null`),
```

  Run `npm run db:generate`. **Review the generated SQL** (`ls drizzle/0003_*.sql`): it must contain
  exactly one `ALTER TABLE "sort_results" ADD COLUMN "save_key" text;` and two
  `CREATE UNIQUE INDEX … WHERE …` statements — nothing that drops or alters existing columns. If
  drizzle-kit emitted anything else, fix `schema.ts`, delete the generated files and regenerate.

  **Then insert the data step by hand — the one reviewed edit to a generated migration.** Put these two
  statements immediately after the `ADD COLUMN` line and **before**
  `CREATE UNIQUE INDEX "sort_results_open_draft_unique"` (DML does not touch the snapshot JSON):

```sql
-- Data step (owner ruling, amends spec §6): keep the NEWEST open draft per (collection, curator)
-- and remove the rest (items first; no ON DELETE CASCADE), so the partial unique index below
-- can build on production data. Finalized rows, other curators and answers are untouched.
DELETE FROM "sort_result_items" WHERE "sort_result_id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "collection_id", "curator_id" ORDER BY "created_at" DESC, "id" DESC
    ) AS "rn"
    FROM "sort_results" WHERE "status" = 'draft'
  ) AS "ranked" WHERE "ranked"."rn" > 1
);--> statement-breakpoint
DELETE FROM "sort_results" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "collection_id", "curator_id" ORDER BY "created_at" DESC, "id" DESC
    ) AS "rn"
    FROM "sort_results" WHERE "status" = 'draft'
  ) AS "ranked" WHERE "ranked"."rn" > 1
);--> statement-breakpoint
```

  Final review checklist: one `ADD COLUMN`, exactly two `DELETE`s (the data step above, nothing else),
  two `CREATE UNIQUE INDEX … WHERE …`, no `DROP`/`ALTER COLUMN`. Pin the hash **after** the edit:
  `shasum -a 256 drizzle/0003_*.sql`, and add the line to `APPLIED` in
  `scripts/migration-hashes.test.ts`:

```ts
  "0003_<the generated name>.sql":
    "<the sha256 printed above>",
```

- [ ] **Step 5: Run.** Step 3 command → PASS (all three tests). `npx vitest run scripts/migration-hashes.test.ts`
  → PASS. Then fix the two known collisions with the new index before the whole suite
  (`createDraftResult` / `supersedeResult` already reap inside the locked transaction since Task 4, so
  service paths never trip it; only tests that seed two drafts directly do):
  - `src/lib/db/result-number.integration.test.ts:34-35` seeds two drafts for `u_r` in one collection —
    create the second (`r2`) as `status: "finalized"` (the test is about numbering, not drafts).
  - `src/lib/db/sort-results-rerank.integration.test.ts:227-229` seeds a sibling "Other" draft next to
    `seedResultWithItems`' draft — create "Other" as `status: "finalized"` (the IDOR proof only needs a
    different result id).
  Run `grep -rn 'status: "draft"' src/lib/db e2e/fixtures` once and confirm no other test seeds two
  drafts for one (collection, curator); then `npm run test:db` → PASS.
- [ ] **Step 6:** `git add src/lib/db drizzle scripts/migration-hashes.test.ts && git commit -m "feat(db): one open draft per collection and curator; save key for idempotent save"`

## Task 6: Save and share — one transaction, idempotent

**Files:** Modify `src/server/repositories/implementations/SortResultRepository.ts` (add
`findBySaveKey`, `markSaved`), `src/server/services/SortResultService.ts` (add `saveAndShare` + two errors),
`src/server/api/ranking.ts` (add `save`), `src/server/api/ranking.test.ts` (append), `src/server/api/http-errors.ts` (map the two errors to 409),
`src/lib/db/route-authz-enumeration.integration.test.ts`. Create
`src/app/api/collections/[id]/ranking/save/route.ts`, `src/lib/db/ranking-save-route.integration.test.ts`.

**Interfaces:**
- Consumes: `inCuratorTx`, `getOrCreateOpenDraft` (Task 4), `buildRanking`, `pinsFromRows` (Task 3), the `save_key`
  column (Task 5), `SortResultShareRepository.create/findByResult`,
  `SessionRepository.findInProgress/update`, `loadCuratorDecisionEvents`, `deriveUsage`.
- Produces: `SortResultRepository.findBySaveKey(curatorId, saveKey): Promise<SortResult | null>`,
  `markSaved(id, name, saveKey): Promise<SortResult>`;
  `saveAndShare(collectionId, curatorId, name, saveKey): Promise<SavedRanking>` where
  `interface SavedRanking { result: SortResult; shareToken: string; created: boolean }`;
  `NothingToSaveError`, `SaveKeyConflictError` (→ 409);
  `RankingController.save(collectionId, curatorId, body: unknown)` (body
  `z.strictObject({ name: z.string().trim().min(1).max(200), saveKey: ClientKey })`);
  `POST /api/collections/[id]/ranking/save` → `201 { resultNumber, shareToken }`, replay `200` same body.

- [ ] **Step 1: Failing DB test** `src/lib/db/ranking-save-route.integration.test.ts`:

```ts
// @vitest-environment node
// Save and share (spec §4.4), un-mocked: route -> RankingController ->
// SortResultService.saveAndShare -> repos -> Postgres. Mocks only auth + db.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultService } from "@/server/services/SortResultService";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as save } from "@/app/api/collections/[id]/ranking/save/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const KEY = "01j00000000000000000000000";
const KEY_2 = "01j00000000000000000000001";

const saveReq = (body: unknown) =>
  new Request("http://localhost/api/collections/c/ranking/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as any;

describeDb("save and share (route -> service -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  });
  afterAll(async () => {
    await closeDb();
  });

  /** b (Love, ordered first), a (Love, second), c (Onward) and an open session. */
  async function seedSorting() {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const items = new ItemRepository(db);
    const prefs = new CollectionPreferenceItemRepository(db);
    const a = (await items.create({ collectionId, name: "A" })).id;
    const b = (await items.create({ collectionId, name: "B" })).id;
    const c = (await items.create({ collectionId, name: "C" })).id;
    const base = { collectionId, curatorId: ownerId, score: 0.875, confidence: 1, comparisonCount: 1 };
    await prefs.create({ ...base, itemId: a, rankBucket: "top", orderRank: 1 });
    await prefs.create({ ...base, itemId: b, rankBucket: "top", orderRank: 0 });
    await prefs.create({ ...base, itemId: c, rankBucket: "low", score: 0.125 });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    return { collectionId, a, b, c, sessionId: session.id };
  }
  const savedOrder = async (resultId: string) =>
    (await new SortResultItemRepository(getTestDb().db).findByResult(resultId))
      .sort((x, y) => x.computedRank - y.computedRank)
      .map((r) => r.itemId);

  it("saves the live order with pins: one finalized ranking, a share link, the sort closed, no draft left", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    await SortResultService.fromDb(db).pinItem(s.collectionId, ownerId, s.a, 1);

    const res = await save(saveReq({ name: "  Spring keepers  ", saveKey: KEY }), ctx(s.collectionId));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { resultNumber: number; shareToken: string };

    const results = await new SortResultRepository(db).findByCollection(s.collectionId);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "finalized", name: "Spring keepers", number: body.resultNumber });
    expect(await savedOrder(results[0].id)).toEqual([s.a, s.b, s.c]);
    const shares = await new SortResultShareRepository(db).findByResult(results[0].id);
    expect(shares.map((x) => [x.shareToken, x.status])).toEqual([[body.shareToken, "active"]]);
    expect((await new SessionRepository(db).findById(s.sessionId))!.status).toBe("completed");
  });

  it("a retry with the same key returns the same link and creates nothing new", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const first = await (await save(saveReq({ name: "Once", saveKey: KEY }), ctx(s.collectionId))).json();
    const again = await save(saveReq({ name: "Once", saveKey: KEY }), ctx(s.collectionId));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    const results = await new SortResultRepository(db).findByCollection(s.collectionId);
    expect(results).toHaveLength(1);
    expect(await new SortResultShareRepository(db).findByResult(results[0].id)).toHaveLength(1);
  });

  it("a key already used in another collection is a 409", async () => {
    const s = await seedSorting();
    const other = await seedSorting();
    await save(saveReq({ name: "Here", saveKey: KEY }), ctx(s.collectionId));
    expect((await save(saveReq({ name: "There", saveKey: KEY }), ctx(other.collectionId))).status).toBe(409);
  });

  it("409s with nothing to save and writes nothing", async () => {
    const collectionId = await seedBareCollection(ownerId);
    expect((await save(saveReq({ name: "Empty", saveKey: KEY }), ctx(collectionId))).status).toBe(409);
    expect(await new SortResultRepository(getTestDb().db).findByCollection(collectionId)).toEqual([]);
  });

  it("rolls everything back when the share cannot be written (atomic)", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const spy = vi.spyOn(SortResultShareRepository.prototype, "create").mockRejectedValueOnce(new Error("share store down"));
    const res = await save(saveReq({ name: "Doomed", saveKey: KEY }), ctx(s.collectionId));
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await new SortResultRepository(db).findByCollection(s.collectionId)).toEqual([]);
    expect((await new SessionRepository(db).findById(s.sessionId))!.status).toBe("active");
  });

  it("a revision starts from the saved order, saves under its own link, and the old link keeps the old order", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const first = (await (await save(saveReq({ name: "First", saveKey: KEY }), ctx(s.collectionId))).json()) as { resultNumber: number; shareToken: string };
    const service = SortResultService.fromDb(db);
    const saved = await new SortResultRepository(db).findByCollectionAndNumber(s.collectionId, first.resultNumber);

    const revision = await service.supersedeResult(saved!.id);
    expect(revision!.status).toBe("draft");
    expect(new Map((await service.listPins(s.collectionId, ownerId)).map((p) => [p.itemId, p.position]))).toEqual(
      new Map([[s.b, 1], [s.a, 2]]),
    );

    await service.pinItem(s.collectionId, ownerId, s.a, 1);
    const second = (await (await save(saveReq({ name: "Second", saveKey: KEY_2 }), ctx(s.collectionId))).json()) as { resultNumber: number; shareToken: string };
    expect(second.shareToken).not.toBe(first.shareToken);

    const oldShare = await new SortResultShareRepository(db).findByToken(first.shareToken);
    expect(await savedOrder(oldShare!.sortResultId)).toEqual([s.b, s.a, s.c]);
    const newResult = await new SortResultRepository(db).findByCollectionAndNumber(s.collectionId, second.resultNumber);
    expect(await savedOrder(newResult!.id)).toEqual([s.a, s.b, s.c]);
  });
});
```

- [ ] **Step 2:** `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/ranking-save-route.integration.test.ts` → FAIL (route missing).

- [ ] **Step 3: Repository.** Add to `SortResultRepository` (the `save_key` column exists since Task 5):

```ts
  async findBySaveKey(curatorId: string, saveKey: string): Promise<SortResult | null> {
    const [row] = await this.db
      .select()
      .from(sortResultsTable)
      .where(and(eq(sortResultsTable.curatorId, curatorId), eq(sortResultsTable.saveKey, saveKey)));
    return row ? this.mapToResult(row) : null;
  }

  // Save-and-share's finalize: name, status, timestamp and the idempotency key in one write.
  async markSaved(id: string, name: string, saveKey: string): Promise<SortResult> {
    const now = new Date();
    const [row] = await this.db
      .update(sortResultsTable)
      .set({ name, saveKey, status: "finalized", finalizedAt: now, updatedAt: now })
      .where(eq(sortResultsTable.id, id))
      .returning();
    return this.mapToResult(row);
  }
```

  **Service.** Imports: `import { randomBytes } from "crypto";`,
  `ItemRepository`, `SortResultShareRepository`, and `buildRanking` (the `pinsFromRows` import already exists from Task 4) from the materialization module.

```ts
/** Nothing is ranked yet → 409 (the button is hidden then; this is the direct-API net). */
export class NothingToSaveError extends Error {
  constructor() {
    super("There's nothing to save yet — sort a few first.");
    this.name = "NothingToSaveError";
  }
}

/** A save key reused for another collection, or whose link was revoked → 409. */
export class SaveKeyConflictError extends Error {
  constructor() {
    super("That save already went through.");
    this.name = "SaveKeyConflictError";
  }
}

export interface SavedRanking {
  result: SortResult;
  shareToken: string;
  created: boolean;
}
```

```ts
  /**
   * Spec §4.4: ONE transaction — reuse-or-create the open draft, rebuild its rows
   * from the live ranking (pins applied, usage stamped), finalize it, close the
   * curator's open session, create the share link. Idempotent on `saveKey`: a
   * replay returns the same result and link and writes nothing.
   */
  async saveAndShare(collectionId: string, curatorId: string, name: string, saveKey: string): Promise<SavedRanking> {
    return this.inCuratorTx(collectionId, curatorId, "save_and_share", async (tx) => {
      const resultRepo = new SortResultRepository(tx);
      const shareRepo = new SortResultShareRepository(tx);

      const replay = await resultRepo.findBySaveKey(curatorId, saveKey);
      if (replay) {
        const share = (await shareRepo.findByResult(replay.id)).find((s) => s.status === "active");
        if (replay.collectionId !== collectionId || !share) throw new SaveKeyConflictError();
        return { result: replay, shareToken: share.shareToken, created: false };
      }

      const liveIds = new Set((await new ItemRepository(tx).findByCollection(collectionId)).map((i) => i.id));
      const preferences = await new CollectionPreferenceItemRepository(tx).findByCollection(collectionId, curatorId);
      const draft = await this.getOrCreateOpenDraft(tx, collectionId, curatorId);
      const itemRepo = new SortResultItemRepository(tx);
      const pins = pinsFromRows(await itemRepo.findByResult(draft.id));
      const { loved, onward } = buildRanking(preferences, liveIds, pins);
      const ordered = [...loved, ...onward];
      if (ordered.length === 0) throw new NothingToSaveError();

      const events = await loadCuratorDecisionEvents(new SessionRepository(tx), new DecisionEventRepository(tx), collectionId, curatorId);
      const usage = deriveUsage(events, new Set(ordered.map((e) => e.itemId)));
      await itemRepo.deleteByResult(draft.id);
      for (const [index, entry] of ordered.entries()) {
        await itemRepo.create({
          sortResultId: draft.id,
          itemId: entry.itemId,
          computedRank: index,
          computedBucket: entry.bucket,
          usage: usage.get(entry.itemId) ?? null,
        });
      }
      const result = await resultRepo.markSaved(draft.id, name, saveKey);

      const sessionRepo = new SessionRepository(tx);
      const open = await sessionRepo.findInProgress(collectionId, curatorId);
      if (open) await sessionRepo.update(open.id, { status: "completed" });

      const shareToken = randomBytes(32).toString("hex");
      await shareRepo.create({ sortResultId: result.id, shareToken });
      return { result, shareToken, created: true };
    });
  }
```

`ranking.ts` additions (`import { ClientKey } from "@/lib/decision-batch-schema";` and
`type SavedRanking` from the service):

```ts
const SaveSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  saveKey: ClientKey,
});
```

```ts
  save(collectionId: string, curatorId: string, body: unknown): Promise<SavedRanking> {
    const { name, saveKey } = SaveSchema.parse(body);
    return this.service.saveAndShare(collectionId, curatorId, name, saveKey);
  }
```

`http-errors.ts`: import both errors and add them to the 409 group
(`error instanceof NothingToSaveError || error instanceof SaveKeyConflictError`), and to the comment.

`src/app/api/collections/[id]/ranking/save/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { RankingController } from "@/server/api/ranking";
import { errorResponse } from "@/server/api/http-errors";

// Save and share (spec §4.4): one transaction, idempotent on body.saveKey —
// 201 when it saved, 200 with the same link on a replay. Authz before body parse.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireAuth();
    const db = getDb();
    const access = await requireApiCollectionAccess(db, id, user.id);
    if (access instanceof NextResponse) return access;
    const body: unknown = await request.json();
    const saved = await RankingController.fromDb(db).save(access.id, user.id, body);
    return NextResponse.json(
      { resultNumber: saved.result.number, shareToken: saved.shareToken },
      { status: saved.created ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
```

Enumeration test, in the ranking block:

```ts
    c("collections/[id]/ranking/save/route.ts", "POST",
      `/api/collections/${collectionId}/ranking/save`,
      { id: collectionId },
      { name: "Stranger", saveKey: "01j00000000000000000000000" }),
```

- [ ] **Step 3b: Body validation at the unit tier.** Append to `src/server/api/ranking.test.ts`
  (created in Task 4; the service is stubbed the same way as `pinItem`):

```ts
const saveAndShare = vi.fn();
const saver = new RankingController({ saveAndShare } as unknown as SortResultService);
const KEY = "01j00000000000000000000000";

describe("RankingController.save body", () => {
  it.each([[{ name: "   ", saveKey: KEY }], [{ name: "x", saveKey: "not-a-ulid" }], [{ name: "x" }], [{ name: "x", saveKey: KEY, extra: 1 }]])(
    "rejects %j before any write",
    (body) => {
      expect(() => saver.save("c", "u", body)).toThrow();
      expect(saveAndShare).not.toHaveBeenCalled();
    },
  );
});
```

- [ ] **Step 4: Run.** Step 2 command → PASS; `npx vitest run src/server/api/ranking.test.ts` → PASS;
  `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/route-authz-enumeration.integration.test.ts` → PASS;
  `npx vitest run src/server src/lib/__tests__/ui-route-connectivity.test.ts` → PASS.
- [ ] **Step 5:** `git add src/server src/app/api/collections src/lib/db && git commit -m "feat(ranking): save and share in one idempotent transaction"`

## Task 7: Start / Keep sorting and Pause

**Files:** Create `src/features/sessions/KeepSortingButton.tsx` (+ `.test.tsx`),
`src/features/sorting/PauseControl.tsx` (+ `.test.tsx`), `src/lib/db/sort-pause-resume.integration.test.ts`.

**Interfaces:**
- Consumes: `patchSessionStatus({ curatorId, sessionId }, status)` (`src/features/sorting/sessionStatusPatch.ts`),
  `AsyncActionButton` (`src/features/sorting/AsyncActionButton.tsx`), `POST /api/sessions`.
- Produces:
  `KeepSortingButton({ collectionId, curatorId, sortHref, session: { id: string; status: "active" | "paused" } | null })`
  — label "Start sorting" with no session, else "Keep sorting"; reactivates a paused session, creates
  one when none, then `router.push(sortHref)`.
  `PauseControl({ curatorId, sessionId, collectionHref })` — label "Pause"; pauses (bounded pre-flush)
  then `router.push(collectionHref)`.

- [ ] **Step 1: Failing tests.** `src/features/sessions/KeepSortingButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/features/sorting/decisionFlusher", () => ({
  drain: vi.fn().mockResolvedValue(undefined),
  triggerFlush: vi.fn().mockResolvedValue(undefined),
}));

import { KeepSortingButton } from "./KeepSortingButton";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "sess_new" }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const renderButton = (session: { id: string; status: "active" | "paused" } | null) =>
  render(<KeepSortingButton collectionId="coll_1" curatorId="u1" sortHref="/collections/bags/sort" session={session} />);

describe("KeepSortingButton (spec §4.1)", () => {
  it("with no sort open: Start sorting creates one, then opens the sort", async () => {
    renderButton(null);
    await userEvent.click(screen.getByRole("button", { name: "Start sorting" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/sort"));
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({ method: "POST", body: JSON.stringify({ collectionId: "coll_1" }) }));
  });

  it("a paused sort: Keep sorting reactivates it first", async () => {
    renderButton({ id: "sess_1", status: "paused" });
    await userEvent.click(screen.getByRole("button", { name: "Keep sorting" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/sort"));
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/sess_1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "active" }) }));
  });

  it("an active sort: Keep sorting just opens it", async () => {
    renderButton({ id: "sess_1", status: "active" });
    await userEvent.click(screen.getByRole("button", { name: "Keep sorting" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/sort"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a sort opened elsewhere (409) is simply joined", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({}) });
    renderButton(null);
    await userEvent.click(screen.getByRole("button", { name: "Start sorting" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags/sort"));
  });

  it("a failure says so gently and stays put", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    renderButton(null);
    await userEvent.click(screen.getByRole("button", { name: "Start sorting" }));
    expect(await screen.findByRole("status")).toHaveTextContent("That didn't go through — give it another try in a moment.");
    expect(push).not.toHaveBeenCalled();
  });
});
```

`src/features/sorting/PauseControl.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("./decisionFlusher", () => ({
  drain: vi.fn().mockResolvedValue(undefined),
  triggerFlush: vi.fn().mockResolvedValue(undefined),
}));

import { PauseControl } from "./PauseControl";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
});

describe("PauseControl (spec §4.2: Pause returns home, session paused)", () => {
  it("PATCHes {status:'paused'}, then goes home", async () => {
    render(<PauseControl curatorId="u1" sessionId="sess_1" collectionHref="/collections/bags" />);
    fireEvent.click(screen.getByRole("button", { name: /^pause/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/bags"));
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/sess_1");
    expect(JSON.parse(init.body)).toEqual({ status: "paused" });
  });

  it("a double tap sends one PATCH", async () => {
    render(<PauseControl curatorId="u1" sessionId="sess_1" collectionHref="/collections/bags" />);
    const button = screen.getByRole("button", { name: /^pause/i });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });
});
```

`src/lib/db/sort-pause-resume.integration.test.ts`:

```ts
// @vitest-environment node
// Spec §7 "Pause keeps progress; Keep sorting resumes paused" — the real session
// PATCH route over Postgres, then the same phase chooser the Sort screen runs.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionController } from "@/server/api/decisions";
import { chooseSortPhase } from "@/lib/sort-phase";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { PATCH as patchSession } from "@/app/api/sessions/[id]/route";
import { POST as postDecision } from "@/app/api/sessions/[id]/decisions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const json = (body: unknown) =>
  new Request("http://localhost/api/sessions/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patch = (body: unknown) =>
  new Request("http://localhost/api/sessions/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describeDb("pause keeps progress; Keep sorting resumes the paused sort", () => {
  let ownerId: string;
  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  });
  afterAll(async () => {
    await closeDb();
  });

  it("an answer given before Pause is still there after Keep sorting, and the sort picks up after it", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const items = new ItemRepository(db);
    const first = await items.create({ collectionId, name: "First" });
    await items.create({ collectionId, name: "Second" });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    const params = { params: Promise.resolve({ id: session.id }) } as any;

    expect((await postDecision(json({ type: "triage", decision: { itemId: first.id, result: "top" } }) as any, params)).status).toBe(201);
    expect((await patchSession(patch({ status: "paused" }) as any, params)).status).toBe(200);
    expect((await new SessionRepository(db).findById(session.id))!.status).toBe("paused");
    expect((await patchSession(patch({ status: "active" }) as any, params)).status).toBe(200);
    expect((await new SessionRepository(db).findById(session.id))!.status).toBe("active");

    const phase = chooseSortPhase({
      items: await items.findByCollection(collectionId),
      preferences: await new CollectionPreferenceItemRepository(db).findByCollection(collectionId, ownerId),
      dispositionByItemId: new Map(),
      curatorDecisions: await DecisionController.fromDb(db).listForCurator(collectionId, ownerId),
      deferredOffered: false,
    });
    expect(phase.kind === "feelings" && phase.queue.map((e) => e.item.name)).toEqual(["Second"]);
    expect(phase.progress).toEqual({ done: 1, total: 2 });
  });
});
```

- [ ] **Step 2:** `npx vitest run src/features/sessions/KeepSortingButton.test.tsx src/features/sorting/PauseControl.test.tsx`
  → FAIL (modules missing). The DB test passes already (it pins existing route behaviour for the new
  flow — keep it; it is the §7 crossing).
- [ ] **Step 3: Implement.** `src/features/sessions/KeepSortingButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { patchSessionStatus } from "@/features/sorting/sessionStatusPatch";

interface KeepSortingButtonProps {
  /** ULID collection.id (the sessions API never takes the slug). */
  collectionId: string;
  curatorId: string;
  sortHref: string;
  session: { id: string; status: "active" | "paused" } | null;
}

const STUMBLE = "That didn't go through — give it another try in a moment.";

// The collection's one sort action (spec §4.1): "Keep sorting" resumes the open
// sort (reactivating a paused one); otherwise "Start sorting" opens a new one with
// the server's defaults. A 409 means a sort was opened elsewhere — just join it.
export function KeepSortingButton({ collectionId, curatorId, sortHref, session }: KeepSortingButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function go() {
    setBusy(true);
    setMessage("");
    try {
      if (session?.status === "paused") {
        const res = await patchSessionStatus({ curatorId, sessionId: session.id }, "active");
        if (!res.ok) throw new Error("resume");
      } else if (session === null) {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collectionId }),
        });
        if (!res.ok && res.status !== 409) throw new Error("start");
      }
      router.push(sortHref); // stays disabled through the navigation
    } catch {
      setMessage(STUMBLE);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={go} disabled={busy} className="w-full sm:w-auto">
        {session ? "Keep sorting" : "Start sorting"}
      </Button>
      {message && (
        <p role="status" className="text-sm text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
```

`src/features/sorting/PauseControl.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "./AsyncActionButton";
import { patchSessionStatus } from "./sessionStatusPatch";

// Spec §4.2: Pause returns home with the sort paused; nothing is lost and Keep
// sorting picks it up. No confirm — stepping away is reversible (TONE). The PATCH
// best-effort pre-flushes queued answers but never waits on a slow network.
export function PauseControl({
  curatorId,
  sessionId,
  collectionHref,
}: {
  curatorId: string;
  sessionId: string;
  collectionHref: string;
}) {
  const router = useRouter();
  return (
    <AsyncActionButton
      label="Pause"
      align="end"
      ariaLabel="Pause — your place is kept"
      action={async () => {
        const res = await patchSessionStatus({ curatorId, sessionId }, "paused");
        if (!res.ok) throw new Error("pause failed");
        router.push(collectionHref);
      }}
    />
  );
}
```

- [ ] **Step 4:** Step 2 command → PASS. `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/sort-pause-resume.integration.test.ts` → PASS.
- [ ] **Step 5:** `git add src/features/sessions/KeepSortingButton* src/features/sorting/PauseControl* src/lib/db/sort-pause-resume.integration.test.ts && git commit -m "feat(sort): Start/Keep sorting and Pause"`

## Task 8: The Sort screen replaces the round pages (feelings, pairs, end)

**Files:**
- Rewrite: `src/app/collections/[id]/sort/page.tsx`, `src/features/sorting/useOptimisticRound.ts`,
  `src/features/sorting/TriageRound.tsx`, `src/features/sorting/TriageRound.test.tsx`.
- Create: `src/features/sorting/SortProgress.tsx`, `src/lib/collections/retired-redirect.ts`.
- Replace with guarded redirects: `src/app/collections/[id]/sort/new/page.tsx`,
  `sort/[sessionNumber]/page.tsx`, `sort/[sessionNumber]/triage/page.tsx`,
  `sort/[sessionNumber]/usage/page.tsx`, `sort/[sessionNumber]/compare/page.tsx`, `sort/set-aside/page.tsx`.
- Modify: `src/components/layout/breadcrumb-trails.ts` (+ test), `src/lib/db/page-authz-enumeration.integration.test.ts`,
  `src/app/globals.css` (ring tokens, lines ~29-30, ~132-135, ~230-231), `src/lib/design/contrast.test.ts:101` (delete) and `:102` (relabel),
  `DESIGN.md:101` (the "Ring — timer violet" bullet).
- Delete (with tests): sort/landing + hub + round page tests; `UsageRound`, `RoundSurface`,
  `RoundShell`, `RoundTimer`, `TimerRing`, `TimerDial`, `RoundLengthDialog`, `round-dial`, `WhatMoved`,
  `StartSessionForm`, `SortHelpDialog`, `TakeABreakControl` (sorting); `RecommendedRound`,
  `RecommendedRoundCard`, `SeeResultsCard`, `SessionAnalytics`, `StartSortingButton` (sessions);
  `next-round`, `round-timer`, `round-preference`, `usage-selection`, `usage-round-prefs`, `what-moved` (lib).

**Interfaces:**
- Consumes: `chooseSortPhase` (Task 2), `PauseControl`, `KeepSortingButton` (Task 7),
  `TriageUndoProvider`/`TriageUndoNotice`/`useOptionalTriageUndo`, `DecisionControls`, `DeferControl`,
  `SetAsideButton`, `CompareChoice` (unchanged until Task 9), `drain(keys)` (`decisionFlusher`).
- Produces: `TriageRound({ curatorId, sessionId, collectionId, collectionSlugOrId, queue, placedSeed, nextHref })`
  (`TriageRoundQueueEntry` unchanged); `SortProgress({ done, total })`;
  `useOptimisticRound({ curatorId, sessionId, collectionId, decisionType, fallbackBody, labelFor })`
  returning `{ key, stumble, submitDecision, revisit, canGoBack, lastLabel, goBack, clearRevisit }`;
  `redirectRetired(id: string, to: "sort" | "results"): Promise<never>`.

- [ ] **Step 1: Failing tests.** Replace `src/features/sorting/TriageRound.test.tsx` with:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Item } from "@/types";
import { readQueue, type QueueKey } from "./decisionQueue";
import { TriageRound, type TriageRoundQueueEntry } from "./TriageRound";
import { TriageUndoProvider } from "./TriageUndoProvider";
import { TriageUndoNotice } from "./TriageUndoNotice";

const { refresh, push, replace } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push, replace }) }));

// The flusher is mocked (call counts / ordering); the queue module stays REAL so
// persist-before-advance is asserted against actual localStorage writes.
const flusher = vi.hoisted(() => ({
  triggerFlush: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  drain: vi.fn(() => Promise.resolve()),
  useDecisionFlusher: vi.fn(),
  subscribeNotices: vi.fn(() => () => {}),
  awaitAck: vi.fn(() => new Promise(() => {})),
  isInFlight: vi.fn(() => false),
}));
vi.mock("./decisionFlusher", () => flusher);

function installStorage(): Storage {
  const map = new Map<string, string>();
  const store: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
  Object.defineProperty(window, "localStorage", { value: store, configurable: true });
  return store;
}

const item = (id: string, name: string): Item =>
  ({ id, collectionId: "coll_1", name, brand: null, style: null, color: null, material: null, category: null, number: null, height: null, width: null, depth: null, weight: null, unit: "imperial", status: null, notes: null, createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null }) as Item;
const entry = (id: string, name: string, deferred = false): TriageRoundQueueEntry => ({ item: item(id, name), deferred, heroPhotoUrl: `/photos/${id}.jpg` });

const KEY: QueueKey = { curatorId: "u1", sessionId: "sess_1", collectionId: "coll_1" };
const NEXT = "/collections/bags/sort?phase=pairs";

function props(over: Partial<Parameters<typeof TriageRound>[0]> = {}) {
  return {
    curatorId: "u1",
    sessionId: "sess_1",
    collectionId: "coll_1",
    collectionSlugOrId: "bags",
    queue: [entry("item_a", "Bag A"), entry("item_b", "Bag B")],
    placedSeed: 0,
    nextHref: NEXT,
    ...over,
  };
}
const renderRound = (over: Partial<Parameters<typeof TriageRound>[0]> = {}) => render(<TriageRound {...props(over)} />);
const renderWithUndo = (over: Partial<Parameters<typeof TriageRound>[0]> = {}) =>
  render(
    <TriageUndoProvider curatorId="u1" sessionId="sess_1" collectionId="coll_1">
      <TriageUndoNotice />
      <TriageRound {...props(over)} />
    </TriageUndoProvider>,
  );

let store: Storage;
beforeEach(() => {
  vi.clearAllMocks();
  flusher.triggerFlush.mockImplementation(() => Promise.resolve());
  flusher.drain.mockImplementation(() => Promise.resolve());
  flusher.awaitAck.mockImplementation(() => new Promise(() => {}));
  flusher.isInFlight.mockReturnValue(false);
  store = installStorage();
  global.fetch = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) })) as unknown as typeof fetch;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("feelings phase: answers advance optimistically", () => {
  it("announces the saved tier in the live region that existed before the tap (SC 4.1.3)", async () => {
    const user = userEvent.setup();
    renderRound();
    const region = screen.getByRole("status");
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Love — saved.");
  });

  it("persists each answer before the next piece shows, never fetches, never refreshes", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(readQueue(KEY)).toEqual([expect.objectContaining({ kind: "decision", type: "triage", decision: { itemId: "item_a", result: "top" } })]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("when every piece has passed through, lands the answers and hands off to pairs once", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Like", exact: true }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(NEXT));
    expect(flusher.drain).toHaveBeenCalledWith([KEY]);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("feelings phase: Not yet and Not mine", () => {
  it("Not yet moves the piece to the end of the phase, where it returns with 'Ready when you are.'", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: /^not yet/i }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.getByText("Ready when you are.")).toBeInTheDocument();
  });

  it("a second Not yet lets a returning piece rest and the phase hands off", async () => {
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A")] });
    await user.click(screen.getByRole("button", { name: /^not yet/i }));
    expect(await screen.findByText("Ready when you are.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^not yet/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(NEXT));
    expect(readQueue(KEY)).toEqual([expect.objectContaining({ kind: "disposition", itemId: "item_a", disposition: "deferred" })]);
  });

  it("Not mine advances at once and the disposition rides the queue", async () => {
    const user = userEvent.setup();
    renderWithUndo();
    await user.click(screen.getByRole("button", { name: /^not mine/i }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    await waitFor(() => expect(readQueue(KEY)).toEqual([expect.objectContaining({ kind: "disposition", itemId: "item_a", disposition: "set_aside" })]));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("Bring back returns the set-aside piece to this phase", async () => {
    const user = userEvent.setup();
    renderWithUndo();
    await user.click(screen.getByRole("button", { name: /^not mine/i }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: /bring back/i }));
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    await waitFor(() => expect(readQueue(KEY)).toEqual([]));
  });
});

describe("feelings phase: Undo (spec §4 — 'Undo: Love')", () => {
  it("a still-queued answer: Undo names it, removes it and shows the piece fresh", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(readQueue(KEY)).toEqual([]);
    expect(screen.getByRole("button", { name: "Love", exact: true })).not.toHaveAttribute("aria-pressed");
    expect(screen.queryByRole("button", { name: /^undo:/i })).not.toBeInTheDocument();
  });

  it("an answer already sent: shown selected; a different tap supersedes it with a fresh key", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "created" }));
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    const [first] = readQueue(KEY);
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    expect(await screen.findByText(/you placed this with love — change it\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Love", exact: true })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Maybe", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    const queued = readQueue(KEY);
    expect(queued).toHaveLength(2);
    expect(queued[1].clientKey).not.toBe(first.clientKey);
    expect(queued[1]).toMatchObject({ decision: { itemId: "item_a", result: "medium" } });
  });

  it("'Keep going' walks away from a standing answer without re-answering", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "created" }));
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    await user.click(await screen.findByRole("button", { name: /keep going/i }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(readQueue(KEY)).toHaveLength(1);
  });

  it("a rejected answer has nothing to undo", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "rejected", reason: "unknown_item" }));
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    expect(screen.getByRole("img", { name: "Bag B" })).toBeInTheDocument();
  });
});

describe("feelings phase: numberless progress", () => {
  it("counts placed pieces for screen readers; Not yet leaves the denominator", async () => {
    const user = userEvent.setup();
    renderRound({ placedSeed: 1 });
    expect(screen.getByText("1 of 3 placed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByText("2 of 3 placed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^not yet/i }));
    expect(await screen.findByText("2 of 2 placed")).toBeInTheDocument();
    expect(screen.queryByText(/decided so far/)).not.toBeInTheDocument();
  });
});

describe("feelings phase: storage fallback (F18)", () => {
  it("degrades to ONE awaited single-route POST and advances on its ack", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/sess_1/decisions");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ type: "triage", decision: { itemId: "item_a", result: "top" } });
  });

  it("a fallback that does not land keeps the piece in place with a gentle line", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByText(/give it another try in a moment/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bag A" })).toBeInTheDocument();
  });
});
```

In `page-authz-enumeration.integration.test.ts`, after the edit/photos member test, add:

```ts
    it("retired sort pages send a member on to the Sort screen (set-aside to the Ranking)", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const base = `/collections/slug-${collectionId}`;
      const outcome = async (page: string) => {
        const mod = (await import(/* @vite-ignore */ `@/app/collections/[id]/${page}/page`)) as {
          default: (p: { params: Promise<Record<string, string>> }) => Promise<unknown>;
        };
        return mod
          .default({ params: Promise.resolve({ id: collectionId, sessionNumber: "1" }) })
          .catch((e: Error) => e.message);
      };
      try {
        for (const page of ["sort/new", "sort/[sessionNumber]", "sort/[sessionNumber]/triage", "sort/[sessionNumber]/usage", "sort/[sessionNumber]/compare"]) {
          expect(await outcome(page), page).toBe(`NEXT_PERMANENT_REDIRECT:${base}/sort`);
        }
        expect(await outcome("sort/set-aside")).toBe(`NEXT_PERMANENT_REDIRECT:${base}/results`);
      } finally {
        mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      }
    });
```

Update the comment above the `sort/…` stranger cases to "Retired by the one Sort screen (spec §4):
guard first, then permanentRedirect — the stranger is still bounced by the guard."

- [ ] **Step 2:** `npx vitest run src/features/sorting/TriageRound.test.tsx` → FAIL (old props; Undo
  label, progress and hand-off missing). The DB enumeration test fails too (pages still render).

- [ ] **Step 3: Engine.** Replace `src/features/sorting/useOptimisticRound.ts` with:

```ts
"use client";

import { useMemo, useRef, useState } from "react";
import { enqueue, newClientKey, removeQueued, type PendingEntry, type QueueKey } from "./decisionQueue";
import { awaitAck, isInFlight, triggerFlush, useDecisionFlusher, type AckOutcome } from "./decisionFlusher";

// TONE register — a gentle stumble, never "error"/"failed".
export const STUMBLE_LINE = "That didn't go through — give it another try in a moment.";

type DecisionType = Extract<PendingEntry, { kind: "decision" }>["type"];

interface RevisitState {
  itemId: string;
  clientKey: string;
  label: string;
}

/** Undo of a still-queued answer: the caller un-advances and un-counts this piece. */
interface RepresentFresh {
  itemId: string;
}

export interface UseOptimisticRoundOptions<D extends Record<string, unknown>> {
  curatorId: string;
  sessionId: string;
  /** ULID collection.id — the queue key (never the slug). */
  collectionId: string;
  decisionType: DecisionType;
  /** The single-route POST body when localStorage is unavailable (F18). */
  fallbackBody: (decision: D, clientKey: string) => Record<string, unknown>;
  /** The person's word for the answer, shown on Undo ("Love"). */
  labelFor: (itemId: string, decision: D) => string;
}

export interface OptimisticRound<D extends Record<string, unknown>> {
  key: QueueKey;
  stumble: boolean;
  /** Persist-before-advance: resolves true once the answer is safe, false to stay put. */
  submitDecision: (itemId: string, decision: D) => Promise<boolean>;
  revisit: RevisitState | null;
  canGoBack: boolean;
  /** The last answer's label for "Undo: …"; null when there is none. */
  lastLabel: string | null;
  goBack: () => RepresentFresh | null;
  clearRevisit: () => void;
}

/**
 * The feelings phase's answer engine (Epic P pipeline, kept): flusher wiring,
 * persist-before-advance with the storage fallback, and Undo. A still-queued
 * answer is removed outright; one already sent is re-presented with its choice
 * selected, and the next tap supersedes it (the log is append-only, latest wins).
 */
export function useOptimisticRound<D extends Record<string, unknown>>({
  curatorId,
  sessionId,
  collectionId,
  decisionType,
  fallbackBody,
  labelFor,
}: UseOptimisticRoundOptions<D>): OptimisticRound<D> {
  const key = useMemo<QueueKey>(() => ({ curatorId, sessionId, collectionId }), [curatorId, sessionId, collectionId]);
  useDecisionFlusher(key);
  const [answers, setAnswers] = useState<Array<{ clientKey: string; itemId: string; label: string }>>([]);
  // Ack outcomes as they land, so Undo can tell a standing answer from a rejected one.
  const outcomesRef = useRef(new Map<string, AckOutcome>());
  const [revisit, setRevisit] = useState<RevisitState | null>(null);
  const [stumble, setStumble] = useState(false);
  const busyRef = useRef(false);

  async function submitDecision(itemId: string, decision: D): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      setStumble(false);
      const clientKey = newClientKey();
      const persisted = await enqueue(
        key,
        { kind: "decision", clientKey, type: decisionType, decision, enqueuedAt: new Date().toISOString() },
        () => triggerFlush(key), // quota → shrink the queue, retry once (F18)
      );
      if (persisted === "needs_fallback") {
        let landed = false;
        try {
          const res = await fetch(`/api/sessions/${sessionId}/decisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fallbackBody(decision, clientKey)),
          });
          landed = res.ok;
        } catch {
          landed = false;
        }
        if (!landed) {
          setStumble(true);
          return false;
        }
        outcomesRef.current.set(clientKey, { status: "created" });
      } else {
        void awaitAck(key, clientKey).then((o) => outcomesRef.current.set(clientKey, o));
      }
      setAnswers((prev) => [...prev, { clientKey, itemId, label: labelFor(itemId, decision) }]);
      setRevisit(null);
      return true;
    } finally {
      busyRef.current = false;
    }
  }

  function goBack(): RepresentFresh | null {
    if (revisit !== null) return null;
    const last = answers[answers.length - 1];
    if (last === undefined) return null;
    const outcome = outcomesRef.current.get(last.clientKey);
    if (outcome?.status === "rejected") return null;
    if (outcome === undefined && !isInFlight(key, last.clientKey) && removeQueued(key, last.clientKey)) {
      setAnswers((prev) => prev.slice(0, -1));
      return { itemId: last.itemId };
    }
    setRevisit({ itemId: last.itemId, clientKey: last.clientKey, label: last.label });
    return null;
  }

  const last = answers[answers.length - 1];
  return {
    key,
    stumble,
    submitDecision,
    revisit,
    canGoBack: revisit === null && last !== undefined,
    lastLabel: last?.label ?? null,
    goBack,
    clearRevisit: () => setRevisit(null),
  };
}
```

`src/features/sorting/SortProgress.tsx`:

```tsx
/** Spec §4: a thin, numberless progress line — the count is for screen readers only. */
export function SortProgress({ done, total }: { done: number; total: number }) {
  const percent = total === 0 ? 100 : Math.min(100, Math.round((done / total) * 100));
  return (
    <div>
      <div aria-hidden className="h-1 w-full overflow-hidden rounded-pill bg-content-soft">
        <div
          className="h-full rounded-pill bg-primary transition-[width] duration-300 ease-gentle motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="sr-only" aria-live="polite">{`${done} of ${total} placed`}</p>
    </div>
  );
}
```

- [ ] **Step 4: Feelings phase.** Replace `src/features/sorting/TriageRound.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import { Button, Card } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { DecisionControls } from "./DecisionControls";
import { triageDecisions, type TriageResult } from "./roundCopy";
import { DeferControl } from "./DeferControl";
import { SetAsideButton } from "./SetAsideButton";
import { useOptionalTriageUndo } from "./TriageUndoProvider";
import { enqueue, newClientKey } from "./decisionQueue";
import { drain, triggerFlush } from "./decisionFlusher";
import { STUMBLE_LINE, useOptimisticRound } from "./useOptimisticRound";
import { PendingNotices } from "./pendingNotices";
import { SortProgress } from "./SortProgress";

export interface TriageRoundQueueEntry {
  item: Item;
  deferred: boolean;
  heroPhotoUrl?: string;
}

const add = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => new Set(set).add(id);
const without = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(set);
  next.delete(id);
  return next;
};

interface TriageRoundProps {
  curatorId: string;
  sessionId: string;
  /** ULID collection.id — the queue key + disposition endpoint (never the slug). */
  collectionId: string;
  /** collection.slug ?? collection.id — ItemCard's link base. */
  collectionSlugOrId: string;
  /** chooseSortPhase's feelings queue: active pieces first, then Not yet ones. */
  queue: TriageRoundQueueEntry[];
  /** Live pieces already placed before this visit (the progress seed). */
  placedSeed: number;
  /** Where the phase hands off once every piece has passed through (…/sort?phase=pairs). */
  nextHref: string;
}

/**
 * The feelings phase (spec §4): "How do you feel about this one?" for every live
 * piece, once. Answers advance from local state (persist-before-advance); Not yet
 * sends a piece to the end of the phase, and a second Not yet lets it rest; Not
 * mine sets it aside (with Bring back). When every piece has passed through, the
 * answers are landed and the screen hands off to pairs.
 */
export function TriageRound({ curatorId, sessionId, collectionId, collectionSlugOrId, queue, placedSeed, nextHref }: TriageRoundProps) {
  const router = useRouter();
  const [seed] = useState(placedSeed);
  const [deferredAtMount] = useState(() => new Set(queue.filter((e) => e.deferred).map((e) => e.item.id)));
  const [entries, setEntries] = useState<TriageRoundQueueEntry[]>(queue);
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [placed, setPlaced] = useState<ReadonlySet<string>>(new Set());
  const [escaped, setEscaped] = useState<ReadonlySet<string>>(new Set());
  const undoCtx = useOptionalTriageUndo();

  const current = entries.find((e) => !handled.has(e.item.id));
  const round = useOptimisticRound<{ itemId: string; result: TriageResult }>({
    curatorId,
    sessionId,
    collectionId,
    decisionType: "triage",
    fallbackBody: (decision, clientKey) => ({ type: "triage", decision, clientKey }),
    labelFor: (itemId, decision) =>
      triageDecisions(itemId).find((t) => t.decision.result === decision.result)?.label ?? decision.result,
  });
  const { key, revisit } = round;

  // Bring back (provider's undo cleared) returns the piece to this phase.
  const lastUndoRef = useRef(undoCtx?.undo ?? null);
  const undoNow = undoCtx?.undo ?? null;
  useEffect(() => {
    const prev = lastUndoRef.current;
    lastUndoRef.current = undoNow;
    if (prev === null || undoNow !== null || !handled.has(prev.itemId)) return;
    setHandled((h) => without(h, prev.itemId));
    setEscaped((e) => without(e, prev.itemId));
  }, [undoNow, handled]);

  const revisitEntry = revisit === null ? undefined : entries.find((e) => e.item.id === revisit.itemId);
  const shown = revisitEntry ?? current;

  // Every piece has passed through: land the answers, then on to pairs (once).
  const handedOff = useRef(false);
  useEffect(() => {
    if (shown !== undefined || handedOff.current) return;
    handedOff.current = true;
    void drain([key]).finally(() => router.replace(nextHref));
  }, [shown, key, nextHref, router]);

  async function handleTriage(target: Item, decision: { itemId: string; result: TriageResult }) {
    if (!(await round.submitDecision(target.id, decision))) return;
    setPlaced((p) => add(p, target.id));
    setEscaped((e) => without(e, target.id));
    setHandled((h) => add(h, target.id));
  }

  function undo() {
    const fresh = round.goBack();
    if (fresh === null) return;
    setPlaced((p) => without(p, fresh.itemId));
    setHandled((h) => without(h, fresh.itemId));
  }

  async function handleNotYet(target: TriageRoundQueueEntry) {
    setEscaped((e) => add(e, target.item.id));
    if (target.deferred) {
      // Already waited once this visit (or came back waiting): let it rest so the phase can end.
      setHandled((h) => add(h, target.item.id));
      return;
    }
    const persisted = await enqueue(
      key,
      { kind: "disposition", clientKey: newClientKey(), itemId: target.item.id, disposition: "deferred", enqueuedAt: new Date().toISOString() },
      () => triggerFlush(key),
    );
    if (persisted === "needs_fallback") {
      try {
        await fetch(`/api/collections/${collectionId}/dispositions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: target.item.id, disposition: "deferred" }),
        });
      } catch {
        // best-effort: the piece still waits at the end and returns next visit
      }
    }
    setEntries((prev) => [...prev.filter((e) => e.item.id !== target.item.id), { ...target, deferred: true }]);
  }

  function handleNotMine(target: Item) {
    if (undoCtx) void undoCtx.setAside(target.id, target.name);
    setEscaped((e) => add(e, target.id));
    setHandled((h) => add(h, target.id));
  }

  const done = seed + placed.size;
  const total =
    seed +
    (queue.length - deferredAtMount.size) +
    [...placed].filter((id) => deferredAtMount.has(id)).length -
    [...escaped].filter((id) => !deferredAtMount.has(id)).length;

  return (
    <div className="space-y-6">
      <SortProgress done={done} total={total} />
      <PendingNotices />
      {shown === undefined ? (
        <p role="status" className="text-sm text-ink-soft">
          Just a moment…
        </p>
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl text-ink">How do you feel about this one?</h1>
            {round.canGoBack && (
              <button
                type="button"
                onClick={undo}
                className="mt-1 inline-flex h-11 items-center rounded-control text-sm text-ink-soft transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
              >
                Undo: {round.lastLabel}
              </button>
            )}
          </div>

          {round.stumble && (
            <p role="status" className="text-sm text-ink-soft">
              {STUMBLE_LINE}
            </p>
          )}

          {shown.deferred && (
            <div className="flex items-center gap-2 rounded-control bg-content-mid px-4 py-3 text-ink">
              <span aria-hidden className="text-lg leading-none">☾</span>
              <p className="text-sm">
                <span className="font-medium">Ready when you are.</span> This one was waiting for you — no rush.
              </p>
            </div>
          )}

          <ItemCard item={shown.item} collectionId={collectionSlugOrId} heroPhotoUrl={shown.heroPhotoUrl} imageClassName="h-64" />
          <Card padding="lg">
            <div className="space-y-4">
              {revisit !== null && (
                <p className="text-sm text-ink-soft">You placed this with {revisit.label} — change it?</p>
              )}
              {/* NOT keyed per piece: a re-keyed region is never announced (SC 4.1.3). */}
              <DecisionControls
                submit={{ kind: "local", onDecision: (d) => void handleTriage(shown.item, d) }}
                type="triage"
                decisions={triageDecisions(shown.item.id)}
                priorAnswer={revisit?.label}
              />
              {revisit === null ? (
                <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-hairline pt-3">
                  <DeferControl submit={{ kind: "local", onDecision: () => void handleNotYet(shown) }} itemId={shown.item.id} />
                  <SetAsideButton
                    submit={{ kind: "local", onDecision: () => handleNotMine(shown.item) }}
                    itemId={shown.item.id}
                    itemName={shown.item.name}
                  />
                </div>
              ) : (
                <div className="border-t border-hairline pt-3">
                  <Button type="button" variant="ghost" onClick={round.clearRevisit}>
                    Keep going
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: The page.** Replace `src/app/collections/[id]/sort/page.tsx` with:

```tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { DecisionController } from "@/server/api/decisions";
import { DispositionController } from "@/server/api/dispositions";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { chooseSortPhase } from "@/lib/sort-phase";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { buttonVariants } from "@/components/ui";
import { quietLink } from "@/lib/design/quiet-link";
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
import { TriageUndoProvider } from "@/features/sorting/TriageUndoProvider";
import { TriageUndoNotice } from "@/features/sorting/TriageUndoNotice";
import { TriageRound } from "@/features/sorting/TriageRound";
import { CompareChoice } from "@/features/sorting/CompareChoice";
import { SortProgress } from "@/features/sorting/SortProgress";
import { PauseControl } from "@/features/sorting/PauseControl";
import { COMPARE_SUBLINE } from "@/features/sorting/roundCopy";
import { KeepSortingButton } from "@/features/sessions/KeepSortingButton";

interface SortPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ phase?: string }>;
}

/**
 * The one Sort screen (spec §4): feelings, then pairs over Love + Like, then a
 * quiet end. Reads only — every answer travels through the decision queue.
 */
export default async function SortPage({ params, searchParams }: SortPageProps) {
  const [{ id }, { phase }] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);
  const curatorId = session.user.id;
  const base = `/collections/${collection.slug ?? collection.id}`;
  const sortHref = `${base}/sort`;

  // purses-t9l: each person sorts independently — only this curator's sessions.
  const sessions = await SessionController.fromDb(db).listByCollectionAndCurator(collection.id, curatorId);
  const open = sessions.find((s) => s.status === "active" || s.status === "paused");

  if (!open) {
    return (
      <AppLayout breadcrumbs={trail.sort(collection)}>
        <section className="mx-auto max-w-xl space-y-4 text-center">
          <h1 className="font-display text-3xl text-ink">Ready when you are</h1>
          <p className="text-ink-soft">How you feel about each piece, then which you&rsquo;d reach for first.</p>
          <div className="flex justify-center">
            <KeepSortingButton collectionId={collection.id} curatorId={curatorId} sortHref={sortHref} session={null} />
          </div>
        </section>
      </AppLayout>
    );
  }

  const [items, preferences, dispositions, curatorDecisions] = await Promise.all([
    ItemController.fromDb(db).listItems(collection.id),
    PreferenceController.fromDb(db).listItemPreferences(collection.id, curatorId),
    DispositionController.fromDb(db).listDispositions(collection.id, curatorId),
    DecisionController.fromDb(db).listForCurator(collection.id, curatorId),
  ]);
  const sortPhase = chooseSortPhase({
    items,
    preferences,
    dispositionByItemId: new Map(dispositions.map((d) => [d.itemId, d.disposition])),
    curatorDecisions,
    deferredOffered: phase === "pairs",
  });

  const coverIds =
    sortPhase.kind === "feelings"
      ? sortPhase.queue.map((e) => e.item.id)
      : sortPhase.kind === "pairs"
        ? sortPhase.pair.map((i) => i.id)
        : [];
  const covers = coverIds.length > 0 ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(coverIds) : new Map();
  const coverUrl = (itemId: string) => {
    const cover = covers.get(itemId);
    return cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };

  return (
    <AppLayout
      breadcrumbs={trail.sort(collection)}
      actions={<PauseControl curatorId={curatorId} sessionId={open.id} collectionHref={base} />}
    >
      {/* Recovery gate: queued answers land before this screen trusts the server's view. */}
      <PendingDecisionsGate curatorId={curatorId}>
        {/* The provider and notice sit ABOVE the phase switch so "Bring back" survives the hand-off. */}
        <TriageUndoProvider curatorId={curatorId} sessionId={open.id} collectionId={collection.id}>
          <div className="mx-auto max-w-xl space-y-6">
            <TriageUndoNotice />
            {sortPhase.kind === "feelings" && (
              <TriageRound
                curatorId={curatorId}
                sessionId={open.id}
                collectionId={collection.id}
                collectionSlugOrId={collection.slug ?? collection.id}
                queue={sortPhase.queue.map((e) => ({ ...e, heroPhotoUrl: coverUrl(e.item.id) }))}
                placedSeed={sortPhase.progress.done}
                nextHref={`${sortHref}?phase=pairs`}
              />
            )}
            {sortPhase.kind === "pairs" && (
              <div className="space-y-6">
                <SortProgress done={sortPhase.progress.done} total={sortPhase.progress.total} />
                <div>
                  <h1 className="text-2xl text-ink sm:text-3xl">Which would you reach for first?</h1>
                  <p className="mt-2 text-ink-soft">{COMPARE_SUBLINE}</p>
                </div>
                <CompareChoice
                  submit={{ kind: "session", sessionId: open.id, curatorId, collectionId: collection.id }}
                  itemA={sortPhase.pair[0]}
                  itemB={sortPhase.pair[1]}
                  heroA={coverUrl(sortPhase.pair[0].id)}
                  heroB={coverUrl(sortPhase.pair[1].id)}
                  comparisonsMade={0}
                />
              </div>
            )}
            {sortPhase.kind === "done" ? (
              <section className="space-y-4 text-center">
                <h1 className="font-display text-3xl text-ink">That&rsquo;s everything for now</h1>
                <Link href={`${base}/results`} className={buttonVariants({ size: "lg" })}>
                  See your ranking
                </Link>
              </section>
            ) : (
              // Spec §4.3: the Ranking is reachable from the Sort screen at any point.
              <p className="text-center">
                <Link href={`${base}/results`} className={quietLink}>
                  See your ranking so far
                </Link>
              </p>
            )}
          </div>
        </TriageUndoProvider>
      </PendingDecisionsGate>
    </AppLayout>
  );
}
```

- [ ] **Step 6: Retire the round pages.** `src/lib/collections/retired-redirect.ts`:

```ts
import { getSession } from "@/lib/auth";
import { permanentRedirect, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";

/**
 * Retired collection pages (spec §4) bounce old links here. The access guard runs
 * FIRST — page-authz-enumeration expects the stranger's redirect to be the first
 * throw — then a permanent (308) move to the Sort screen or the live Ranking.
 */
export async function redirectRetired(id: string, to: "sort" | "results"): Promise<never> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const collection = await requireCollectionAccess(getDb(), id, session.user.id);
  permanentRedirect(`/collections/${collection.slug ?? collection.id}/${to}`);
}
```

Replace each retired page's whole file. `sort/new/page.tsx`:

```tsx
import { redirectRetired } from "@/lib/collections/retired-redirect";

// Retired by the one Sort screen (spec 2026-10-01 §4); kept only to bounce old links.
export default async function RetiredSortNewPage({ params }: { params: Promise<{ id: string }> }) {
  return redirectRetired((await params).id, "sort");
}
```

`sort/[sessionNumber]/page.tsx`, `…/triage/page.tsx`, `…/usage/page.tsx`, `…/compare/page.tsx` — the same
body with `params: Promise<{ id: string; sessionNumber: string }>` and the component named
`RetiredSessionPage`, `RetiredTriagePage`, `RetiredUsagePage`, `RetiredComparePage`.
`sort/set-aside/page.tsx` — the same with `params: Promise<{ id: string }>`, named
`RetiredSortSetAsidePage`, and `redirectRetired((await params).id, "results")`.

Delete what nothing imports any more:

```bash
git rm -q --ignore-unmatch \
  "src/app/collections/[id]/sort/page.test.tsx" \
  "src/app/collections/[id]/sort/[sessionNumber]/page.test.tsx" \
  "src/app/collections/[id]/sort/[sessionNumber]/triage/page.test.tsx" \
  "src/app/collections/[id]/sort/[sessionNumber]/usage/page.test.tsx" \
  "src/app/collections/[id]/sort/[sessionNumber]/compare/page.test.tsx" \
  src/features/sorting/{UsageRound,RoundSurface,RoundShell,RoundTimer,TimerRing,TimerDial,RoundLengthDialog,WhatMoved,StartSessionForm,TakeABreakControl}.tsx \
  src/features/sorting/{UsageRound,RoundSurface,RoundShell,RoundTimer,TimerRing,TimerDial,RoundLengthDialog,WhatMoved,StartSessionForm,TakeABreakControl}.test.tsx \
  src/features/sorting/SortHelpDialog.tsx src/features/sorting/round-dial.ts src/features/sorting/round-dial.test.ts \
  src/features/sessions/{RecommendedRound,RecommendedRoundCard,SeeResultsCard,SessionAnalytics,StartSortingButton}.tsx \
  src/features/sessions/{RecommendedRound,SeeResultsCard,SessionAnalytics,StartSortingButton}.test.tsx \
  src/lib/{next-round,round-timer,round-preference,usage-selection,usage-round-prefs,what-moved}.ts \
  src/lib/{next-round,round-timer,round-preference,usage-selection,usage-round-prefs,what-moved}.test.ts
```

Then `grep -rnE "round-preference|round-timer|what-moved|next-round|usage-selection|usage-round-prefs|RoundShell|RoundTimer|TimerRing|TimerDial|WhatMoved|UsageRound|TakeABreakControl|StartSortingButton" src e2e/fixtures`
→ no `import` hits. Comment-only mentions remain in `e2e/fixtures/seed.ts`, `decisionQueue.ts`,
`roundCopy.ts`, `triage-selection.ts`, `useDeviceValue.ts`, `onboarding/testStorage.ts` and three tests;
check imports with `grep -rnE "from .*(round-preference|round-timer|what-moved|next-round|usage-selection|usage-round-prefs)" src e2e`
→ no output (Task 12 handles `src/features/onboarding`, which imports none of these).

`breadcrumb-trails.ts`: delete `sessionPrefix`, `sortNew`, `session`, `triage`, `compare`, `usage`.
In its test, delete those five map rows and replace the "parents Set aside under Decide and Session
under Sort" test with:

```ts
  it("parents Set aside under Decide", () => {
    expect(trail.setAside(c).at(-2)).toEqual({
      label: "Decide",
      href: "/collections/spring-bags/results",
    });
  });
```

Ring tokens (timer only): delete `--color-ring-sweep` / `--color-ring-track` from the `@theme inline`
block, `:root` (with its two-line comment) and the dark block in `globals.css`; delete only the ring
row (line 101, "ring sweep on ring track") from `pairings()` in `contrast.test.ts` and relabel line 102
(`ink` on `surfaceRaised`, 4.5 — a real text pair that stays) to "ink on surface-raised"; delete the "Ring — timer violet" bullet
from `DESIGN.md`.

- [ ] **Step 7: Run.** `npx vitest run src/features/sorting src/features/sessions src/components/layout src/lib/design src/lib/__tests__`
  → PASS. `npm run build` → PASS (no dangling imports). `npm run lint` → PASS.
  `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/page-authz-enumeration.integration.test.ts` → PASS.
- [ ] **Step 8:** `git add -A src DESIGN.md && git commit -m "feat(sort): one Sort screen — feelings then pairs; retire the round pages, timer and hub"`

## Task 9: Pairs — the transition line and Undo

**Files:** Rewrite `src/features/sorting/CompareChoice.tsx`. Modify
`src/features/sorting/CompareChoice.test.tsx` (drop `comparisonsMade`, add three tests),
`src/app/collections/[id]/sort/page.tsx` (pairs branch), `src/features/onboarding/WelcomeCompare.tsx`
(drop `comparisonsMade={0}`).

**Interfaces:**
- Produces: `CompareChoice({ submit, itemA, itemB, heroA?, heroB?, intro? })` — `comparisonsMade` is
  gone (no counts on the Sort screen); `intro` shows until the first answer lands.
  `answerLabel({ itemA, itemB, result }): string` — "Tie", "Skip" or the chosen piece's name.

- [ ] **Step 1: Failing tests.** In `CompareChoice.test.tsx` remove every `comparisonsMade={…}` prop
  (lines 94, 196, 342, 371, 383) and append inside the `describe("CompareChoice submits through the queue…")` block:

```tsx
  it("Undo names the last answer and re-presents that pair with it selected; a new choice supersedes it", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChoice();
    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_A, "Bag C") as any}
        itemB={item(ITEM_B, "Bag D") as any}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Undo: Bag A" }));
    expect(screen.getByText("You chose Bag A — change it?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Bag A" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Choose Bag B" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(batchBody(fetchMock, 1).decisions[0].decision).toEqual({ itemAId: ITEM_A, itemBId: ITEM_B, result: "item_b" });
    expect(batchBody(fetchMock, 1).decisions[0].clientKey).not.toBe(batchBody(fetchMock, 0).decisions[0].clientKey);
    expect(screen.getByRole("button", { name: "Undo: Bag B" })).toBeInTheDocument();
  });

  it("Keep going leaves the standing answer alone", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChoice();
    await user.click(screen.getByRole("button", { name: "Tie" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_A, "Bag C") as any}
        itemB={item(ITEM_B, "Bag D") as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Undo: Tie" }));
    expect(screen.getByRole("button", { name: "Tie" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.getByRole("button", { name: "Choose Bag C" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the transition line until the first answer lands", async () => {
    const user = userEvent.setup();
    renderChoice({ intro: "Now, between these two…" });
    expect(screen.getByText("Now, between these two…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(screen.queryByText("Now, between these two…")).not.toBeInTheDocument());
  });
```

  If an existing assertion expects the skip announcement "— set aside for now.", change it to
  "— skipped for now." ("Set aside" is reserved for Not mine).

- [ ] **Step 2:** `npx vitest run src/features/sorting/CompareChoice.test.tsx` → FAIL (no Undo, no intro).
- [ ] **Step 3: Implement.** Replace `src/features/sorting/CompareChoice.tsx` with:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { Button, CardImage } from "@/components/ui";
import { enqueue, newClientKey, readQueue, type QueueKey } from "./decisionQueue";
import { awaitAck, isInFlight, triggerFlush } from "./decisionFlusher";

type Result = "item_a" | "item_b" | "tie" | "skip";

export type CompareSubmit =
  | { kind: "session"; sessionId: string; curatorId: string; collectionId?: string }
  | { kind: "local"; onDecision: (result: Result) => void };

// The pairs screen does NOT wait out the flusher's 60 s backoff cap: after this
// bound it shows the gentle retry line while the queue keeps the entry.
export const COMPARE_ACK_BOUND_MS = 5_000;
export const COMPARE_SLOW_SAVE_LINE = "Still saving that one — it's safe, and it's on its way.";
const FALLBACK_RETRY_LINE = "That didn't save. Try again.";

interface Pair {
  itemA: Item;
  itemB: Item;
  heroA?: string;
  heroB?: string;
}
interface Answered extends Pair {
  result: Result;
}

/** The person's word for a pair answer, as Undo shows it (spec §4). */
export function answerLabel({ itemA, itemB, result }: Answered): string {
  if (result === "tie") return "Tie";
  if (result === "skip") return "Skip";
  return itemDisplayName(result === "item_a" ? itemA : itemB);
}

interface CompareChoiceProps extends Pair {
  submit: CompareSubmit;
  /** A one-line transition shown until the first answer lands ("Now, between these two…"). */
  intro?: string;
}

export function CompareChoice({ submit, itemA, itemB, heroA, heroB, intro }: CompareChoiceProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per in-flight tap slot, reused if that same tap is retried;
  // cleared on ack. Revisit slots are namespaced so they never reuse a pair key.
  const clientKeys = useRef<Record<string, string>>({});
  // Mounted empty so the region exists before its text changes (SC 4.1.3).
  const [announcement, setAnnouncement] = useState("");
  const settled = useRef(new Set<string>());
  // Undo (spec §4): the last settled answer, and the pair being revisited.
  const [last, setLast] = useState<Answered | null>(null);
  const [revisit, setRevisit] = useState<Answered | null>(null);
  const shown: Pair = revisit ?? { itemA, itemB, heroA, heroB };
  const mode = revisit ? "revisit" : "pair";

  function settle(clientKey: string, slot: string, answered: Answered) {
    if (submit.kind !== "session" || settled.current.has(clientKey)) return;
    settled.current.add(clientKey);
    delete clientKeys.current[slot];
    setError(null);
    const a = itemDisplayName(answered.itemA);
    const b = itemDisplayName(answered.itemB);
    setAnnouncement(
      answered.result === "tie"
        ? `${a} and ${b} — loved just the same.`
        : answered.result === "skip"
          ? `${a} and ${b} — skipped for now.`
          : `You love ${answered.result === "item_a" ? a : b} more than ${answered.result === "item_a" ? b : a}.`,
    );
    setLast(answered);
    setRevisit(null);
    // Clear pending BEFORE refresh: the refresh re-renders THIS instance with the next pair.
    setPending(null);
    router.refresh();
  }

  async function choose(result: Result, tapped: string) {
    if (submit.kind === "local") {
      submit.onDecision(result); // walkthrough: no keys, no pending, no refresh
      return;
    }
    const pair = shown;
    const slot = `${mode}:${tapped}`;
    setPending(slot);
    setError(null);
    const key: QueueKey = { curatorId: submit.curatorId, sessionId: submit.sessionId, collectionId: submit.collectionId };
    const clientKey = (clientKeys.current[slot] ??= newClientKey());
    const decision = { itemAId: pair.itemA.id, itemBId: pair.itemB.id, result };

    // NEVER a bare fetch: the answer rides the queue as a batch-of-1.
    const alreadyRiding = readQueue(key).some((e) => e.clientKey === clientKey) || isInFlight(key, clientKey);
    if (!alreadyRiding && !settled.current.has(clientKey)) {
      const persisted = await enqueue(
        key,
        { kind: "decision", clientKey, type: "pairwise_compare", decision, enqueuedAt: new Date().toISOString() },
        () => triggerFlush(key),
      );
      if (persisted === "needs_fallback") {
        let landed = false;
        try {
          const res = await fetch(`/api/sessions/${submit.sessionId}/decisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "pairwise_compare", decision, clientKey }),
          });
          landed = res.ok;
        } catch {
          landed = false;
        }
        if (!landed) {
          setError(FALLBACK_RETRY_LINE);
          setPending(null);
          return;
        }
        settle(clientKey, slot, { ...pair, result });
        return;
      }
    }

    const ack = awaitAck(key, clientKey);
    void triggerFlush(key);
    const outcome = await Promise.race([
      ack,
      new Promise<"slow">((resolve) => {
        setTimeout(() => resolve("slow"), COMPARE_ACK_BOUND_MS);
      }),
    ]);
    if (outcome === "slow") {
      setPending(null);
      setError(COMPARE_SLOW_SAVE_LINE);
      void ack.then(() => settle(clientKey, slot, { ...pair, result }));
      return;
    }
    settle(clientKey, slot, { ...pair, result });
  }

  const busy = pending !== null;
  const prior = revisit?.result;
  const pressed = (result: Result) => (prior === undefined ? undefined : prior === result);
  const ring = (result: Result) => (prior === result ? " ring-2 ring-primary ring-offset-2" : "");
  const choices = [
    { item: shown.itemA, hero: shown.heroA, result: "item_a" as const, key: "a" },
    { item: shown.itemB, hero: shown.heroB, result: "item_b" as const, key: "b" },
  ];

  return (
    <div className="space-y-6">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {intro && last === null && <p className="text-ink-soft">{intro}</p>}
      {revisit && <p className="text-sm text-ink-soft">You chose {answerLabel(revisit)} — change it?</p>}

      {/* Tapping a card IS the choice (tap-first). Always two-up. */}
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        {choices.map(({ item, hero, result, key }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            aria-label={`Choose ${itemDisplayName(item)}`}
            aria-pressed={pressed(result)}
            onClick={() => choose(result, key)}
            className={`group flex min-h-11 flex-col overflow-hidden rounded-card border border-hairline bg-surface text-left transition-shadow duration-200 ease-gentle hover:shadow-lift focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60${ring(result)}`}
          >
            <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden bg-content-soft">
              <CardImage
                src={hero}
                alt={itemDisplayName(item)}
                fallback={
                  <span className="font-display text-6xl text-ink-soft" aria-hidden>
                    {itemInitial(item)}
                  </span>
                }
              />
            </div>
            <div className="p-4">
              <h3 className="text-ink">{pending === `${mode}:${key}` ? "Saving…" : itemDisplayName(item)}</h3>
              {item.brand && <p className="mt-1 text-sm text-ink-soft">{item.brand}</p>}
            </div>
          </button>
        ))}
      </div>

      {/* Escape hatches, deliberately quiet. */}
      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant="ghost" size="sm" className={`min-h-11${ring("tie")}`} disabled={busy} aria-pressed={pressed("tie")} onClick={() => choose("tie", "tie")}>
          {pending === `${mode}:tie` ? "Saving…" : "Tie"}
        </Button>
        <span className="text-hairline" aria-hidden>
          &middot;
        </span>
        <Button type="button" variant="ghost" size="sm" className={`min-h-11${ring("skip")}`} disabled={busy} aria-pressed={pressed("skip")} onClick={() => choose("skip", "skip")}>
          {pending === `${mode}:skip` ? "Saving…" : "Skip"}
        </Button>
      </div>

      {submit.kind === "session" && revisit && (
        <div className="flex justify-center">
          <Button type="button" variant="ghost" onClick={() => setRevisit(null)}>
            Keep going
          </Button>
        </div>
      )}
      {submit.kind === "session" && !revisit && last && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => setRevisit(last)}
            className="inline-flex h-11 items-center rounded-control px-2 text-sm text-ink-soft transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
          >
            Undo: {answerLabel(last)}
          </button>
        </div>
      )}
      {error && <p className="text-center text-sm text-ink-soft">{error}</p>}
    </div>
  );
}
```

In the Sort page's pairs branch, drop `comparisonsMade={0}` and pass
`intro={phase === "pairs" ? "Now, between these two…" : undefined}`. In `WelcomeCompare.tsx`, drop
`comparisonsMade={0}`.

- [ ] **Step 4:** Step 2 command → PASS. `npx vitest run src/features/onboarding src/features/sorting` → PASS. `npm run lint`.
- [ ] **Step 5:** `git add src/features/sorting src/features/onboarding/WelcomeCompare.tsx "src/app/collections/[id]/sort/page.tsx" && git commit -m "feat(sort): pairs — transition line and Undo"`

## Task 10: The live Ranking — pins, Still deciding, Set aside, Save and share

**Files:**
- Rewrite: `src/app/collections/[id]/results/page.tsx`.
- Create: `src/features/results/RankingList.tsx` (+ `.test.tsx`), `src/features/results/SaveAndShare.tsx`
  (+ `.test.tsx`), `src/features/results/MakeRevisionButton.tsx`,
  `src/lib/db/ranking-view-creates-nothing.integration.test.ts`.
- Modify: `src/app/collections/[id]/results/[resultNumber]/page.tsx` (+ test),
  `src/lib/db/sort-results-pipeline.integration.test.ts:39, ~707-712 and 888-918` (`deriveStanding` → `buildRanking`, **both** call sites),
  `src/lib/db/page-authz-enumeration.integration.test.ts` (two more member redirects),
  `src/components/layout/breadcrumb-trails.ts` (+ test).
- Replace with guarded redirects: `results/set-aside/page.tsx`, `results/[resultNumber]/finalize/page.tsx`.
- Delete: `src/app/collections/[id]/results/page.test.tsx`, `results/[resultNumber]/finalize/page.test.tsx`,
  `src/features/results/{FinalizeEntry,FinalizeResultForm,RerankPanel,standing}` (+ tests).
  (`rerank-copy.ts` is still imported by the walkthrough; Task 12 deletes it.)

**Interfaces:**
- Consumes: `buildRanking`, `Pin` (Task 3), `RankingController.listPins` (Task 4),
  `POST …/ranking/save` (Task 6), `PUT|DELETE …/ranking/pins/[itemId]` (Task 4), `redirectRetired` (Task 8),
  `BringBackControl({ collectionId, itemId })`, `MostLovedHero`, `ItemCard`, `newClientKey`.
- Produces: `RankingRow` + `RankingList({ collectionId, rows })`;
  `SaveAndShare({ collectionId, collectionSlug, defaultName })`;
  `MakeRevisionButton({ resultId, rankingHref })`.

- [ ] **Step 1: Failing tests.** `src/features/results/RankingList.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RankingList, type RankingRow } from "./RankingList";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const row = (itemId: string, name: string, pinned = false): RankingRow => ({
  itemId, href: `/collections/bags/items/${itemId}`, name, initial: name[0], tier: "Love", pinned,
});
const ROWS = [row("a", "Bag A"), row("b", "Bag B"), row("c", "Bag C", true)];
const names = () => within(screen.getByRole("list")).getAllByRole("link").map((l) => l.textContent);
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("RankingList (spec §4 'Adjusting')", () => {
  it("a move pins ONE piece at its new place with one PUT, then refreshes", async () => {
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    await userEvent.click(screen.getByRole("button", { name: "Move Bag B up" }));
    expect(names()).toEqual(["Bag B", "Bag A", "Bag C"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/collections/coll_1/ranking/pins/b");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ position: 1 });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Moved Bag B to position 1 of 3.")).toBeInTheDocument();
  });

  it("a failed move puts the list back and says so gently", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    await userEvent.click(screen.getByRole("button", { name: "Move Bag A down" }));
    await waitFor(() => expect(names()).toEqual(["Bag A", "Bag B", "Bag C"]));
    expect(screen.getByText(/nothing was lost/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Unpin is offered only on a placed piece and sends one DELETE", async () => {
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    expect(screen.queryByRole("button", { name: "Unpin Bag A" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unpin Bag C" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/coll_1/ranking/pins/c", expect.objectContaining({ method: "DELETE" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("the ends cannot move further", () => {
    render(<RankingList collectionId="coll_1" rows={ROWS} />);
    expect(screen.getByRole("button", { name: "Move Bag A up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Bag C down" })).toBeDisabled();
  });
});
```

`src/features/results/SaveAndShare.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientKey } from "@/lib/decision-batch-schema";
import { SaveAndShare } from "./SaveAndShare";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ resultNumber: 4, shareToken: "tok123" }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});
const renderSave = () => render(<SaveAndShare collectionId="coll_1" collectionSlug="bags" defaultName="Bags, October 1, 2026" />);

describe("SaveAndShare (spec §4.4)", () => {
  it("names it (prefilled), saves once with a key, and shows the link", async () => {
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Bags, October 1, 2026");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/collections/coll_1/ranking/save");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("Bags, October 1, 2026");
    expect(ClientKey.safeParse(body.saveKey).success).toBe(true);
    expect(await screen.findByLabelText("Link to share")).toHaveValue(`${window.location.origin}/shared-results/tok123`);
    expect(screen.getByRole("link", { name: "See it saved" })).toHaveAttribute("href", "/collections/bags/results/4");
  });

  it("a retry after a stumble reuses the same key", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/nothing was lost/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByLabelText("Link to share");
    const keys = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).saveKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("a blank name cannot be saved", async () => {
    renderSave();
    await userEvent.click(screen.getByRole("button", { name: "Save and share" }));
    await userEvent.clear(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
```

`src/lib/db/ranking-view-creates-nothing.integration.test.ts`:

```ts
// @vitest-environment node
// Regression for spec §1: every "See results" tap used to create a draft. The live
// Ranking page now only reads — rendering it (with pins in play) writes no row.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession, requireAuth: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import RankingPage from "@/app/collections/[id]/results/page";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("viewing the Ranking creates nothing", () => {
  let ownerId: string;
  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  });
  afterAll(async () => {
    await closeDb();
  });

  it("renders the live ranking twice and leaves sort_results empty", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    for (const [i, rankBucket] of (["top", "high", "low"] as const).entries()) {
      const item = await new ItemRepository(db).create({ collectionId, name: `Piece ${i}` });
      await new CollectionPreferenceItemRepository(db).create({ collectionId, curatorId: ownerId, itemId: item.id, score: 0.5, confidence: 1, rankBucket, comparisonCount: 1 });
    }
    const count = async () => Number(((await db.execute(sql`select count(*)::int as n from sort_results`))[0] as { n: number }).n);

    await RankingPage({ params: Promise.resolve({ id: collectionId }) });
    await RankingPage({ params: Promise.resolve({ id: collectionId }) });

    expect(await count()).toBe(0);
  });
});
```

(`requireCollectionAccess` resolves the seeded collection by id and admits its owner.)

In `page-authz-enumeration.integration.test.ts`, extend the retired-pages test's `try` block:

```ts
        expect(await outcome("results/set-aside")).toBe(`NEXT_PERMANENT_REDIRECT:${base}/results`);
        expect(await outcome("results/[resultNumber]/finalize")).toBe(`NEXT_PERMANENT_REDIRECT:${base}/results`);
```

(pass `resultNumber: "1"` in `outcome`'s params alongside `sessionNumber`).

In `results/[resultNumber]/page.test.tsx`: in `beforeEach`, make the default result
`status: "finalized", curatorId: "u1"`; replace the test "labels a draft 'Still deciding'…" with:

```tsx
  it("a draft goes to the live Ranking — drafts are adjusted there now (spec §4)", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "draft", curatorId: "u1" });
    await expect(ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) })).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/collections/summer-bags/results");
  });
```

delete "offers 'Adjust results' on a DRAFT result…" and "includes both loved and Onward rows with a
sentinel divider…", and drop every `Adjust results` assertion from the two remaining tests of that
`describe` (rename it "ResultDetailPage Make a revision (curator only)").

- [ ] **Step 2:** `npx vitest run src/features/results "src/app/collections/[id]/results"` → FAIL
  (components missing; the detail page still renders drafts). The DB regression
  (`RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/ranking-view-creates-nothing.integration.test.ts`)
  already passes against today's read-only Standing page — it is the §7 lock that the rewrite in
  Step 4 must keep green, so run it again in Step 5.

- [ ] **Step 3: Components.** `src/features/results/RankingList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CardImage } from "@/components/ui";
import type { UsageAnswer } from "@/lib/derive-usage";
import { usageChipLabel } from "@/features/items/usage-chip-copy";

export interface RankingRow {
  itemId: string;
  href: string;
  name: string;
  coverUrl?: string;
  initial: string;
  tier: "Love" | "Like" | "Maybe";
  pinned: boolean;
  usage?: UsageAnswer;
}

const GENTLE_FAIL = "That didn't hold just now — nothing was lost. Try again whenever you like.";
const control =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-content-soft focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40";

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The live ranking's ordered list (spec §4 "Adjusting"). Drag or the up/down
 * buttons move ONE piece and pin it there; later pair answers flow around it.
 * Unpin hands it back to the derived order. Each change is one small request;
 * a failure puts the list back as it was.
 */
export function RankingList({ collectionId, rows }: { collectionId: string; rows: RankingRow[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(rows);
  // A refresh brings the server's order: take it.
  const [seen, setSeen] = useState(rows);
  if (rows !== seen) {
    setSeen(rows);
    setOrder(rows);
  }
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  async function send(method: "PUT" | "DELETE", itemId: string, body?: unknown) {
    const res = await fetch(`/api/collections/${collectionId}/ranking/pins/${itemId}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error("pin");
  }

  async function place(from: number, to: number) {
    if (busy || from === to || to < 0 || to >= order.length) return;
    const previous = order;
    const next = move(order, from, to).map((r, i) => (i === to ? { ...r, pinned: true } : r));
    setOrder(next);
    setBusy(true);
    setAnnounce(`Moved ${next[to].name} to position ${to + 1} of ${next.length}.`);
    try {
      await send("PUT", next[to].itemId, { position: to + 1 });
      router.refresh();
    } catch {
      setOrder(previous);
      setAnnounce(GENTLE_FAIL);
    } finally {
      setBusy(false);
    }
  }

  async function unpin(row: RankingRow) {
    if (busy) return;
    setBusy(true);
    try {
      await send("DELETE", row.itemId);
      setAnnounce(`${row.name} is back in its suggested place.`);
      router.refresh();
    } catch {
      setAnnounce(GENTLE_FAIL);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ranking-order-heading" className="space-y-3">
      <h2 id="ranking-order-heading" className="font-display text-2xl text-ink">
        Your order
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <ol className="space-y-2">
        {order.map((row, i) => (
          <li
            key={row.itemId}
            draggable={!busy}
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = dragging;
              setDragging(null);
              if (from !== null) void place(from, i);
            }}
            onDragEnd={() => setDragging(null)}
            className={`flex items-center gap-3 rounded-card border border-hairline bg-surface p-2${dragging === i ? " opacity-60" : ""}`}
          >
            <span aria-hidden className="flex h-11 w-6 shrink-0 cursor-grab items-center justify-center text-lg text-ink-soft">
              ⠿
            </span>
            <span className="w-6 shrink-0 text-center text-sm text-ink-soft">{i + 1}</span>
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control bg-content-soft">
              <CardImage
                src={row.coverUrl}
                alt=""
                fallback={
                  <span aria-hidden className="font-display text-lg text-ink-soft">
                    {row.initial}
                  </span>
                }
              />
            </span>
            <span className="min-w-0 flex-1">
              <Link href={row.href} className="block truncate text-ink underline-offset-2 hover:underline">
                {row.name}
              </Link>
              <span className="block text-xs text-ink-soft">
                {row.tier}
                {row.usage ? ` · ${usageChipLabel(row.usage)}` : ""}
              </span>
            </span>
            {row.pinned && (
              <button
                type="button"
                onClick={() => void unpin(row)}
                disabled={busy}
                aria-label={`Unpin ${row.name}`}
                className="h-11 shrink-0 rounded-pill px-3 text-sm text-ink-soft hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
              >
                Unpin
              </button>
            )}
            <button type="button" aria-label={`Move ${row.name} up`} disabled={busy || i === 0} onClick={() => void place(i, i - 1)} className={control}>
              <span aria-hidden>↑</span>
            </button>
            <button type="button" aria-label={`Move ${row.name} down`} disabled={busy || i === order.length - 1} onClick={() => void place(i, i + 1)} className={control}>
              <span aria-hidden>↓</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

`src/features/results/SaveAndShare.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { quietLink } from "@/lib/design/quiet-link";
import { newClientKey } from "@/features/sorting/decisionQueue";

interface SaveAndShareProps {
  /** ULID collection.id (the API never takes the slug). */
  collectionId: string;
  collectionSlug: string;
  /** "<collection name>, <date>" — computed on the server so it never mismatches on hydrate. */
  defaultName: string;
}

const STUMBLE = "That didn't save just now — nothing was lost. Try again whenever you like.";

/**
 * Spec §4.4: one quiet button → name it → one server transaction that saves and
 * returns the share link. The key is minted once per mount and reused on retry,
 * so a double tap or a retried request returns the same link, never a second save.
 */
export function SaveAndShare({ collectionId, collectionSlug, defaultName }: SaveAndShareProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [saveKey] = useState(newClientKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ url: string; resultNumber: number } | null>(null);
  const [copied, setCopied] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || name.trim() === "") return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/ranking/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), saveKey }),
      });
      if (!res.ok) throw new Error("save");
      const body = (await res.json()) as { resultNumber: number; shareToken: string };
      setSaved({ url: `${window.location.origin}/shared-results/${body.shareToken}`, resultNumber: body.resultNumber });
    } catch {
      setError(STUMBLE);
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false); // the field stays selectable; copying by hand still works
    }
  }

  if (saved) {
    return (
      <section aria-labelledby="saved-heading" className="w-full space-y-3 rounded-card border border-hairline bg-surface p-4 sm:w-96">
        <h2 id="saved-heading" className="font-display text-xl text-ink">
          Saved
        </h2>
        <Input label="Link to share" readOnly value={saved.url} onFocus={(e) => e.currentTarget.select()} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => void copy(saved.url)}>
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Link href={`/collections/${collectionSlug}/results/${saved.resultNumber}`} className={quietLink}>
            See it saved
          </Link>
        </div>
      </section>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Save and share
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="w-full space-y-3 rounded-card border border-hairline bg-surface p-4 sm:w-96">
      <Input label="Name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || name.trim() === ""}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Not now
        </Button>
      </div>
      {error && (
        <p role="status" className="text-sm text-ink-soft">
          {error}
        </p>
      )}
    </form>
  );
}
```

`src/features/results/MakeRevisionButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Spec §4.4: a saved ranking stays as it is; "Make a revision" opens a copy (pinned
// to the saved order) on the live Ranking, where saving it issues its own link.
export function MakeRevisionButton({ resultId, rankingHref }: { resultId: string; rankingHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function revise() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sort-results/${resultId}/supersede`, { method: "POST" });
      if (!res.ok) throw new Error("supersede");
      router.push(rankingHref);
    } catch {
      setError("That didn't open just now — nothing was lost. Try again whenever you like.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" onClick={revise} disabled={busy}>
        {busy ? "Getting ready…" : "Make a revision"}
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

- [ ] **Step 4: The Ranking page.** Replace `src/app/collections/[id]/results/page.tsx` with:

```tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Item } from "@/types";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { DispositionController } from "@/server/api/dispositions";
import { DecisionController } from "@/server/api/decisions";
import { PhotoController } from "@/server/api/photos";
import { PreferenceController } from "@/server/api/preferences";
import { RankingController } from "@/server/api/ranking";
import { buildRanking } from "@/server/services/sortResultMaterialization";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { deriveUsage } from "@/lib/derive-usage";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { quietLink } from "@/lib/design/quiet-link";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { CardImage, buttonVariants } from "@/components/ui";
import { WorkspaceModeChips } from "@/features/collections/WorkspaceModeChips";
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
import { BringBackControl } from "@/features/sorting/BringBackControl";
import { ItemCard } from "@/features/items/ItemCard";
import { MostLovedHero } from "@/features/results/MostLovedHero";
import { RankingList, type RankingRow } from "@/features/results/RankingList";
import { SaveAndShare } from "@/features/results/SaveAndShare";

interface RankingPageProps {
  params: Promise<{ id: string }>;
}

const TIER = { top: "Love", high: "Like", medium: "Maybe" } as const;

/**
 * The live Ranking (spec §4.3). Reads only — viewing creates nothing (regression:
 * ranking-view-creates-nothing.integration.test.ts). Hand moves pin into the one
 * open draft through the pins API; Save and share freezes it.
 */
export default async function RankingPage({ params }: RankingPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);
  const curatorId = session.user.id;
  const slug = collection.slug ?? collection.id;
  const base = `/collections/${slug}`;

  const [preferences, dispositions, items, curatorEvents, pins] = await Promise.all([
    PreferenceController.fromDb(db).listItemPreferences(collection.id, curatorId),
    DispositionController.fromDb(db).listDispositions(collection.id, curatorId),
    ItemController.fromDb(db).listItems(collection.id),
    // Server-side only: folded into a small usage map, never sent to the client (DATA-6).
    DecisionController.fromDb(db).listForCurator(collection.id, curatorId),
    RankingController.fromDb(db).listPins(collection.id, curatorId),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const liveIds = new Set(itemById.keys());
  const { loved, onward } = buildRanking(preferences, liveIds, pins);
  const usageByItemId = deriveUsage(curatorEvents, liveIds);
  const lookup = (ids: string[]) => ids.flatMap((itemId) => {
    const item = itemById.get(itemId);
    return item ? [item] : [];
  });
  const stillDeciding = lookup(dispositions.filter((d) => d.disposition === "deferred").map((d) => d.itemId));
  const setAside = lookup(dispositions.filter((d) => d.disposition === "set_aside").map((d) => d.itemId));
  const onwardItems = lookup(onward.map((e) => e.itemId));

  const shownIds = [...loved.map((e) => e.itemId), ...onwardItems.map((i) => i.id), ...stillDeciding.map((i) => i.id), ...setAside.map((i) => i.id)];
  const covers = shownIds.length > 0 ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(shownIds) : new Map();
  const coverUrl = (itemId: string) => {
    const cover = covers.get(itemId);
    return cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };
  const hrefOf = (item: Item) => (item.number === null ? `${base}/items` : `${base}/items/${item.number}`);

  const rows: RankingRow[] = loved.flatMap((entry) => {
    const item = itemById.get(entry.itemId);
    if (!item || entry.bucket === "low") return [];
    return [{
      itemId: item.id,
      href: hrefOf(item),
      name: itemDisplayName(item),
      coverUrl: coverUrl(item.id),
      initial: itemInitial(item),
      tier: TIER[entry.bucket],
      pinned: entry.pinned,
      usage: usageByItemId.get(item.id),
    }];
  });
  const hero = rows.length > 0 ? itemById.get(rows[0].itemId) : undefined;
  const hasRanking = rows.length > 0 || onwardItems.length > 0;
  const defaultName = `${collection.name}, ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

  return (
    <AppLayout breadcrumbs={trail.results(collection)}>
      {/* Queued answers land before the ranking is read. */}
      <PendingDecisionsGate curatorId={curatorId}>
        <div className="space-y-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-display text-2xl text-ink sm:text-3xl">Your ranking</h1>
              <p className="mt-2 text-ink-soft">Move any piece by hand and it stays where you put it.</p>
            </div>
            {hasRanking && (
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <SaveAndShare collectionId={collection.id} collectionSlug={slug} defaultName={defaultName} />
                <Link href={`${base}/sort`} className={quietLink}>
                  Keep sorting
                </Link>
              </div>
            )}
          </header>

          <WorkspaceModeChips base={base} activeMode="decide" />

          {hasRanking ? (
            <>
              {hero && <MostLovedHero item={hero} collectionId={slug} heroPhotoUrl={coverUrl(hero.id)} />}
              {rows.length > 0 && <RankingList collectionId={collection.id} rows={rows} />}
              {onwardItems.length > 0 && (
                <ItemRow id="ranking-onward" heading="Onward" caption="Where these go next." items={onwardItems} slug={slug} coverUrl={coverUrl} />
              )}
            </>
          ) : (
            <section className="space-y-3">
              <h2 className="font-display text-2xl text-ink">Nothing to see yet — and that&rsquo;s fine.</h2>
              <p className="text-ink-soft">Once you&rsquo;ve sat with a few, what you love most will settle here.</p>
              <Link href={`${base}/sort`} className={buttonVariants()}>
                Start sorting
              </Link>
            </section>
          )}

          {stillDeciding.length > 0 && (
            <ItemRow id="ranking-still-deciding" heading="Still deciding" caption="Ready when you are." items={stillDeciding} slug={slug} coverUrl={coverUrl} />
          )}

          {setAside.length > 0 && (
            <details className="rounded-card border border-hairline bg-surface p-4">
              <summary className="flex min-h-11 cursor-pointer items-center text-ink">Set aside</summary>
              <ul className="mt-3 space-y-3">
                {setAside.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-content-soft">
                      <CardImage src={coverUrl(item.id)} alt="" fallback={<span aria-hidden className="text-ink-soft">☾</span>} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">{itemDisplayName(item)}</span>
                    <BringBackControl collectionId={collection.id} itemId={item.id} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </PendingDecisionsGate>
    </AppLayout>
  );
}

function ItemRow({
  id,
  heading,
  caption,
  items,
  slug,
  coverUrl,
}: {
  id: string;
  heading: string;
  caption: string;
  items: Item[];
  slug: string;
  coverUrl: (itemId: string) => string | undefined;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="font-display text-xl text-ink">
          {heading}
        </h2>
        <p className="text-sm text-ink-soft">{caption}</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard item={item} collectionId={slug} heroPhotoUrl={coverUrl(item.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`results/[resultNumber]/page.tsx`: remove the `RerankPanel`/`RerankRow`/`Button`/`Link` imports
and `rerankRows`; import `MakeRevisionButton` and `redirect` is already imported. Right after the
`!result || result.collectionId !== collection.id` guard add:

```tsx
  // Drafts are adjusted on the live Ranking now (spec §4.3); a saved one is a keepsake.
  if (result.status === "draft") {
    redirect(`/collections/${collection.slug ?? collection.id}/results`);
  }
```

delete the `result.status === "draft"` Finalize link block, and replace the `<RerankPanel …>` element
with:

```tsx
          <div className="space-y-6">
            {isCurator && (
              <MakeRevisionButton resultId={result.id} rankingHref={`/collections/${collectionSegment}/results`} />
            )}
            <RankedResults
              loved={loved}
              onward={onward}
              collectionId={collectionSegment}
              coverUrl={coverUrl}
              usageByItemId={usageByItemId}
            />
          </div>
```

Retired pages — `results/set-aside/page.tsx`:

```tsx
import { redirectRetired } from "@/lib/collections/retired-redirect";

// The Set aside list lives on the Ranking now (spec §4.3); kept only to bounce old links.
export default async function RetiredSetAsidePage({ params }: { params: Promise<{ id: string }> }) {
  return redirectRetired((await params).id, "results");
}
```

`results/[resultNumber]/finalize/page.tsx`: the same with
`params: Promise<{ id: string; resultNumber: string }>`, named `RetiredFinalizePage`, comment
"Save and share replaced Finalize (spec §4.4)".

In `sort-results-pipeline.integration.test.ts` replace the `deriveStanding` import with
`import { buildRanking } from "@/server/services/sortResultMaterialization";`. `deriveStanding` has
**two** call sites; replace both or the file fails to import after `git rm standing.ts`. In the
shared-derivation test (~888-918) replace the three `items`/`itemById`/`standing` lines with:

```ts
      const livePrefs = await prefRepo.findByCollection(collectionId, ownerId);
      const standingMostLoved = buildRanking(livePrefs, new Set([highItemId, lowItemId]), []).loved[0].itemId;
```

and drop the `standing.loved[0].item.id` line below it (`standingMostLoved` is already defined). In the
"freezes the snapshot" test (~707-712) replace the `items`/`itemById`/`standing` block and its two
assertions with:

```ts
      const livePrefs = await prefRepo.findByCollection(collectionId, ownerId);
      const live = buildRanking(livePrefs, new Set([highItemId, lowItemId, inserted.id]), []);
      expect(live.loved).toHaveLength(3);
      expect(live.loved[0].itemId).toBe(inserted.id); // new item is most-loved live
```

(drop the now-unused `Item` import if the linter flags it — both uses are gone). `breadcrumb-trails.ts`: delete
`resultPrefix`, `setAside`, `finalize`; in its test delete those two map rows and the "parents Set
aside under Decide" test. Delete the retired files:

```bash
git rm -q "src/app/collections/[id]/results/page.test.tsx" \
  "src/app/collections/[id]/results/[resultNumber]/finalize/page.test.tsx" \
  src/features/results/{FinalizeEntry,FinalizeResultForm,RerankPanel}.tsx \
  src/features/results/{FinalizeResultForm,RerankPanel}.test.tsx \
  src/features/results/standing.ts src/features/results/standing.test.ts
```

- [ ] **Step 5: Run.** `npx vitest run src/features/results "src/app/collections/[id]/results" src/components/layout src/lib/__tests__`
  → PASS. `npm run build` → PASS. `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/ranking-view-creates-nothing.integration.test.ts src/lib/db/page-authz-enumeration.integration.test.ts src/lib/db/sort-results-pipeline.integration.test.ts`
  → PASS.
- [ ] **Step 6:** `git add -A src && git commit -m "feat(ranking): the live Ranking — hand moves, Still deciding, Set aside, Save and share"`

## Task 11: Collection home — one Start / Keep sorting

**Files:** Modify `src/app/collections/[id]/page.tsx` (imports, the session/meta reads at
lines ~66-91, the `ActiveSessionPanel` block at ~197-222), `src/app/collections/[id]/page.test.tsx`,
`src/features/sorting/sessionStatusPatch.ts` (delete `deleteSessionWithPreflush`) and its test.
Delete `src/features/sessions/{ActiveSessionPanel,SessionResumeCard}.tsx` (+ tests),
`src/features/sorting/ResumeControl.tsx` (+ test), `src/features/sessions/roundProgress.ts` (+ test).

**Interfaces:**
- Consumes: `KeepSortingButton` (Task 7).
- Produces: home renders, whenever items exist or a sort is open, one primary `KeepSortingButton` and —
  once anything has been sorted — a quiet "See your ranking" link to `/results`.

- [ ] **Step 1: Failing tests.** In `page.test.tsx`: change the `next/navigation` mock to
  `useRouter: () => ({ refresh: vi.fn(), push: vi.fn() })`. Replace the tests named below with:

```tsx
  it("decisions but no open sort: Start sorting, plus a quiet way to the ranking", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    prefRepo.findByCollection.mockResolvedValue([{ itemId: "item_1" }]);
    await renderPage();
    expect(screen.getByRole("button", { name: "Start sorting" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See your ranking" })).toHaveAttribute("href", "/collections/summer-bags/results");
  });
```

(replaces "no sessions but existing decisions (only session was set aside)…").

```tsx
  it("items-first, never sorted: Start sorting is the one dominant action", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    await renderPage();
    // One button-style action; the other entry points are plain links.
    expect(screen.getAllByRole("button", { name: /sorting/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Start sorting" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add photos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add item" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See your ranking" })).not.toBeInTheDocument();
  });
```

(replaces "items-first, never sorted: Sort wins…"). In "empty: exactly one add-photos action…"
replace the two `Continue`/`Start sorting` link assertions with
`expect(screen.queryByRole("button", { name: /sorting/ })).not.toBeInTheDocument();`. In both A1
tests replace `"Resume sorting"` with `"Keep sorting"` (variable `resume` → `keep`). Delete the whole
`describe("workspace resume card meta …")` block. In "uses slug for nav links and resume…", replace
`expect(hrefs).toContain("/collections/summer-bags/sort/5");` with
`expect(hrefs).toContain("/collections/summer-bags/results");`. In "governed labels use sentence
case…", change the heading list to `["Photo pool", "Items"]` and replace the two Resume assertions with
`expect(screen.getByRole("button", { name: "Keep sorting" })).toBeInTheDocument();`.
In `sessionStatusPatch.test.ts`, drop `deleteSessionWithPreflush` from the import and delete the
`describe("deleteSessionWithPreflush — abandon-with-undo …")` block (lines ~168-196).

- [ ] **Step 2:** `npx vitest run "src/app/collections/[id]/page.test.tsx"` → FAIL.
- [ ] **Step 3: Implement.** In `page.tsx`: drop the `ActiveSessionPanel`, `DispositionController`,
  `workspaceMeta` imports; add `import { KeepSortingButton } from "@/features/sessions/KeepSortingButton";`.
  Replace everything from `const resumeHref = …` through `const workspaceMetaLine = …` with:

```tsx
  // Sorted before = any past session OR any surviving decision (a curator whose
  // only session was set aside has no session rows, but their answers persist).
  const preferences = await PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id);
  const hasEverSorted = sessions.length > 0 || preferences.length > 0;
  const showSort = itemPreview.length > 0 || currentSession !== undefined;
```

  and replace the whole `{state.kind !== "empty" && ( <ActiveSessionPanel … /> )}` block with:

```tsx
        {/* Spec §4.1: the collection's one sort action — Start sorting, or Keep
            sorting while a sort is open (paused ones resume). */}
        {showSort && (
          <section aria-label="Sort" className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
            <KeepSortingButton
              collectionId={collection.id}
              curatorId={session.user.id}
              sortHref={`${base}/sort`}
              session={
                currentSession
                  ? { id: currentSession.id, status: currentSession.status as "active" | "paused" }
                  : null
              }
            />
            {hasEverSorted && (
              <Link href={`${base}/results`} className={quietLink}>
                See your ranking
              </Link>
            )}
          </section>
        )}
```

  Keep `leadActionVariant = currentSession || itemPreview.length > 0 ? "secondary" : "primary"` and
  update its comment to name Keep sorting as the one dominant action.
  In `sessionStatusPatch.ts` delete `deleteSessionWithPreflush` and its line in the header comment
  (session set-aside is retired). Then:

```bash
git rm -q src/features/sessions/{ActiveSessionPanel,SessionResumeCard}.tsx \
  src/features/sessions/{ActiveSessionPanel,SessionResumeCard}.test.tsx \
  src/features/sorting/ResumeControl.tsx src/features/sorting/ResumeControl.test.tsx \
  src/features/sessions/roundProgress.ts src/features/sessions/roundProgress.test.ts
grep -rnE "ActiveSessionPanel|SessionResumeCard|ResumeControl|roundProgress|deleteSessionWithPreflush" src
```

  → the grep prints nothing.
- [ ] **Step 4:** Step 2 command → PASS. `npm run build && npm run lint` → PASS.
- [ ] **Step 5:** `git add -A src && git commit -m "feat(home): one Start / Keep sorting action; retire the session panel"`

## Task 12: Onboarding teaches the two phases; timers tutorial removed

**Files:** Rewrite `src/features/onboarding/WalkthroughShell.tsx`, `WelcomePurpose.tsx`,
`WelcomeStanding.tsx`, `WalkthroughShell.test.tsx`. Modify `src/features/onboarding/sampleData.ts`
(`comparePairsFor`, drop `USAGE_ITEMS`/`UsageOutcome`), `WelcomeHandoff.tsx` (one line),
`beats.test.tsx`, `copy-a11y.test.tsx`, `sampleData.test.ts`, `src/features/sorting/roundCopy.ts`
(+ test), `src/features/tutorials/tutorials.ts`, `src/app/tutorials/page.test.tsx`,
`src/features/profile/ProfileForm.test.tsx:75`. Delete `WelcomeUsage.tsx`, `WelcomeRoundStanding.tsx`,
`WelcomeRefine.tsx`, `src/app/tutorials/timers/` (page + test), `src/features/results/rerank-copy.ts`.

**Interfaces:**
- Consumes: `CompareChoice` local mode (Task 9 — no `comparisonsMade`), `DecisionControls`,
  `DeferControl`, `SetAsideButton` in local mode.
- Produces: beats `purpose → feelings → pairs → standing → handoff`;
  `comparePairsFor(standing)` pairs **Love and Like rows only**; `TutorialSlug = "collection" | "sort" | "sharing"`;
  `ROUND_COPY = { triage, compare }`.

- [ ] **Step 1: Failing tests.** Replace `src/features/onboarding/WalkthroughShell.test.tsx` with:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { WalkthroughShell } from "./WalkthroughShell";
import { TRIAGE_ITEMS } from "./sampleData";
import { DISMISS_KEY, isWelcomeDismissed } from "./dismissal";

// The exit is a full-document navigation (purses-etv0); jsdom can't navigate, so spy on assign.
const assign = vi.fn();
beforeEach(() => {
  assign.mockClear();
  Object.defineProperty(window, "location", { configurable: true, value: { assign, href: "http://localhost/welcome" } });
});
afterEach(() => {
  document.cookie = `${DISMISS_KEY}=; path=/; max-age=0`;
});

type User = ReturnType<typeof userEvent.setup>;
async function feel(user: User, answers: (string | RegExp)[]) {
  for (const answer of answers) {
    expect(screen.getByRole("heading", { name: "How do you feel about this one?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: answer }));
  }
}
async function pairs(user: User) {
  for (let i = 0; i < 10 && screen.queryByRole("heading", { name: "Which would you reach for first?" }); i++) {
    await user.click(screen.getAllByRole("button", { name: /^Choose / })[0]);
  }
}

describe("WalkthroughShell — the two phases (spec §4 onboarding)", () => {
  it("purpose → feelings → pairs → ranking → hand-off, and finishing dismisses the intro", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    expect(screen.getByRole("heading", { name: "Rediscover what you love." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await feel(user, ["Love", "Like", "Love"]);
    expect(screen.getByRole("heading", { name: "Which would you reach for first?" })).toBeInTheDocument();
    await pairs(user);
    expect(screen.getByRole("heading", { name: "Your ranking so far" })).toBeInTheDocument();
    expect(screen.getByText("What you love most")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Now, your turn." })).toBeInTheDocument();
    expect(isWelcomeDismissed()).toBe(true);
    expect(screen.queryByRole("heading", { name: "Do you use this?" })).not.toBeInTheDocument();
  });

  it("pairs only Love and Like: with one loved piece it goes straight to the ranking", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await feel(user, ["Love", "Maybe", "Onward"]);
    expect(screen.getByRole("heading", { name: "Your ranking so far" })).toBeInTheDocument();
  });

  it("Not yet and Not mine stay out of the pairs and show in their own rows", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    await feel(user, ["Love", /^not yet/i, /^not mine/i]);
    expect(screen.getByRole("heading", { name: "Your ranking so far" })).toBeInTheDocument();
    expect(screen.getByText("Still deciding")).toBeInTheDocument();
    expect(screen.getByText("Set aside — waiting, whenever you want them")).toBeInTheDocument();
    expect(screen.getByText(TRIAGE_ITEMS[1].name)).toBeInTheDocument();
  });

  it("moves focus to the beat wrapper on every advance", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    expect(document.activeElement).toBe(document.querySelector("[tabindex='-1']"));
  });

  it("Leave tutorial dismisses and leaves with a full navigation", async () => {
    const user = userEvent.setup();
    render(<WalkthroughShell />);
    await user.click(screen.getByRole("button", { name: "Leave tutorial" }));
    expect(isWelcomeDismissed()).toBe(true);
    expect(assign).toHaveBeenCalledWith("/collections");
  });
});
```

In `beats.test.tsx`: remove the `WelcomeUsage`, `WelcomeRoundStanding`, `WelcomeRefine`,
`USAGE_PASS_ARIA_LABEL` and `moveUpLabel` imports and delete `describe("WelcomeUsage")`,
`describe("WelcomeRoundStanding")`, `describe("WelcomeRefine")`. Replace the first `WelcomePurpose` test with:

```tsx
  it("frames the walkthrough as two steps, not rounds", () => {
    render(<WelcomePurpose onNext={() => {}} />);
    expect(screen.getByRole("heading", { name: "Rediscover what you love." })).toBeInTheDocument();
    expect(screen.getByText("In this tutorial, you’ll sort a small sample collection in two steps.")).toBeInTheDocument();
    expect(screen.getByText("First, how you feel about each piece.")).toBeInTheDocument();
    expect(screen.getByText("Then, two at a time, which you’d reach for first.")).toBeInTheDocument();
    expect(screen.getByText("At the end, you’ll see what you love most.")).toBeInTheDocument();
    expect(screen.queryByText(/round/i)).not.toBeInTheDocument();
  });
```

In `describe("WelcomeStanding")`: in "highlights the compare-driven order change" assert
`screen.getByText("Your pair choices put the ones you love most in order.")` and
`expect(screen.queryByText(/Usage/)).not.toBeInTheDocument();`; in the two "Ready when you are"
tests replace `"Ready when you are"` with `"Still deciding"`.

In `copy-a11y.test.tsx`: drop the `WelcomeUsage`/`WelcomeRefine` imports and their two `render(…)`
lines in the touch-target list; delete `describe("refine beat copy")`; replace
`describe("purpose journey line")` with:

```tsx
describe("purpose journey line", () => {
  it("renders the two-step journey as quiet text-ink-soft paragraphs with no icons", () => {
    const { container } = render(<WelcomePurpose onNext={() => {}} />);
    for (const phrase of [
      "First, how you feel about each piece.",
      "Then, two at a time, which you’d reach for first.",
      "At the end, you’ll see what you love most.",
    ]) {
      const p = Array.from(container.querySelectorAll("p")).find((el) => el.textContent?.trim() === phrase);
      expect(p, `journey phrase "${phrase}" not found in its own <p>`).toBeTruthy();
      expect(p?.className ?? "").toMatch(/\btext-ink-soft\b/);
    }
    expect(container.querySelector("svg")).toBeNull();
  });
});
```

In `sampleData.test.ts`, replace "compares every ranked item against every other ranked item" with:

```ts
  it("pairs only the Love and Like pieces (spec §4 comparable set)", () => {
    const standing = buildTriageStanding({
      [TRIAGE_ITEMS[0].id]: { kind: "tier", tier: "love" },
      [TRIAGE_ITEMS[1].id]: { kind: "tier", tier: "maybe" },
      [TRIAGE_ITEMS[2].id]: { kind: "tier", tier: "like" },
    });
    expect(comparePairsFor(standing).map((pair) => pair.map((item) => item.id))).toEqual([
      [TRIAGE_ITEMS[0].id, TRIAGE_ITEMS[2].id],
    ]);
  });
```

(add `buildTriageStanding` to its import if missing). In `src/app/tutorials/page.test.tsx` and
`ProfileForm.test.tsx` delete the `["Round timers", "/tutorials/timers"]` row and rename the first
test to "lists the three tutorial routes…". In `roundCopy.test.ts` delete "carries the usage round
copy verbatim", "builds the two usage decisions…", "carries the usage pass-button copy verbatim" and
their imports.

- [ ] **Step 2:** `npx vitest run src/features/onboarding src/app/tutorials src/features/profile src/features/sorting/roundCopy.test.ts`
  → FAIL (old beats, old copy, Maybe still paired).

- [ ] **Step 3: Implement.** `sampleData.ts`: delete `USAGE_ITEMS` and `UsageOutcome`, and change
  `comparePairsFor`'s first line to

```ts
  // Spec §4: only Love and Like are compared — the same rule as the real sort.
  const rankedItems = standing.ranked.filter((row) => row.tier === "love" || row.tier === "like").map((row) => row.item);
```

`WelcomePurpose.tsx` body:

```tsx
    <section className="flex flex-col items-center text-center gap-6">
      <h1 className="font-display text-4xl sm:text-5xl text-ink">Rediscover what you love.</h1>
      <p className="text-lg text-ink-soft max-w-md">
        In this tutorial, you&rsquo;ll sort a small sample collection in two steps.
      </p>
      <div className="flex flex-col gap-1 max-w-md">
        <p className="text-ink-soft">First, how you feel about each piece.</p>
        <p className="text-ink-soft">Then, two at a time, which you&rsquo;d reach for first.</p>
        <p className="pt-3 text-ink-soft">At the end, you&rsquo;ll see what you love most.</p>
      </div>
      <Button size="lg" onClick={onNext}>
        Show me how
      </Button>
    </section>
```

`WalkthroughShell.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { dismissWelcome } from "./dismissal";
import {
  buildTriageStanding,
  comparePairsFor,
  TRIAGE_ITEMS,
  type CompareOutcome,
  type CompareRoundResult,
  type TriageOutcome,
} from "./sampleData";
import { WelcomePurpose } from "./WelcomePurpose";
import { WelcomeTriage } from "./WelcomeTriage";
import { WelcomeCompare } from "./WelcomeCompare";
import { WelcomeStanding } from "./WelcomeStanding";
import { WelcomeHandoff } from "./WelcomeHandoff";

type Beat = "purpose" | "feelings" | "pairs" | "standing" | "handoff";

// The walkthrough is client-only state (decision 25): a beat cursor plus the typed
// outcomes the person taps. It teaches the real sort's two phases (spec §4):
// feelings for every piece, then pairs over Love + Like, then the ranking.
export function WalkthroughShell() {
  const [beat, setBeat] = useState<Beat>("purpose");
  const [triageIndex, setTriageIndex] = useState(0);
  const [triageOutcomes, setTriageOutcomes] = useState<Record<string, TriageOutcome>>({});
  const [compareIndex, setCompareIndex] = useState(0);
  const [compareResults, setCompareResults] = useState<CompareRoundResult[]>([]);

  // Focus the beat wrapper on every advance so a screen reader re-announces the beat.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapperRef.current?.focus();
  }, [beat, triageIndex, compareIndex]);

  const goTo = (next: Beat) => {
    if (next === "handoff") dismissWelcome();
    setBeat(next);
  };

  const comparePairs = comparePairsFor(buildTriageStanding(triageOutcomes));
  const currentPair = comparePairs[compareIndex] ?? null;

  const handleTriageOutcome = (itemId: string, outcome: TriageOutcome) => {
    const next = { ...triageOutcomes, [itemId]: outcome };
    setTriageOutcomes(next);
    if (triageIndex + 1 < TRIAGE_ITEMS.length) {
      setTriageIndex((i) => i + 1);
      return;
    }
    // Every piece has passed through: pairs if two are loved, else straight to the ranking.
    goTo(comparePairsFor(buildTriageStanding(next)).length > 0 ? "pairs" : "standing");
  };

  const handleCompareOutcome = (outcome: CompareOutcome) => {
    if (!currentPair) {
      goTo("standing");
      return;
    }
    const [left, right] = currentPair;
    setCompareResults((prev) => [...prev, { itemAId: left.id, itemBId: right.id, outcome }]);
    if (compareIndex + 1 < comparePairs.length) {
      setCompareIndex((i) => i + 1);
    } else {
      goTo("standing");
    }
  };

  const exit = () => {
    dismissWelcome();
    // Full-document nav, NOT router.push: the server must re-run the /collections →
    // /welcome gate with the fresh dismissal cookie (purses-etv0).
    window.location.assign("/collections");
  };

  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-center gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-12">
      <div ref={wrapperRef} tabIndex={-1} className="w-full max-w-md focus:outline-hidden sm:max-w-2xl">
        {beat === "purpose" && <WelcomePurpose onNext={() => goTo("feelings")} />}
        {beat === "feelings" && <WelcomeTriage index={triageIndex} onOutcome={handleTriageOutcome} />}
        {beat === "pairs" && currentPair && (
          <WelcomeCompare left={currentPair[0]} right={currentPair[1]} onOutcome={handleCompareOutcome} />
        )}
        {beat === "standing" && (
          <WelcomeStanding comparisons={compareResults} triage={triageOutcomes} onNext={() => goTo("handoff")} />
        )}
        {beat === "handoff" && <WelcomeHandoff onExplore={exit} />}
      </div>

      {/* Quiet, persistent escape on every beat but the last. */}
      {beat !== "handoff" && (
        <button
          type="button"
          onClick={exit}
          className="h-11 w-full max-w-xs rounded-control px-4 text-sm text-ink-soft hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary sm:w-auto"
        >
          Leave tutorial
        </button>
      )}
    </div>
  );
}
```

`WelcomeStanding.tsx`: drop the `usageChipLabel` and `UsageOutcome` imports, the `usageByItemId`
prop, `heroUsage`, the hero's usage `<span>`, the `usage` prop of `StandingRowItem` (and its chip
`<span>`), and the `usageFor` helper. Change the explainer paragraph to
`Your pair choices put the ones you love most in order.` and the deferred group label from
`"Ready when you are"` to `"Still deciding"` (and its comment: "a Not yet piece rests in Still
deciding, as on the real Ranking"). `WelcomeHandoff.tsx`: "Sort whenever you like, one gentle round
at a time." → "Sort whenever you like, a few pieces at a time."

`roundCopy.ts`: delete `ROUND_COPY.usage`, `THIS_ROUND_LABEL`, `USAGE_PASS_LABEL`,
`USAGE_PASS_TITLE`, `USAGE_PASS_ARIA_LABEL`, `QUICK_PACE_LABEL`, `QUICK_INTRO_LINE`,
`nowAnnouncement`, `UsageResult`, `usageDecisions`; set `WELCOME_ROUND_KICKER = "A sample sort"`
(rename the constant's comment: "the walkthrough's neutral kicker"). `tutorials.ts`: delete the
`timers` entry and narrow `TutorialSlug` to `"collection" | "sort" | "sharing"`; change the sort
entry's description to "Sort a small sample collection: how you feel about each piece, then which you'd reach for first."

```bash
git rm -q src/features/onboarding/{WelcomeUsage,WelcomeRoundStanding,WelcomeRefine}.tsx \
  src/app/tutorials/timers/page.tsx src/app/tutorials/timers/page.test.tsx \
  src/features/results/rerank-copy.ts
grep -rnE "WelcomeUsage|WelcomeRoundStanding|WelcomeRefine|USAGE_ITEMS|rerank-copy|tutorials/timers|usageDecisions" src
```

→ the grep prints nothing.
- [ ] **Step 4:** Step 2 command → PASS. `npm run build && npm run lint` → PASS.
- [ ] **Step 5:** `git add -A src && git commit -m "feat(onboarding): teach the two phases; remove the timers tutorial"`

## Task 13: Sort journey e2e replaces fourteen specs; a11y, CI map, screenshots

**Files:** Create `e2e/sort-journey.spec.ts`. Modify `e2e/a11y.spec.ts:36-39, 107-117`,
`e2e/sort-images.spec.ts`, `e2e/welcome-walkthrough.spec.ts:38-74`, `.github/workflows/ci.yml`
(sort/results filters ~313-333, the `A_SORT`/`A_RESULTS`/`A_AUTH` lines ~438-449),
`e2e/screenshots/capture.ts`. Delete `e2e/{sort-session,usage-round,compare,timer-ring,session-pause,session-undo,session-create-after-set-aside,not-yet-defer,not-mine-set-aside,decision-recovery,results,results-onward,results-rerank,shared-results}.spec.ts`.

**Interfaces:** Consumes the accessible names from Tasks 7-12: buttons `Keep sorting`, `Love`/`Like`
(exact), `/^Not yet/`, `/^Not mine/`, `Undo: <answer>`, `Choose <name>`, `Move <name> up`,
`Unpin <name>`, `Save and share`, `Save`; texts `Ready when you are.`, `Now, between these two…`,
`That’s everything for now`; link `See your ranking`; regions `Your order`, `Still deciding`;
`<details>` summary `Set aside`; labels `Name`, `Link to share`. Seeds: `seedJourneyScenario(ownerId, 5)`
(five named, photographed, untriaged pieces + one active session).

Coverage map for the deletions (spec §7): pause/resume → `sort-pause-resume` DB test + Task 7 units;
undo → Task 8/9 units + this journey; Not yet / Not mine / Bring back → Task 8 units + this journey;
create-after-set-aside → retired (session set-aside is gone); decision recovery → `PendingDecisionsGate`
units (unchanged) + the gate on every sort/ranking surface; results/onward/rerank → Task 3/10 units +
this journey; shared-results (purses-a45s: a stranger reaches the link, and its token-scoped photo
route) → the last block of this journey.

- [ ] **Step 1: The journey** `e2e/sort-journey.spec.ts`:

```ts
// The one sort path (spec 2026-10-01 §4), un-mocked except photo bytes (no blob
// emulator): start → feelings for five pieces (Undo, Not yet twice, Not mine) →
// pairs (Undo) → end → ranking (Still deciding, Set aside + Bring back, a hand
// move that survives a reload) → save and share → the link opens signed out.
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";
import { getTestDb } from "./fixtures/db";
import { sessionsTable, sortResultsTable } from "@/lib/db/schema";

const FIXTURE = "e2e/fixtures/sample-images/labeled/sort-images.webp";

const landed = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname) && r.ok());

test.describe("sort journey", () => {
  let slug: string;
  let collectionId: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, collectionId } = await seedJourneyScenario(ownerId, 5));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/photo-files/**", (route) => route.fulfill({ path: FIXTURE, contentType: "image/webp" }));
  });

  test("start, feelings, pairs, ranking, save and share, open the link", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const home = `/collections/${slug}`;
    await page.goto(home);
    await expect(page).toHaveURL((u) => u.pathname === home);
    await page.getByRole("button", { name: "Keep sorting" }).click();
    await page.waitForURL((u) => u.pathname === `${home}/sort`);

    // ── Feelings ─────────────────────────────────────────────────────────────
    const piece = page.locator("main h3").first();
    const names: string[] = [];
    const answer = async (control: string | RegExp) => {
      await expect(page.getByRole("heading", { name: "How do you feel about this one?" })).toBeVisible();
      names.push(await piece.innerText());
      const name = typeof control === "string" ? { name: control, exact: true } : { name: control };
      await page.getByRole("button", name).click();
    };
    await answer("Love");
    await page.getByRole("button", { name: "Undo: Love" }).click();
    await expect(piece).toHaveText(names.pop() as string);
    await answer("Love"); // names[0]
    await answer("Like"); // names[1]
    await answer(/^Not yet/); // names[2] waits
    await answer(/^Not mine/); // names[3] set aside
    await answer("Love"); // names[4]
    // The waiting piece returns at the end of the phase; a second Not yet lets it rest.
    await expect(page.getByText("Ready when you are.")).toBeVisible();
    await expect(piece).toHaveText(names[2]);
    await page.getByRole("button", { name: /^Not yet/ }).click();

    // ── Pairs (Love + Like: names[0], names[1], names[4]) ─────────────────────
    await page.waitForURL((u) => u.searchParams.get("phase") === "pairs");
    await expect(page.getByText("Now, between these two…")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Which would you reach for first?" })).toBeVisible();
    const choose = page.getByRole("button", { name: /^Choose / });
    const done = page.getByRole("heading", { name: "That’s everything for now" });
    const pairKey = () => choose.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).join("|"));
    const answerPair = async () => {
      const before = await pairKey();
      await choose.first().click();
      await expect.poll(async () => (await done.isVisible()) || (await pairKey()) !== before).toBe(true);
    };

    const firstChoice = ((await choose.first().getAttribute("aria-label")) ?? "").replace(/^Choose /, "");
    await answerPair();
    if (!(await done.isVisible())) {
      await page.getByRole("button", { name: `Undo: ${firstChoice}` }).click();
      await expect(page.getByRole("button", { name: `Choose ${firstChoice}` })).toHaveAttribute("aria-pressed", "true");
      await answerPair();
    }
    for (let i = 0; i < 6 && !(await done.isVisible()); i++) await answerPair();
    await expect(done).toBeVisible();

    // ── Ranking ──────────────────────────────────────────────────────────────
    await page.getByRole("link", { name: "See your ranking", exact: true }).click();
    await page.waitForURL((u) => u.pathname === `${home}/results`);
    await expect(page.getByText("What you love most")).toBeVisible();
    const rows = page.getByRole("region", { name: "Your order" }).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole("region", { name: "Still deciding" })).toContainText(names[2]);

    await page.getByText("Set aside", { exact: true }).click(); // open the <details>
    const broughtBack = landed(page, "DELETE", /\/dispositions\/[^/]+$/);
    await page.getByRole("button", { name: /bring back/i }).click();
    await broughtBack;
    await expect(page.getByText("Set aside", { exact: true })).toHaveCount(0);

    const second = await rows.nth(1).getByRole("link").innerText();
    const moved = landed(page, "PUT", /\/ranking\/pins\/[^/]+$/);
    await page.getByRole("button", { name: `Move ${second} up` }).click();
    await moved;
    await page.reload();
    await expect(rows.first().getByRole("link")).toHaveText(second);
    await expect(page.getByRole("button", { name: `Unpin ${second}` })).toBeVisible();

    // ── Save and share ───────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Save and share" }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(/^E2E Journey Bags, /);
    await page.getByLabel("Name", { exact: true }).fill("My journey keepers");
    const saved = landed(page, "POST", /\/ranking\/save$/);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await saved;
    const link = await page.getByLabel("Link to share").inputValue();
    expect(link).toMatch(/\/shared-results\/[0-9a-f]{64}$/);

    const { db } = getTestDb();
    const results = await db.select().from(sortResultsTable).where(eq(sortResultsTable.collectionId, collectionId));
    expect(results.map((r) => r.status)).toEqual(["finalized"]);
    const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.collectionId, collectionId));
    expect(sessions.map((s) => s.status)).toEqual(["completed"]);

    // A stranger with the link reaches the read-only ranking (purses-a45s), and its
    // photos come from the token-scoped route, never the session-gated one.
    const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anon = await stranger.newPage();
    await anon.route("**/api/shared-results/*/photos/**", (route) => route.fulfill({ path: FIXTURE, contentType: "image/webp" }));
    const path = new URL(link).pathname;
    const photo = anon.waitForResponse((r) => /\/api\/shared-results\/[^/]+\/photos\//.test(new URL(r.url()).pathname));
    await anon.goto(path);
    await expect(anon).toHaveURL((u) => u.pathname === path);
    await expect(anon.getByRole("heading", { name: "My journey keepers" })).toBeVisible();
    expect((await photo).status()).toBe(200);
    await stranger.close();
  });
});
```

- [ ] **Step 2: Run, expect PASS** (Tasks 7-12 built the surfaces it drives):
  `npx playwright test e2e/sort-journey.spec.ts --project=tablet`. If a selector misses, fix the
  selector against the accessible names above — do not loosen an assertion.

- [ ] **Step 3: Neighbours.** `e2e/sort-images.spec.ts`: drop `sessionNumber`, and
  `page.goto(`/collections/${slug}/sort`)` (the seeded active session's only piece is in feelings).
  `e2e/a11y.spec.ts`: destructure `finalizedResultNumber` from `seedSortScenario`; replace the
  `results` and `triage` screens with

```ts
      ["ranking", `/collections/${slug}/results`],
      ["saved-ranking", `/collections/${slug}/results/${finalizedResultNumber}`],
      ["sort", `/collections/${triageSlug}/sort`],
```

  (drop `triageSessionNumber` **and the now-unused `resultNumber` binding** — only
  `finalizedResultNumber` is used; update the "Scans 9 screens" comment to 10).
  `e2e/welcome-walkthrough.spec.ts`: rewrite `walkToHandoff` (and its header comment) to

```ts
// Walk purpose → feelings (×3) → pairs → ranking, stopping ON the hand-off beat.
async function walkToHandoff(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show me how" }).click();
  await expect(page.getByRole("heading", { name: "How do you feel about this one?" })).toBeVisible();
  await page.getByRole("button", { name: "Love", exact: true }).click();
  await page.getByRole("button", { name: "Like", exact: true }).click();
  await page.getByRole("button", { name: /not mine/i }).click(); // set aside
  await expect(page.getByRole("heading", { name: "Which would you reach for first?" })).toBeVisible();
  await page.getByRole("button", { name: "Tie", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your ranking so far" })).toBeVisible();
  await expect(page.getByText(/waiting, whenever you want them/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("link", { name: "Start a collection" })).toBeVisible();
}
```

  Delete the fourteen retired specs:

```bash
git rm -q e2e/{sort-session,usage-round,compare,timer-ring,session-pause,session-undo,session-create-after-set-aside,not-yet-defer,not-mine-set-aside,decision-recovery,results,results-onward,results-rerank,shared-results}.spec.ts
```

- [ ] **Step 4: CI map.** In `ci.yml` `sort:` filter replace `round-preference.ts`, `round-timer.ts`
  and `usage-selection.ts` with `- 'src/lib/sort-phase.ts'` and `- 'src/lib/compare-selection.ts'`;
  in `results:` replace `next-round.ts` and `what-moved.ts` with
  `- 'src/server/services/sortResultMaterialization.ts'` **and add**
  `- 'src/app/api/collections/*/ranking/**'` (otherwise a ranking-API-only PR selects only the floor
  specs). The selection lines become:

```bash
          if [ "$A_SORT" = "true" ]; then
            add "e2e/sort-images.spec.ts e2e/sort-journey.spec.ts"
          fi
          if [ "$A_RESULTS" = "true" ]; then
            add "e2e/sort-journey.spec.ts"
          fi
```

  and the `A_AUTH` line swaps `e2e/shared-results.spec.ts` for `e2e/sort-journey.spec.ts`.
  `npx vitest run scripts/ci-e2e-map.test.ts` → PASS (every spec on disk listed; every listed spec exists).

- [ ] **Step 5: Screenshots script.** In `e2e/screenshots/capture.ts`: delete the `pi-round-box`
  `localStorage` line and the usage-queue precondition block (`goto …/usage` + its `expect`), the
  whole "Epic R: usage-round scripted-tap surfaces" block and the "Adjust results" block. In the
  `/welcome` walk, replace everything from the three `Love` taps through the Hand-off shot with:

```ts
    // Feelings: Love, Like, Maybe — two loved pieces make exactly one pair.
    await page.getByRole("button", { name: "Love", exact: true }).click();
    await page.getByRole("button", { name: "Like", exact: true }).click();
    await page.getByRole("button", { name: "Maybe", exact: true }).click();

    // Pairs.
    await page.getByRole("heading", { name: "Which would you reach for first?" }).waitFor();
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("welcome-3-compare");
    await page.getByRole("button", { name: "Tie", exact: true }).click();

    // Ranking.
    await page.getByRole("heading", { name: "Your ranking so far" }).waitFor();
    await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot("welcome-4-standing");

    // Hand-off.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Now, your turn." }).waitFor();
    await page.waitForTimeout(400);
    await shot("welcome-5-handoff");
```

  Replace these surfaces:

```ts
      ["results", `/collections/${slug}/results/${resultNumber}`],
      ["results-finalized", `/collections/${slug}/results/${finalizedResultNumber}`],
      ["decide", `/collections/${slug}/results`],
      ["triage", `/collections/${triageSlug}/sort/${triageSessionNumber}/triage`],
      ["triage-patient-waiting", `/collections/${waitingSlug}/sort/${waitingSessionNumber}/triage`],
      ["set-aside", `/collections/${setAsideSlug}/results/set-aside`],
      ["sort-paused", `/collections/${pausedSlug}/sort`],
      ["collection-paused", `/collections/${pausedSlug}`],
      ["sort-hub", `/collections/${triageSlug}/sort/${triageSessionNumber}`],
      ["usage-round", `/collections/${triageSlug}/sort/${triageSessionNumber}/usage`],
```

  with

```ts
      ["ranking", `/collections/${slug}/results`],
      ["saved-ranking", `/collections/${slug}/results/${finalizedResultNumber}`],
      ["sort-feelings", `/collections/${triageSlug}/sort`],
      ["sort-not-yet", `/collections/${waitingSlug}/sort`],
      ["sort-pairs", `/collections/${pairsSlug}/sort?phase=pairs`],
      ["ranking-set-aside", `/collections/${setAsideSlug}/results`],
      ["collection-paused", `/collections/${pausedSlug}`],
```

  and in `beforeAll` seed the pairs shot (two Love pieces, no answers):

```ts
  // UX redesign PR 2: the pairs phase — two Love pieces, nothing compared yet.
  const pairsSeed = await seedJourneyScenario(ownerId, 2);
  pairsSlug = pairsSeed.slug;
  for (const itemId of pairsSeed.itemIds) {
    await new CollectionPreferenceItemRepository(db).create({
      collectionId: pairsSeed.collectionId, curatorId: ownerId, itemId,
      score: 0.875, confidence: 0.1, rankBucket: "top", comparisonCount: 1,
    });
  }
```

  (`let pairsSlug = "";` beside the other slugs; drop the now-unused `resultNumber`,
  `waitingSessionNumber` and `triageSessionNumber` bindings from `capture.ts`). `npx tsc --noEmit -p tsconfig.json`
  must stay clean for `e2e/`.

- [ ] **Step 6: Run.** `npx playwright test e2e/sort-journey.spec.ts e2e/sort-images.spec.ts e2e/a11y.spec.ts e2e/welcome-walkthrough.spec.ts e2e/layout.spec.ts e2e/smoke.spec.ts --project=tablet`
  → PASS. Local gate (not CI): `PW_VIEWPORT=phone npx playwright test e2e/sort-journey.spec.ts e2e/welcome-walkthrough.spec.ts`.
- [ ] **Step 7:** `git add -A e2e .github/workflows/ci.yml && git commit -m "test(e2e): sort journey replaces fourteen specs; CI map and screenshots follow"`

## Task 14: Docs, full gate, screenshots

**Files:** Modify `docs/API.md` (route index `### sessions`/`### sort-results` + a new
`### ranking` table; the `## sort-results` prose for `POST /api/sort-results` and `supersede`; a new
`## ranking` section), `docs/ARCHITECTURE.md` (decision 41's status line; append decision 42).

- [ ] **Step 1: API.md.** Route index — add after `### dispositions`:

```markdown
### ranking
| Method | Path | Access |
|---|---|---|
| PUT·DELETE | `/api/collections/[id]/ranking/pins/[itemId]` | member (own draft) |
| POST | `/api/collections/[id]/ranking/save` | member (own ranking) |
```

  New section after `## dispositions`:

```markdown
## ranking

The live Ranking's writes (UX redesign PR 2, decision 42). Curator is always the caller. Every write
runs in one transaction holding the `(collection, curator)` advisory lock; the partial unique index
`sort_results_open_draft_unique` (one `status = 'draft'` row per collection + curator) is the backstop.
The API position is 1-based; `manualRank` stays 0-based and the service converts at the boundary.

### `PUT·DELETE /api/collections/[id]/ranking/pins/[itemId]`
`requireAuth` + `requireApiCollectionAccess` (`401`/`403`/`404`) before the body. **PUT body (strict):**
`{ position: integer 1-10000 }` — pins the piece at that 1-based slot of the loved list (Love, Like,
Maybe); the first pin lazily creates the open draft (`name: "Still deciding"`), later pins reuse it.
`404` when the piece is not this curator's Love/Like/Maybe piece in this collection (Onward,
untriaged, foreign); `400` on a bad body. **DELETE** unpins (idempotent, opens nothing). Both `200 { ok: true }`.
Reading the Ranking creates nothing.

### `POST /api/collections/[id]/ranking/save`
`requireAuth` + `requireApiCollectionAccess` before the body. **Body (strict):** `{ name: string
(trimmed, 1-200), saveKey: ULID (26 lowercase Crockford) }`. One transaction: reuse-or-create the open
draft → rebuild its rows from the live ranking (pins applied, tier first, usage stamped) → finalize
(`save_key` stored) → complete the curator's open session → create an active share. `201
{ resultNumber, shareToken }`; a replay of the same key returns `200` and the same body, writing
nothing. `409` when nothing is ranked yet, or when the key belongs to another collection (or its
share was revoked). `400` on a bad body.
```

  In `## sort-results`: `POST /api/sort-results` — replace "(ranked by descending score…)" with
  "ranked tier first, then pair order" and add: "Any open draft for the curator is deleted in the same
  locked transaction first (one open draft per collection + curator); no UI calls this route any more."
  `supersede` — append: "The revision replaces the curator's open draft, and its loved rows are pinned
  (`manualRank`) at their saved positions, so the live Ranking starts from the saved order."

- [ ] **Step 2: ARCHITECTURE.md.** Change decision 41's *Status* to "Shipped (PR 1); sort/ranking
  shipped in PR 2 (decision 42)." Append:

```markdown
**42. One sort path: feelings then pairs, a live Ranking with pins, one atomic Save (UX redesign PR 2, 2026-10-01, migration 0003).**
- *Decision:* `/collections/[id]/sort` is the only sort surface. A pure chooser (`src/lib/sort-phase.ts`) shows *feelings* until every live piece is placed (Not yet last, Not mine never), then *pairs* over the comparable set **Love + Like** — `selectComparableItems` now feeds both `selectNextPair` and the recompute's `deriveOrderRanks`, and `rankPreferencesToItems` orders tier first, then `orderRank`. The hand-off is `?phase=pairs`. Undo re-presents the last answer (queued → removed; sent → superseded, latest wins). The live Ranking (`/results`) reads only; a hand move pins one piece (`manualRank`) in the curator's single open draft, created lazily inside `SortResultService.inCuratorTx` (advisory lock); `buildRanking`/`applyPins` give page and save one derivation. Save and share is one transaction keyed by `sort_results.save_key`. Migration `0003` adds `save_key` and two partial unique indexes (`sort_results_open_draft_unique`, `sort_results_save_key_unique`); additive except one reviewed data step that runs before the open-draft index and removes every open draft except the newest per (collection, curator) — items first; finalized rows and answers untouched (an amendment to spec §6 "no data rewrite"; `sort_results` has no terminal status besides `finalized`, so removal mirrors what `createDraftResult` already does to a prior draft; flagged in the PR body for owner veto). The round pages, hub, recaps, timer (+ ring tokens), usage round, Finalize page, "Adjust results" mode and `/tutorials/timers` are gone; old URLs are guard-then-308 pages. Revisions replace the open draft with the saved order pinned.
- *Rationale:* spec §1 (9-12 screens and four ways to resume; a draft per "See results" tap), §4. One lock for every draft writer makes the index a backstop, never a 500; the save key makes a retried save return the same link.
- *Status:* Shipped (PR 2). Accepted loss: sessions set aside before PR 2 stay excluded from the curator's log.
```

- [ ] **Step 3: Full gate** (record each command and result in the PR body):
  `npm run lint && npm run test:ci && npm run build && npm run auth:verify && npm run test:db`, then
  `npm run test:e2e` (the change touches `src/server/**` and many UI routes — the full suite, tablet),
  then `PW_VIEWPORT=phone npx playwright test e2e/sort-journey.spec.ts e2e/welcome-walkthrough.spec.ts e2e/item-panel.spec.ts`.
  PR-body checklist: (a) Task 5 Step 1's production duplicate-draft count (informational — the data
  step removes the older drafts); (b) the data step is called out as a decision-42 amendment to spec §6,
  for owner veto; (c) deploy-window note: the migration runs before the build, and `POST /api/sort-results`
  has no UI caller, so the old build serving during the window cannot hit the new index from the UI.
- [ ] **Step 4:** `/sync-docs` (README if it names removed routes or the timer), then
  `git add docs && git commit -m "docs: ranking API and decision 42"`. (The controller runs
  `/graphify --update` before pushing.)
- [ ] **Step 5: Screenshots** with the `pr-screenshots` skill (`docs/cookbook/add-images-to-pr.md`):
  `SHOTS=sort-feelings,sort-not-yet,sort-pairs,ranking,ranking-set-aside,saved-ranking,collection-paused npm run screenshots`
  — light and dark, tablet and phone — plus the walkthrough beats (unset `SHOTS` once for the full
  run, which includes them). Embed inline in the PR body.

---

## Self-review

**Spec coverage.** §4.1 Start/Keep sorting → Tasks 7, 11 (and the `/sort` start state, Task 8).
§4.2 Sort screen: feelings/pairs order → Task 2 (chooser) + Task 8 (screen); comparable set in
selector and derivation → Task 1; Undo → Tasks 8, 9; Pause → Tasks 7, 8; numberless progress → Tasks
2, 8; end screen → Task 8. §4.3 Ranking: reachable from home (Task 11) and the Sort screen (Task 8's quiet link); sections → Task 10; viewing creates nothing → Task 10 DB
regression; lazy single draft + reuse → Tasks 4, 5; pins + Unpin → Tasks 3, 4, 10. §4.4 Save and
share → Task 6 (+ UI Task 10); revision → Task 4 (+ Task 6 test, Task 10 button). Removed routes and
redirects → Tasks 8, 10 (enumeration test both). Onboarding → Task 12. Live data on deploy → Task 5
data step, Task 4 `findDraftForUpdate` newest-first, decision notes. §6 one migration → Task 5. §7
rows: phase chooser (unit, T2), comparable set (unit, T1), Undo (unit, T8/T9), pause/resume (DB, T7),
Not yet/Not mine (unit T8 + e2e T13), viewing creates nothing (DB, T10), one open draft (DB, T5 index + T4 reuse),
pins/Unpin (unit T3 + DB T4), save atomic + retry (DB, T6), revision (DB, T6 + existing supersede
test), redirects (enumeration, T8/T10), e2e journey (T13). §8: old sort specs replaced (T13), light/
dark/phone screenshots (T14). §9: timer removed (T8, T12), one quiet Save (T10).

**Placeholder scan.** No TBD/TODO; every code step carries the code. Deletions are explicit
`git rm` lists followed by a `grep` that must print nothing. The generated migration's file name and
hash are produced by `npm run db:generate` and `shasum` in Task 5 — the only values the plan cannot
know in advance, with the exact command to obtain each.

**Type consistency.** `Pin { itemId, position, pinnedAt }` (Task 3; `position` 1-based, built by the one `pinsFromRows`
from the 0-based `manualRank`) is what `listPins` returns
(Task 4), what `saveAndShare` rebuilds (Task 6) and what the Ranking page passes to `buildRanking`
(Task 10). `chooseSortPhase` input/`SortPhase` (Task 2) match the page (Task 8) and the DB test
(Task 7). `TriageRound` props (`placedSeed`, `nextHref`) match page and test. `CompareChoice` loses
`comparisonsMade` in Task 9 — the page passes `0` only between Tasks 8 and 9, and Task 9 removes it
from the page and `WelcomeCompare`. `KeepSortingButton.session` is `{ id, status: "active" | "paused" } | null`
in Tasks 7, 8, 11. `RankingController.pin(collectionId, curatorId, itemId, body)` / `save(collectionId,
curatorId, body)` match both routes.

**Review Focus.** The five classes are pinned: (1) Task 8 "a second Not yet lets a returning piece
rest…"; (2) Task 3 clamp test + Task 4 "404s a piece from another collection" (DB) with the Onward,
untriaged and bad-body permutations as unit tests; (3) Task 6 retry + cross-collection key tests; (4) Task 3 "drops pieces that are no longer
live" + Task 2 "does not count a preference for a piece that is no longer live"; (5) Task 3 "gives a
shared slot to the newer pin".
