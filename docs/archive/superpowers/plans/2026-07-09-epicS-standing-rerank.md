# Epic S — Implementation Plan (Standing usage chip · snapshot/revision · bulk re-rank + UI)

> Executes `docs/superpowers/specs/2026-07-09-epicS-standing-rerank-design.md` (rev 2, adversarially reviewed). Bead `purses-mvn5`. Four independently-shippable PRs; **developed locally now, pushed once the Actions budget is set.** TDD per task (failing test first); the spec's §2.4/§3.5/§4.5 test floors are the acceptance criteria.

## Global constraints
- No push/PR until budget is set (local gates only: `npm run build`, `test:ci`, `lint`, `test:db`, local `playwright`).
- Reuse Epic R primitives: `deriveUsage` (`src/lib/derive-usage.ts`), `DecisionController.listForCurator`, `usesLine`/`restingLine` register.
- DATA-6: the curator event log stays server-side; never serialized into the client payload.
- TONE: chip copy + re-rank affordance copy are first-order TONE items; the deferred enumerated lens is NOT built (needs a TONE.md amendment). No counts/denominators/urgency in new copy.
- Every new test runs in CI (unit/jsdom in `test:ci`; DB in `test:db`; e2e in the CI e2e job).

## PR S1 — Standing usage chip (deliverable A; read-only, no migration)
Branch `feat/epicS-standing-chip`. Spec §2.
1. **Page usage read** — `results/page.tsx`: add the `listForCurator` + `deriveUsage` read to the `Promise.all`; pass `usageByItemId` to `RankedResults`/`ItemCard`. (test: page issues the read; DATA-6 — log absent from payload.)
2. **The chip** — `ItemCard`/`RankedResults`: render "In your life" / "Resting" per usage-known item, absent when undecided; AA, non-color-dependent, exported copy constants. (test: chip present/absent cases; register scan.)
3. **Usage-only gate (F5)** — extend the render gate so a usage-known collection with no love ranking shows the list+chips, not "Start sorting." (test: usage-only collection.)
4. Boundary: `standing.test.ts` unchanged (regression); file the deferred-lens bead; docs/API or ARCHITECTURE only if a fact moved (likely none — read wiring).

## PR S2 — `sort_result_items.usage` snapshot + revision (deliverable B; migration)
Branch `feat/epicS-usage-snapshot`. Spec §3.
1. **Migration** — `drizzle/` add nullable `usage text` to `sort_result_items`; update `schema.ts`. (test: migration applies; schema matches.)
2. **Materialization seam (F4)** — thread `curatorEvents`+`deriveUsage` into `createResultWithItems`/`createDraftResult`; `MaterializedItem` gains `usage`; repo create-path writes it. (test: draft stamps usage; unknown → NULL.)
3. **Fresh-fold revision (F3)** — `supersedeResult` re-derives usage at materialization; `cloneItemsFrom` unchanged (drops manual, doesn't touch usage). (test: revision re-derives; manual dropped.)
4. **Finalized display** — `[resultNumber]/page.tsx` renders the snapshot chip; legacy all-NULL → none.

## PR S3a — Transactional bulk re-rank endpoint (deliverable C backend; F1)
Branch `feat/epicS-rerank-endpoint`. Spec §4.2.
1. `PATCH /api/sort-results/[id]/items` `{ order: [{rid, manualRank}] }` in one `withTransaction`; draft-only (409), `requireApiResultAccess`, Zod, all rids ∈ result. Whole-list reset path (NULLs).
2. Integration tests: authz (stranger/curator/finalized-409), atomicity (bad rid rolls back), resulting order.

## PR S3b — Re-rank UI (deliverable C frontend; depends on S3a)
Branch `feat/epicS-rerank-ui`. Spec §4.3.
1. Draft result page: "Put in order by hand" → drag-to-reorder (no swiping, ≥44px handles) → one bulk PATCH; optimistic + rollback.
2. Keyboard path: move-up/down (≥44px, ends disabled, focus retained), same bulk PATCH; `role="status"` announce; reduced-motion.
3. Reset ("Back to the computed order"); finalized guard (affordance absent → "Make a revision").
4. §4.4 framing lines (live vs keepsake). e2e: drag → reload → persists. Light/dark screenshots (UI PR).

## Order
S1 → S2 → S3a → S3b (S3b needs S3a). S1/S2/S3a loosely coupled. Execute locally with subagent-driven-development (fresh subagent + adversarial review per task); hold all pushes.
