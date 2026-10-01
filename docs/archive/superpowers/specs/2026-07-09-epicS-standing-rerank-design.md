# Epic S — Standing, reconciliation & re-rank by hand — Design Spec

**Bead:** `purses-mvn5` (parent epic `purses-9v1f`). **Status:** rev 2 (adversarial review folded — 8 findings; all code claims verified true).
**Parent design:** `docs/superpowers/specs/2026-07-06-usage-round-and-sort-unification-design.md` §D4, Epic-S summary (~line 331), user-point 11 (~line 35).
**Grounded in** a full code-map (2026-07-09) + an adversarial review that verified every load-bearing claim against source. Epic R (PR1 #308, PR2 #309) is **merged** — `deriveUsage`, `DecisionController.listForCurator`, the usage round, and the `usesLine`/`restingLine` copy are live and reusable.

## §0 — Corrections to the parent design (verified against code)

1. **Manual re-rank writes `manualRank`/`manualBucket` on `sort_result_items`, NOT `order_rank`.** `order_rank` is on the **preferences** table (live *love* axis, `schema.ts:282`). The result overlay is `manualRank` (**plain int**, nullable) + `manualBucket` (text, nullable) on `sort_result_items` (`schema.ts:373-374`).
2. **Epic R is merged** — not an upstream to wait on.
3. **One additive migration is required** — `sort_result_items` has no `usage` column today (nullable, non-rewriting).
4. **`manualRank` is a dense int sharing numeric space with `computedRank`** (`schema.ts:373`, `sortResultMaterialization.ts:42-44`). There is **no fractional insert** and **no batch write endpoint** today — a hand-order requires a dense, gapless rewrite of the affected block. **Epic S adds a transactional bulk re-rank endpoint** (§4). The parent's "one PATCH, sparse rank" assumption is false.
5. **`cloneItemsFrom` drops manual overrides on revision** (`sortResultMaterialization.ts:54-60`) — Epic S keeps that; usage is handled by **fresh-fold at materialization** (§3.3), not by clone-carry.

## §1 — Scope

**In:**
- **(A) Two-axis Standing — per-item usage annotation only.** The Decide surface (`/collections/[id]/results`) fetches the usage fold and shows a quiet **per-item usage chip** ("In your life" / "Resting") on ranked rows; usage-known items only, no chip when undecided. **Annotate, don't enumerate.**
- **(B) `sort_result_items.usage` snapshot + revision** — a nullable `usage` column, stamped at draft materialization from the live usage fold, shown on the finalized keepsake, and **re-derived fresh** on revision.
- **(C) Manual re-rank UI** — a **transactional bulk re-rank endpoint** + a drag-to-reorder surface on the **draft** result page (with a move-up/down keyboard path), wired to `manualRank`, plus reset.

**Out (deferred; each is its own bead + gate, not silently dropped):**
- **The "Loved, and resting" reconciliation *section* and the usage-only split view** — an enumerated "loved ∧ unused" list is structurally a shaming/inventory metric (TONE red line, F2). It requires a **TONE.md adjudication before it's built**, not a local copy call. Bead: file at S1 close. The per-item chip (A) delivers the two-axis signal without the enumeration.
- A materialized usage projection table (read-time fold stays; parent §D3).
- Blended love×use scoring (reconciliation is presentation, not arithmetic — parent D4).
- Re-ranking a *finalized* result (backend 409s by design; re-rank is a draft activity → finalize/supersede).

## §2 — Two-axis Standing: per-item chip (deliverable A, read-side, no migration)

### §2.1 Thread the usage fold to the render
`deriveStanding` (`src/features/results/standing.ts:14`) stays **love-only** for the ranking (no signature churn to its loved/onward logic; the existing 4 tests stay green untouched). The **page** owns usage annotation:
- `results/page.tsx` adds a fourth read to the `Promise.all` (mirror `usage/page.tsx:40,56`):
  `const curatorEvents = await DecisionController.fromDb(db).listForCurator(collection.id, session.user.id);`
  `const usageByItemId = deriveUsage(curatorEvents, new Set(items.map(i => i.id)));`
- Pass `usageByItemId` to `RankedResults` → `ItemCard`, which renders the chip per row keyed by `itemId`. `PendingDecisionsGate` already wraps the page (UX-6 closed). **DATA-6:** the curator log is server-side only, never serialized into the client payload.

### §2.2 The chip (TONE item)
A quiet, count-free chip: **"In your life"** (`uses`) / **"Resting"** (`not_uses`); absent when undecided. ≥ AA contrast, non-color-dependent (text/icon, not color alone), ≥ the card's existing chip treatment. Reuses the `usesLine`/`restingLine` register. No section, no total, no denominator.

### §2.3 Usage-only collections (F5)
`hasStanding` currently gates the whole render on `loved.length || onward.length` (`results/page.tsx:69,106`), so a usage-only collection (usage answers, no love prefs) wrongly shows "Start sorting." Fix: the page shows the item list with usage chips when there is **any** usage-known item even if the love ranking is empty (extend the gate to `hasStanding || usageByItemId.size > 0`), reusing the gentle empty copy only when truly empty. Pinned by the usage-only test.

### §2.4 Test floor (A)
- `standing.test.ts`: unchanged (love-only) — regression that A didn't perturb it.
- `results/page.test.tsx`: the page issues the `listForCurator` read; ranked rows render the chip for usage-known items and omit it for undecided; usage-only collection renders chips (not the empty state); the curator log is absent from the client payload (DATA-6 pin).
- Copy register scan over the two chip strings (no digits/denominators/urgency).

## §3 — `sort_result_items.usage` snapshot + revision (deliverable B, migration)

### §3.1 Migration (additive)
New `drizzle/` migration: `ALTER TABLE sort_result_items ADD COLUMN usage text` (nullable; `'uses'|'not_uses'|NULL`). Update `schema.ts`. No backfill (existing snapshots keep `NULL` = "unknown at snapshot time"). No CHECK (matches the `manualBucket`/`computedBucket` plain-text precedent; `deriveUsage`'s typed output guards writes). Not a datetime, so §6 timestamptz rule is N/A. **Expand-then-use:** deploy the migration before any code reads the column; a nullable column read pre-migration just sees `NULL`.

### §3.2 Materialization stamps the snapshot — name the service seam (F4)
`rankPreferencesToItems` (`sortResultMaterialization.ts:29`) is **pure over `preferences` only** — it cannot see the event log. Stamping `usage` requires threading a `curatorEvents` read + `deriveUsage` into the materialization path: `createResultWithItems`/`createDraftResult` (`SortResultService.ts:69,125`) compute `deriveUsage(curatorEvents, liveIds)` and pass the map so each `MaterializedItem` gains a `usage` field written by the repo create-path. This is a **service-signature change + repo change + test**, not a local tweak — sized accordingly in the plan.

### §3.3 Revision: fresh-fold, not clone-carry (F3 resolved)
Each materialization snapshots usage **at its own moment**. A revision (`supersedeResult` → new draft) therefore **re-derives usage from live** at revision-materialization — the same `deriveUsage` call §3.2 uses for a fresh draft — so the revision's `usage` describes *the revision moment*, consistent with how the snapshot model treats every other materialization. `cloneItemsFrom` is **unchanged** (still copies `computedRank/computedBucket`, drops manual fields, and now simply doesn't touch `usage` — usage is stamped by the materialization step, not the clone). This is the *less-code* option (no clone special-case) and avoids the staleness of carry-forward (a months-later revision would otherwise record usage-as-of-the-original). **Consequence, stated:** revising re-reads current usage; if product later wants "usage frozen at the original keepsake moment," that's a deliberate change with its own bead — flagged, not silently chosen.

### §3.4 Finalized display
`[resultNumber]/page.tsx` reads and shows the snapshot `usage` as the same quiet chip (§2.2), so a finalized/shared keepsake carries its usage note. A pre-Epic-S result (all `NULL`) renders no chip (backward compat).

### §3.5 Test floor (B)
- Migration applies + `schema.ts` matches (DB integration).
- Materialization: a draft materialized with usage answers stamps `usage` per item; usage-unknown → `NULL`.
- Revision: superseding a finalized result **re-derives** usage from current events (fresh-fold), while `manualRank/manualBucket` are still dropped — one test asserting both.
- Finalized page renders the snapshot chip; an all-`NULL` legacy result renders none.

## §4 — Manual re-rank: batch endpoint + UI (deliverable C)

### §4.1 The gap + the real cost (F1)
Backend built: per-item `PATCH /api/sort-results/[id]/items/[rid]` `{manualRank?, manualBucket?}` (draft-only, 409 finalized), per-item reset, `SortResultService.setManualOverride`/`resetManualOverride`, authz integration test. **No client UI writes it** (confirmed). But `manualRank` is a **dense int in shared space with `computedRank`** — a drag to an arbitrary position needs a gapless rewrite of the affected block, i.e. **up to N per-item PATCHes**. N sequential writes with optimistic rollback is fragile (a partial failure leaves an inconsistent order). So C is **two sub-deliverables**:

### §4.2 S3a — transactional bulk re-rank endpoint (new backend)
`PATCH /api/sort-results/[id]/items` body `{ order: Array<{ rid: string; manualRank: number }> }`, applied in **one `withTransaction`** (the repo already uses this pattern), draft-only (409 finalized), `requireApiResultAccess`, Zod-validated, all `rid`s must belong to the result (else 400/404 per the route's conventions). A whole-list reset variant (or reuse: `order` with `manualRank = computedRank` for all is equivalent, but a dedicated reset that NULLs is cleaner). Returns the updated ordering. So **one drag = one atomic call**, trivially rollback-able. Integration test: authz (stranger/curator/finalized-409), atomicity (a bad `rid` rolls the whole batch back), and the resulting order.

### §4.3 S3b — the drag/keyboard UI on the DRAFT result page
- **"Put in order by hand"** turns the ranked list into a **drag-to-reorder** list (PRODUCT.md:55 sanctions drag for reordering results; **no swiping**; ≥44px handles). On drop → compute the new dense `manualRank` sequence for the affected block → **one** bulk PATCH (§4.2) → optimistic reorder, revert on failure (single call = clean rollback).
- **Keyboard/AT path (AA-sufficient, F7):** per-row **move-up / move-down** buttons (≥44px, disabled at ends, focus stays on the moved control), each issuing the same bulk PATCH for the adjacent swap. **No full aria grabbed/dropped pattern** (over-engineered, SR-inconsistent). `role="status"` announces "Moved {name} to position N of M." `prefers-reduced-motion` disables the reorder animation.
- **Reset** → "Back to the computed order" (whole-list or per-item) → the reset path.
- **Finalized guard** → the reorder affordance is **absent** on a finalized result; offer "Make a revision" (existing supersede flow) instead.

### §4.4 Live Standing vs the draft overlay — the UX bridge (F review Q2)
Separation is **forced by the data model**: live Standing (§2) synthesizes rows keyed by `itemId` with no `sort_result_items` row (`standing.ts:18-24`) — there is nowhere to hang a `manualRank`. So hand-ordering lives on the **materialized draft result**, not live Standing. To avoid "my order reverted" confusion, a one-line framing on each surface: live Standing = "the current picture"; the draft result = "the keepsake you can shape." (No behavior coupling between them.)

### §4.5 Test floor (C)
- S3a: the integration cases above.
- S3b: drag drop issues one bulk PATCH with the correct new order; optimistic + rollback on a mocked failure; move-up/down issues the adjacent-swap PATCH; affordance absent when finalized; `role="status"` announce; ≥44px handle class; reduced-motion disables the transition.
- e2e (CI e2e job): draft result → drag one item → reload → order persists (un-mocked through the bulk PATCH → DB).

## §5 — PR structure / rollout

Four PRs, each independently shippable; developed locally now, **pushed once the Actions budget is set**:
- **PR S1 — Standing usage chip (A):** read-only, no migration, no enumerated lens. `deriveUsage` wire + chip + usage-only gate + tests. Smallest, ships value first. File the deferred-lens bead at close.
- **PR S2 — Usage snapshot + revision (B):** migration + materialization seam + fresh-fold revision + finalized chip + tests. Migration deploys before the reads.
- **PR S3a — Bulk re-rank endpoint:** the transactional endpoint + integration tests. No UI.
- **PR S3b — Re-rank UI:** drag + move-up/down + reset + e2e + light/dark screenshots (UI PR).

S1, S2, S3a are loosely coupled and can proceed in any order; S3b depends on S3a. Keeping S3a/S3b split bounds review and CI scope.

## §6 — Resolved decisions (from the adversarial review)
1. **`lovedAndResting` / usage-only split view** — **deferred** (TONE red-line; needs a TONE.md decision before building). S1 ships per-item chips only.
2. **Manual overlay vs live Standing** — **separate, forced by the data model**; §4.4 adds the framing bridge.
3. **Re-rank cost** — a drag is a **dense multi-row rewrite**, so Epic S ships a **transactional bulk endpoint** (§4.2); one drag = one atomic call.
4. **Revision usage** — **fresh-fold** (re-derive at revision materialization; less code; §3.3), consequence stated.
5. **a11y reorder** — **move-up/down** (AA-sufficient); reject full aria drag-drop; honor reduced-motion.
6. **`usageKnown` split view** — **not shipped** (per-item chip is enough; avoids three usage surfaces on one page).
7. **Copy** — all new strings are first-order TONE items; the chip copy ("In your life"/"Resting"), "Put in order by hand", and "Back to the computed order" go through TONE-review during S1/S3b; the deferred enumerated lens needs a TONE.md amendment before it's ever built.
8. **Migration** — additive nullable `text`, expand-then-use; no backfill; convention over CHECK (matches precedent).
