# PR2 — o93 results "letting go / Onward" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Spec: `docs/superpowers/specs/2026-06-23-ui-experience-design.md` §6 (+ §4.2/§4.3). This is the P1 headline (purses-o93 remainder; scoring already landed by closed purses-h02).

**Goal:** On the results page, stop count-shaming and stop lumping the lowest tier into the ranking: remove the bold per-tier integer grid, partition the ranked items into a **loved** ranking and a separate gentle **Onward** ("where these go next") section, end the page on affirmation, and handle the all-Onward screen with care.

**Architecture:** All in `src/app/collections/[id]/results/[resultNumber]/page.tsx` (a Server Component), plus one tiny shared bucket helper. Reuse `MostLovedHero`, `ItemCard`, and the existing `tier-*` tokens. No scoring change, no schema change, no API change — pairwise→ranking is already wired (h02); PR2 adds a regression guard for it.

**Tech Stack:** Next.js App Router (Server Component), TypeScript, Vitest + jsdom, Playwright e2e, DB-backed tests under `src/lib/db`.

## Global Constraints

- **Tone (TONE.md, first-order):** affirmation, never subtraction. **No count/tally framing** (a bold per-tier integer is the machine counting — forbidden by commitments 1 & 4). Letting go is **never the headline**, including structurally (the page must not *end* on it). Forward-framed Onward copy ("where will it go next?"), never backward.
- **Design (DESIGN.md):** real `tier-*` tokens (the value-ramp; `tier-onward`/`tier-onward-ink` for Onward, AA-locked both themes, flips in dark). Playfair for display headings in `ink` (never teal). One shared tier→token source — do **not** add a 4th copy of the tier map.
- **a11y (WCAG 2.1 AA, both themes):** the Onward section is a semantic `<section>` with a heading; tap-first; reduced-motion safe.
- **Tests:** TDD failing-first. DB-backed/un-mocked-seam tests live under `src/lib/db/` (`RUN_DB_TESTS=1`); component/page tests jsdom (`// @vitest-environment jsdom`); e2e under `e2e/**`. The existing page test reconciles to the new contract (the count-grid + full-ranking assertions are intentionally inverted).
- **Git:** one logical change per commit; never commit to `main`. graphify before reading source; `graphify update .` after.

---

### Task 1: `effectiveBucket` + `partitionRanked` helper (single source of truth)

**Files:** Create `src/lib/results-buckets.ts` (+ `src/lib/results-buckets.test.ts`).

**Interfaces:**
- Produces:
  - `type Bucket = "top" | "high" | "medium" | "low";`
  - `effectiveBucket(ri: { manualBucket: Bucket | null; computedBucket: Bucket }): Bucket` → `ri.manualBucket ?? ri.computedBucket` (a manual override wins).
  - `LOVED_BUCKETS = ["top","high","medium"] as const` and `isOnward(b: Bucket): boolean` → `b === "low"`.
  - `partitionRanked<T extends { manualBucket: Bucket|null; computedBucket: Bucket }>(items: T[]): { loved: T[]; onward: T[] }` — preserves input order within each group; `onward` = items whose `effectiveBucket` is `low`, `loved` = the rest.

