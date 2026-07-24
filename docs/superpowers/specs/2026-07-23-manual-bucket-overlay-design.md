# Per-curator bin overlay on live preferences — design (purses-xxo7, coordination)

**Date:** 2026-07-23 · **Rev:** 2 (Data/Architect/QA review folded) · **Owner
direction:** bins and formal sorts must coordinate; a hand-set bin is a 1-of-4 label,
so it must NOT trigger a full recompute; bins are per-curator.

## Verified foundations (file:line)

- `bulkUpsert` upserts only the emitted set and its conflict-update SET list is
  explicit (`score, confidence, rank_bucket, comparison_count, order_rank, last_seen,
  updated_at` — CollectionPreferenceItemRepository.ts:134-145); `clearOrderRanks` only
  nulls ranks. **Rows absent from a recompute survive, and a new column outside the
  SET list survives recompute untouched.** (Corrects the earlier recon claim that
  event-less rows "vanish".)
- Precedent: finalized results already overlay `manualBucket` over `rankBucket` with
  `effectiveBucket = manualBucket ?? rankBucket` (results-buckets.ts:10-15). This spec
  brings the same rule to LIVE preferences.
- `clear(collection, curator)` hard-deletes the whole set — callers are purge/reset
  flows where losing hand bins is correct.
- Tier seed scores exist per bucket (ScoringService.ts:15-18).

## Design

1. **Schema (additive, safe):** `manual_bucket text` (nullable) on
   `collection_preference_items`. Proper drizzle migration (prod has real data).
2. **Write path — `PUT /api/items/[id]/bin`** (no events, no recompute — a single-row
   write, **lock-free**): `requireAuth` → resolve item (404) → `requireApiItemCapability
   "preferences:write"` (curator; per-curator by construction — curatorId from the
   session, never the body). Body `{ bucket: "top"|"high"|"medium"|"low" | null }`.
   - **Set (bucket ≠ null) — ONE upsert (rev 2, decision 1):** `insert(… manualBucket =
     rankBucket = bucket, score = the bucket's tier seed, confidence 0, comparisonCount
     0, orderRank null) onConflictDoUpdate(target [item_id, curator_id], set
     { manual_bucket })`. Lock-free: a new hand-only row gets the seed columns; an
     existing (possibly sorted) row keeps its derived columns and only the overlay
     changes. `bulkUpsert`'s SET list omits `manual_bucket`, so a concurrent recompute
     can never clobber the overlay, and our conflict-set touches only `manual_bucket`,
     so we never clobber a recompute — no advisory lock needed.
   - **Set also clears the item's disposition in the same tx (rev 2, decision 3):**
     mirrors the decisions route's `bringBack`; a bin write is a placement, so it must
     preserve the disposed⇔untriaged mutual exclusion (else an item double-counts on
     home / sort-hub).
   - **Clear (bucket = null) — ONE statement (rev 2, decision 2):** a writable-CTE
     `DELETE … WHERE comparison_count = 0` (the hand-only signal — recompute never
     emits a count-0 row, so `comparison_count = 0` ⇔ "no decision-event evidence for
     this item") `RETURNING id`, `else UPDATE manual_bucket = NULL` when the delete
     matched nothing (a sorted row keeps its derived `rankBucket`, only the overlay is
     nulled). A hand-only row is DELETED so its placeholder `rankBucket` can't resurface
     as the effective bucket. **Self-healing race:** a recompute landing between the
     read and the write only moves a row hand-only → sorted, which the UPDATE arm
     handles correctly.
   - No row + null → 200 no-op (nothing deleted, nothing updated).
   - **Returns `{ effectiveBucket: RankBucket | null }` (rev 2, decision 6):** the
     post-write effective bucket — `bucket` on set, the surviving row's `manualBucket ??
     rankBucket` after a clear-on-sorted, `null` after a clear-on-hand-only or a no-op.
3. **Read rule, one helper:** `effectiveBucket(pref) = manualBucket ?? rankBucket`
   shared by (rev 2, decision 4): item details (`currentBucket`), live Standing
   (`standing.ts` partition **and** render), and `SessionAnalytics` tier chips.
   `MaterializedItem` gains `manualBucket` (threaded from the pref); the **raw**
   `rankBucket` is still what drives recompute internals and materialization ORDERING —
   a rebinned sorted item joins its new partition at the END (a bin is a partition, not
   a rank, per owner). Finalized snapshots keep their own existing overlay.
4. **Finalize carries the live overlay (rev 2, decision 5):** materialization threads
   the live `pref.manualBucket` into `snapshot.manualBucket`, so finalize freezes the
   effective composition. The snapshot overlay machinery (`effectiveBucket` over
   `SortResultItem`) is unchanged; the revision/`cloneItemsFrom` path still drops the
   overlay (fresh-fold).
5. **UI:** the shipped `ItemBinSelect` keeps its exact form; its option **values** become
   bucket values (Love=top, Like=high, Maybe=medium, Onward=low) while its **labels**
   stay Love/Like/Maybe/Onward ("Not placed yet" = `""`), it PUTs the new route
   `{ bucket: value || null }`, and the details page feeds it `effectiveBucket` from the
   caller's preferences instead of `items.category`. `items.category` returns to plain
   metadata (the `.nullable()` fix stays — it is correct for category editing generally;
   the bin no longer writes category).
6. **Tone unchanged:** same labels, same gentle failure copy, Onward never Release.

**Stated side effects (rev 2, decision 7):** a hand-binned item leaves the triage queue
(the pref row gates it, as any placement does); revisiting a round shows no pre-mark for
it (the rounds are event-driven and a hand-bin writes no event) — both intended.

## Tests (rev 2, decision 8)

- Unit: ItemBinSelect retarget (PUT payload `{ bucket }`, bucket values) with an
  explicit **label ≠ value** assertion (the option labeled "Love" has value `top`);
  revert / disable / Onward-never-Release survive. **No** standalone `effectiveBucket`
  helper test (it is exercised through `deriveStanding` and the DB tier).
- Unit: `deriveStanding` where `manualBucket ≠ rankBucket` — the manual bucket wins the
  loved/onward partition (load-bearing).
- Unit: details `page.test.tsx` — `currentBucket` comes from preferences (mock
  `PreferenceController`), not `items.category`.
- Route schema: invalid bucket 400; null-clear accepted.
- DB-integration (`src/lib/db/bin-route.integration.test.ts`, one crossing file):
  (a) hand-bin with no row → row created with seed score + overlay + `rankBucket = bucket`;
  (b) sort-then-recompute preserves `manual_bucket` and overwrites the derived columns
  (the load-bearing invariant, proven un-mocked);
  (c) clear on a hand-only row DELETEs it / clear on a sorted row nulls only the overlay
  (the two outcomes stay at the DB tier);
  (d) a set-aside item, when hand-binned, has its disposition cleared (decision 3);
  (e) 401 / 403 / 404 rows; and the new route added to `route-authz-enumeration`.
- DB-integration: finalize after a bin-disagreement → the snapshot carries the overlay
  (effective composition frozen, decision 5).
- e2e: existing item-bin-select journey retargeted (choose → reload persists → clear →
  persists via the new route) + one Standing assertion: a hand-binned item appears under
  its bin section on the results Standing.

## Out of scope

- Migrating any `items.category` values (PR #364 unmerged; no bin data exists in prod).
- Compare/usage integration, ordering within a bin for hand-only rows (orderRank null
  → they list after ranked items; acceptable).
