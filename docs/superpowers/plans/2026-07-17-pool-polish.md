# Pool Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The four verified pool polish items per `docs/superpowers/specs/2026-07-17-pool-polish-design.md` (rev 2 — it is the binding blueprint: exact strings, semantics, and tests live THERE; read it first and follow it to the letter).

**Architecture:** Client-only changes in `src/features/pool/` + the pool page, plus one shared client-safe constants module (`src/lib/pool-limits.ts`: `MAX_GROUP_PHOTOS` + the cap sentence) imported by `ItemService` and the pool UI.

## Global Constraints

All copy, clear-semantics, and token rules are in the spec rev 2 §Changes — verbatim. TDD; lint 0 errors; no API/DB changes.

### Task 1: Cover cue + cap + copy (spec §1, §3, §4)

**Files:** `src/features/pool/PoolPhotoGrid.tsx` (+test), `src/features/pool/PoolActionBar.tsx` (+test), `src/app/collections/[id]/pool/page.tsx`, create `src/lib/pool-limits.ts`, modify `src/server/services/ItemService.ts` (import the shared constant/sentence — behavior identical, its tests keep passing).

- [ ] Failing tests per spec §Testing (grid Cover pill + promotion; action-bar hint at sm+, cap message + disabled actions at 51, labels; shared-constant parity test) → implement → green → commit `feat(pool): cover cue, visible cap, gentler copy`.

### Task 2: Actionable notices + error passthrough (spec §2, §3)

**Files:** `src/features/pool/PoolPhotoGrid.tsx` (+test) — notice state carries `{ text, href?, label? }`; `PoolActionBar` or wherever the notice renders follows.

- [ ] Failing tests per spec §Testing (notice links for all four outcomes; persistence + clear semantics; plain-notice 4 s unchanged; `error`-field passthrough + fallback) → implement → green → commit `feat(pool): success notices link to the created items; server messages surface`.

### Task 3: Review + PR + merge

- [ ] Whole-branch adversarial review (UX + QA scaled), fold findings.
- [ ] Gates: `npm run lint`, `npm run test:ci`, `npm run build`; e2e: mapped pool/workspace specs (`adaptive-collection-workspace.spec.ts` + any pool spec) tablet; phone run for PoolActionBar changes (`PW_VIEWPORT=phone` on the pool-related spec) since the bar is phone-styled.
- [ ] Screenshots light+dark (pool grid with Cover pill + hint; notice with link; cap state). sync-docs check (pool paths are unmapped; ItemService is `src/server/services` — not in doc-ownership map; confirm). graphify update, push, PR, merge when green, /close-out (close all four purses-id3f children + epic if none open).
