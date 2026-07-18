# Sort Orientation Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orientation dashboard (per-sort progress + ranking after every round), the results-images MUST (including a token-authorized shared photo route), the owner's language sweep, first-order PRODUCT/TONE amendments, and finalize-completes-session — per `docs/superpowers/specs/2026-07-17-sort-orientation-design.md` (rev 2, THE binding text; every task reads it first).

**Architecture:** Five independent seams: (1) a new public share-scoped photo route delegating to `servePhotoFile`; (2) server-derived progress lines on the session hub + workspace card; (3) `WhatMoved.resultsHref`; (4) a centralized copy sweep incl. e2e/capture updates and the PRODUCT/TONE amendments; (5) `finalizeResult` in one `withTransaction` + round-page guards.

## Global Constraints

Spec rev 2 §A–§E bind verbatim (strings, omit-at-zero rules, accomplished-count framing, "ranking" never "order", SessionAnalytics heading unchanged). TDD; commit per task; lint 0 errors per task; `npm run test:db` mandatory (routes + transaction touched); the PR body flags the one amendment-wording delta ("and the quiet door…") for owner ratification.

### Task 1: Shared photo route + results images (§A)

**Files:** Create `src/app/api/shared-results/[token]/photos/[photoId]/route.ts`; modify `src/app/shared-results/[token]/page.tsx`, `src/features/results/RerankPanel.tsx` (+tests), `src/proxy.ts` + `src/lib/middleware-auth.test.ts` (add `api/shared-results(?:/|$)` exclusion + lookalike pins), DB-tier route test (extend the existing shared-results integration test file or sibling), `e2e/shared-results.spec.ts` (anonymous image-bytes assertion).

- [ ] TDD per spec §A.4: DB-tier no-session tests first (200 bytes / 404 outside-result / 404 revoked), then the route (share → finalized result → result-item membership → `servePhotoFile`; single 404 posture), then the page wiring + RerankPanel fallback + matcher change. Commit: `feat(share): shared results show item photos via a token-scoped route`

### Task 2: Progress lines (§B)

**Files:** Create `src/features/sessions/roundProgress.ts` (pure derivations + bucket thresholds) + test; modify session hub page (round cards' progress lines), `src/app/collections/[id]/page.tsx` + `ActiveSessionPanel`/`SessionResumeCard` seam (workspace "N of M sorted so far" meta — real counts, never itemPreview.length), their tests.

- [ ] TDD: derivation unit tests first (fractions, omit-at-zero for ALL THREE, confidence bucketing + monotonicity), then wiring. Commit: `feat(sort): per-sort progress on the hub and workspace — orientation, gently`

### Task 3: Ranking after every round (§C)

**Files:** `src/features/sorting/WhatMoved.tsx` (+test) — `resultsHref` prop, link before "Back to your sort"; three round-page hosts pass it; `SeeResultsCard.tsx` label → "See results" (+test).

- [ ] TDD. One e2e assertion added in the sort-session journey (recap shows "See your ranking so far"). Commit: `feat(sort): the ranking is one tap from every round's end`

### Task 4: Language sweep + amendments (§D)

**Files:** `roundCopy.ts` (+test), `compare/page.tsx`, `WelcomeCompare.tsx`, `SortHelpDialog.tsx`, `results/page.tsx` h1, `WelcomeStanding.tsx` h1, all unit tests in the §D table, **e2e/compare.spec.ts, e2e/sort-session.spec.ts, e2e/welcome-walkthrough.spec.ts, e2e/screenshots/capture.ts**, PRODUCT.md (4 edits incl. the flagged clause), TONE.md (1 edit).

- [ ] Strings verbatim from spec §D. Post-sweep grep proves zero remaining "love more" / "Show me what I love" outside the vocabulary-note-sanctioned sites; "Where things stand" remains ONLY in SessionAnalytics. Run the four e2e files locally. Commit: `feat(copy): which would you reach for first — the language of sorting, amended first-order`

### Task 5: Finalize completes the session (§E)

**Files:** `src/server/services/SortResultService.ts` (`finalizeResult` → `withTransaction`, resolve open session by result's collectionId+curatorId, mark completed), round pages triage/usage/compare (status guard → redirect to hub), DB-tier tests (atomicity, no-open-session no-op), page-guard tests.

- [ ] TDD. Commit: `feat(sessions): finalize closes the pass; rounds guard a finished sort`

### Task 6: Gates, review, PR

- [ ] Full gates: lint / test:ci / build / test:db; e2e: `shared-results`, `compare`, `sort-session`, `welcome-walkthrough`, `results`, `session-pause` (tablet).
- [ ] Whole-branch adversarial review (Security REQUIRED — new public byte route; UX; QA), fold findings.
- [ ] Screenshots (light+dark): hub with progress lines, recap with ranking link, shared page WITH photos (anonymous context), compare page with the new question. `/sync-docs` (API.md new route; ARCHITECTURE matcher line). graphify update. PR (flag the amendment delta), merge when green, /close-out (close purses-g9vg, purses-21x5.1, purses-1xbp.1, purses-1xbp.2 if the copy nuance is subsumed — check).