- [ ] **Step 1: Read.** `graphify query "results bucket manualBucket computedBucket tier type domain"`; check `src/types/domain.ts` for the existing bucket/`SortResultItem` types so `Bucket` matches (reuse the domain type if one exists rather than redefining).
- [ ] **Step 2: Failing test** (`results-buckets.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import { effectiveBucket, partitionRanked, isOnward } from "./results-buckets";
describe("effectiveBucket", () => {
  it("prefers the manual override over the computed bucket", () => {
    expect(effectiveBucket({ manualBucket: "low", computedBucket: "top" })).toBe("low");
    expect(effectiveBucket({ manualBucket: null, computedBucket: "high" })).toBe("high");
  });
});
describe("partitionRanked", () => {
  it("splits low (effective) into onward, keeps the rest loved, preserving order", () => {
    const items = [
      { id: "a", manualBucket: null, computedBucket: "top" },
      { id: "b", manualBucket: "low", computedBucket: "high" }, // manual override → onward
      { id: "c", manualBucket: null, computedBucket: "medium" },
      { id: "d", manualBucket: null, computedBucket: "low" },
    ] as const;
    const { loved, onward } = partitionRanked([...items]);
    expect(loved.map((i) => i.id)).toEqual(["a", "c"]);
    expect(onward.map((i) => i.id)).toEqual(["b", "d"]);
  });
});
```
- [ ] **Step 3: Run → FAIL.** `npx vitest run src/lib/results-buckets.test.ts`.
- [ ] **Step 4: Implement** the helper exactly as the Interfaces block specifies.
- [ ] **Step 5: Run → PASS.**
- [ ] **Step 6: Commit.** `feat(results): effectiveBucket + partitionRanked helper (single source of truth)`

---

### Task 2: Results page — remove the count grid, partition loved/Onward, affirmation end-beat

**Files:** Modify `src/app/collections/[id]/results/[resultNumber]/page.tsx`; Modify `src/app/collections/[id]/results/[resultNumber]/page.test.tsx`.

**Current state (verified):** `page.tsx` renders a 4-up grid of **bold integer counts** per tier (`bucketLabels`/`bucketRamp`, ~L104-111, `bucketCounts`), then `MostLovedHero` (rank 1) + a "The full ranking" grid over `ranked.slice(1)` — which **includes the `low`/Onward items**. The existing page test pins both behaviors (it asserts four "1" counts with no zeros, and that "Low Bag" appears under "The full ranking").

- [ ] **Step 1: Read.** `graphify query "ResultDetailPage MostLovedHero ItemCard bucketCounts ranked the full ranking"`; read `page.tsx` and `MostLovedHero.tsx` (props: `item`, `collectionId`, `heroPhotoUrl`) and `ItemCard.tsx` (props incl. `bucket`).
- [ ] **Step 2: Reconcile the page test FIRST (TDD — write the new contract, watch it fail).** In `page.test.tsx`, in the "tier sections + Onward + most-loved hero" describe:
  - **Replace** the count-grid tests (the "renders all four tier-count cards" + "counts each tier independently (every card shows 1, no zeros)") with the new contract:
    - `it("does not render a bold per-tier count tally (no count-shaming)")` — assert the page does NOT show the integer counts as a tier grid. Concretely: with one item per tier, `screen.queryByText("1")` finds no tier-count card (there is no count grid). (Keep it robust: assert there is no element matching the old count-card structure — e.g. no four `getAllByText("1")`.)
    - Keep tier *labels* present via the ItemCard badges (Love/Like/Maybe on cards, Onward in its section) — adjust the label assertion to query within cards/sections, not a count grid.
  - **Replace** the "renders the remaining items under 'The full ranking' (everything past the hero)" test: now "The full ranking" contains the **loved** rest (High Bag, Med Bag) and **NOT** "Low Bag"; "Low Bag" appears under the **Onward** section.
    ```tsx
    it("keeps the lowest tier OUT of 'The full ranking' and in a separate Onward section", async () => {
      const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
      render(ui);
      const fullRanking = screen.getByRole("heading", { name: /the full ranking/i }).closest("section")!;
      expect(within(fullRanking).getByText("High Bag")).toBeInTheDocument();
      expect(within(fullRanking).getByText("Med Bag")).toBeInTheDocument();
      expect(within(fullRanking).queryByText("Low Bag")).toBeNull();
      const onward = screen.getByRole("heading", { name: /where these go next|onward/i }).closest("section")!;
      expect(within(onward).getByText("Low Bag")).toBeInTheDocument();
    });
    it("ends the page on an affirmation beat, not the Onward section", async () => {
      const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
      const { container } = render(ui);
      // the last content section is an affirmation line, not the letting-go list
      expect(screen.getByText(/things you love|you love most|honored/i)).toBeInTheDocument();
    });
    ```
  - Keep the existing **Onward label**, **no-"Release"** (purses-xca), **hero peak**, and **empty-state** tests unchanged.
  - Add `import { within } from "@testing-library/react"`.
- [ ] **Step 3: Run → FAIL.** `npx vitest run "src/app/collections/[id]/results/[resultNumber]/page.test.tsx"` (new assertions fail against the current page).
- [ ] **Step 4: Implement `page.tsx`:**
  - Remove the 4-up count grid block (the `bucketLabels`/`bucketRamp` grid and `bucketCounts`). Delete `bucketCounts` if now unused.
  - Build `ranked` as today (sorted, item-joined), then `const { loved, onward } = partitionRanked(rankedResultItems)` using Task 1's helper (operate on the result-item rows that carry `manualBucket`/`computedBucket`, then map to `{ ri, item }`). Replace the inline `item.manualBucket || item.computedBucket` at the card with `effectiveBucket(ri)`.
  - Hero = `loved[0]`; "The full ranking" grid = `loved.slice(1)`.
  - **Onward section** (only when `onward.length > 0`): a semantic `<section>` with a Playfair `h2` in `ink` ("Where these go next"), one calm forward-framed line of copy, and a grid of `ItemCard` on the `low`/`tier-onward` bucket. No count, no red, no "released"/"discard"/"Release" language.
  - **Affirmation end-beat:** after the Onward section, a quiet closing `<p>` (person-side, forward) so the page's last beat is affirmation — e.g. "These are the things you love most." Keep it gentle, not a banner; reduced-motion safe. (SharePanel, when present for a finalized result, follows — sharing completed work is itself affirming.)
- [ ] **Step 5: Run → PASS.** The page test (new + kept assertions) green: `npx vitest run "src/app/collections/[id]/results/[resultNumber]/page.test.tsx"`.
- [ ] **Step 6: Commit.** `feat(results): partition loved vs Onward, drop count tally, affirmation end-beat (purses-o93)`

---

### Task 3: All-Onward edge case (the most tone-dangerous screen)

**Files:** Modify `page.tsx` (+ extend `page.test.tsx`).

- [ ] **Step 1: Failing test** (extend `page.test.tsx`): all items in the `low`/Onward set (no loved items) → the page leads with affirmation copy that honors the act of deciding, never "nothing loved", never a count.
```tsx
it("an all-Onward result leads with affirmation, never 'nothing loved' or a count", async () => {
  resultItemRepo.findByResult.mockResolvedValue([
    { id: "ri_low1", itemId: "i_low", computedRank: 1, manualRank: null, computedBucket: "low", manualBucket: null },
  ]);
  itemRepo.findByCollection.mockResolvedValue([{ id: "i_low", collectionId: "coll_01ABCDEF", number: 4, name: "Low Bag", brand: null, status: "active" }]);
  const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
  const { container } = render(ui);
  expect(screen.getByText(/you('ve| have) made your choices|honored|clarity/i)).toBeInTheDocument();
  expect(container.innerHTML).not.toMatch(/nothing|none of|0 /i);
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** in `page.tsx`: when `loved.length === 0` and `onward.length > 0`, render an affirmation lead (Playfair `h2`/copy in `ink`) that affirms the decisions/clarity reached — never absence-of-love, never a count — above the Onward section. (The exact wording is TONE-governed; keep it person-side and forward. Suggested direction: "You've made your choices" / honoring the deciding.) Do not render `MostLovedHero` or "The full ranking" when there is no loved set. Keep the existing empty-state (zero ranked items at all) path unchanged.
- [ ] **Step 4: Run → PASS** + the full page test file green.
- [ ] **Step 5: Commit.** `feat(results): gentle all-Onward leading affirmation (purses-o93)`

---

### Task 4: Pairwise drives the ranking — DB-backed regression guard

**Files:** Create `src/lib/db/pairwise-ranking.integration.test.ts`.

**Why:** purses-h02 fixed the bug where pairwise results were discarded; this is the regression guard the spec (§6.4) requires — a real seam test that a pairwise choice changes the **materialized** ranking order.

- [ ] **Step 1: Read.** `graphify query "ScoringService pairwise decision event materialize sort result items ranking"`; read `src/server/services/ScoringService.ts` and an existing pipeline test (`src/lib/db/sort-results-pipeline.integration.test.ts` and/or `sort-pipeline.integration.test.ts`) to mirror the harness (seed collection/items/session, record triage + pairwise decisions, materialize, read `SortResultItem`s).
- [ ] **Step 2: Failing test** (`src/lib/db/pairwise-ranking.integration.test.ts`, `RUN_DB_TESTS=1`-gated, mirroring the existing pipeline harness): seed two items A and B triaged into the **same** tier; record a pairwise decision where **B beats A** (repeat/strong enough to order them per the ScoringService model); materialize the result; assert the resulting order places **B before A** (and/or B's score/rank > A's). Assert on the real materialized `SortResultItem` rows (re-read), not a mock. (If the model needs N consistent wins to separate within a tier, record enough — follow ScoringService's delta semantics from Step 1.)
- [ ] **Step 3: Run → FAIL or PASS?** Since h02 already wired this, the assertion may PASS immediately — that is acceptable for a *regression guard*, but you MUST first confirm the test is genuine: temporarily invert the expected order (expect A before B) and confirm it FAILS (proving the test exercises real ordering, not a tautology), then restore. Document this in the report. Run via the repo's DB-test flow (`RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/pairwise-ranking.integration.test.ts`).
- [ ] **Step 4: Commit.** `test(results): pairwise choice changes materialized ranking order (regression guard, purses-o93)`

---

### Task 5: e2e + screenshot surface — Onward renders as a separate gentle section

**Files:** Create `e2e/results-onward.spec.ts`; Modify `e2e/screenshots/capture.ts` (add a results surface).

- [ ] **Step 1: Read.** `graphify query "e2e seed sort scenario result finalized onward results page slug"`; read `e2e/fixtures/seed.ts` (does `seedSortScenario`/a result seed produce a result with both loved AND low/Onward items? what's the results URL — `/collections/<slug>/results/<n>`?). Read `playwright.config.ts`.
- [ ] **Step 2: Write `e2e/results-onward.spec.ts`** (fixture auth, 3 viewports): navigate to a seeded result that has both loved and Onward items; assert (a) the "Where these go next" / Onward section heading is present and is a SEPARATE section from "The full ranking"; (b) an Onward item appears under it and NOT under "The full ranking"; (c) there is no bold per-tier count grid; (d) the most-loved hero is present. If the existing seed has no low/Onward item in its result, seed one via the existing fixtures (mirror `seedMembersScenario`'s self-contained pattern) — note it in the report.
- [ ] **Step 3: Add a `results` screenshot surface** to `e2e/screenshots/capture.ts` (`["results", \`/collections/${slug}/results/1\`]` using whatever seed produces a result with an Onward item; if the sort-scenario seed's result lacks Onward items, point at a richer seed). This captures the redesigned results page (loved ranking + Onward section) for the PR body.
- [ ] **Step 4: Run e2e** (Docker up): `npx playwright test e2e/results-onward.spec.ts`; run with `auth-navigation`/`layout` for cross-spec safety. Capture output.
- [ ] **Step 5: Commit.** `test(e2e): results renders Onward as a separate section; capture surface (purses-o93)`

---

## Definition of done (PR2)

- [ ] All tasks committed; `build`, `test:ci`, `lint`, `auth:verify` green; `RUN_DB_TESTS=1 test:db` green (incl. the new pairwise-ranking guard).
- [ ] `graphify update .`; `/sync-docs` (results page is `src/app/collections/**` — NOT in the doc-ownership map; the new `src/lib/results-buckets.ts` isn't mapped either — expect a no-op, confirm).
- [ ] Light+dark screenshots of the **redesigned results page** (loved ranking + separate Onward section, no count grid) embedded inline in the PR body — including the **all-Onward** screen if feasible.
- [ ] Whole-branch adversarial review (UX/Design/a11y/QA) — this is the P1 tone centerpiece; expect the UX persona to scrutinize the Onward copy + the end-beat hard.
- [ ] CI green incl. selective e2e; PR merged; close **purses-o93** via `/close-out` after merge.

## Self-review notes
- **Spec coverage:** §6.1 (count grid)→T2; §6.2 (partition)→T1+T2; §6.3 (Onward section)→T2; §6.4 (Peak-End end-beat)→T2; §6.5 (all-Onward)→T3; §6.6 (pairwise verify)→T4; e2e→T5.
- **Reconciliation is intended:** the existing page test's count-grid + low-in-full-ranking assertions are inverted on purpose (spec-sanctioned + adversarial-review-mandated). The keep-tests (Onward label, no-"Release", hero, empty-state) are unchanged regression guards.
- **Type consistency:** `Bucket` reuses the domain type; `effectiveBucket(ri)`/`partitionRanked` (T1) are the single source used by both the partition and the per-card bucket in T2.
- **No scope creep:** Epic D (rehome/story capture) fills this Onward section LATER (PR4) — PR2 builds the container only.
