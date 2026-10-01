# Collection workspace: state-aware Continue — design

**Date:** 2026-07-17 · **Epic:** purses-1xbp · **Branch:** feat/collection-home-continue · **Rev 2** (adversarial spec review folded: UX, Architect+Craftsman)
**Provenance:** decisions recorded from the verified design-system reconciliation; owner pre-approved the epic scope and granted overnight execute-and-merge authority.

## Purpose

Make the workspace's Continue section obey the wireframes' state rule — *"'Start' before anything is sorted; 'Keep sorting' only after. No items at all → Add photos"* and *"One primary action at a time — 'Sort' wins once items exist"* — soften the resume card's machinery language, and dedupe the hand-written-twice resume card.

## What exists today (verified on main)

- `src/features/sessions/ActiveSessionPanel.tsx` owns the Continue section chrome (post-#351); precedence `settled → undo → session card → null`. A user with items who never sorted sees no Continue section and no start affordance.
- The session card says "Active session" with a status `Badge` (neutral grays; the heading text alone already disambiguates active/paused); active body falls back to "Preference discovery"; the card heading is an `h2 text-lg` under the section's `h2`. The workspace card carries dark-elevation classes (`dark:bg-surface-raised dark:shadow-raised`, pinned by a test); the hub card has none.
- `src/app/collections/[id]/page.tsx`: fetches ALL of the curator's sessions (L42) — `sessions.length > 0` is a free has-ever-sorted signal; `currentSession` filters to active|paused; `leadActionVariant` demotes the Build lead only when a session exists.
- `src/app/collections/[id]/sort/page.tsx` duplicates the session card (~L58–91) with Resume + Details; hub outline is `h1 → h2 (current card) → h3 (history rows)`.
- e2e asserting the "Active session" copy: `session-undo.spec.ts` (3), `session-pause.spec.ts` (1), **`session-create-after-set-aside.spec.ts` (4)** — all must be updated with the rename.

## Changes

### 1. Start/continue card (the "Sort wins" rule, progress-aware)

`ActiveSessionPanel` gains two props: `startHref?: string` and `hasEverSorted: boolean`. When there is no session, no undo, no settled note, and `startHref` is provided, the panel renders — inside the same ContinueSection — a start card whose copy keys on **sort progress, not session existence** (the wireframe's actual rule):

- Never sorted (`hasEverSorted === false`): heading **"Start sorting"**, body **"Begin with how you feel about each."** (wireframe-verbatim).
- Sorted before (completed/abandoned sessions exist, none open): heading **"Keep sorting"**, body **"Pick up where you left off — one decision at a time."**
- Either way: one primary `Button` labeled like the heading, linking to `startHref` (`${base}/sort/new`).

The page passes `startHref` and `hasEverSorted={sessions.length > 0}` only when `itemPreview.length > 0`; zero items keeps the empty/pool states unchanged. With `startHref` absent and nothing else to show, the panel returns `null` — the #351 bare-heading pin extends to this case.

### 2. One primary action — and the accepted undo-window exception

`leadActionVariant` demotes to `"secondary"` when `currentSession` exists **or** items exist (both signals move in lockstep with the start card, so no state renders two primaries — verified in review).

**Accepted trade-off (documented deliberately):** during the set-aside undo window (and the rare post-409 settled note), the panel shows only the quiet notice and the page has **zero** primary actions until the undo resolves or navigation occurs. The A1 rule is "at most one dominant action"; zero-during-undo is TONE-preferable to a shouting CTA beside a reversible-escape notice. The Architect review's sticky-after-409 trace is real but self-heals on any navigation, and the 409 path already tells the person a newer sort exists.

### 3. Soft copy

- Active heading "Active session" → **"Keep sorting"** (paused stays "Your sort is paused").
- **Drop the status Badge** (review confirmed: neutral grays, no color-blind signal lost; the literal "active/paused" chip is machine voice — removal is a TONE win).
- Active body fallback "Preference discovery" → **"Pick up where you left off — one decision at a time."** (a real `session.goal` still wins).
- **No still-to-sort count** — deferred to `purses-1xbp.1` (owner TONE call).

### 4. One `SessionResumeCard` — shell and strings only

```tsx
interface SessionResumeCardProps {
  status: "active" | "paused";
  goal: string | null;
  /** Workspace renders h3 under its "Continue" h2; the hub keeps its h2 slot. */
  headingLevel: "h2" | "h3";
  /** Extra Card classes — the workspace passes its pinned dark-elevation set. */
  className?: string;
  /** The ENTIRE action area. Consumers own their action rows: the workspace's
   *  confirm-flow ternary (which REPLACES Resume while confirming) and the
   *  hub's Resume+Details both live in the caller, state machines untouched. */
  actions: ReactNode;
}
```

The card owns the Card shell, the heading ternary ("Keep sorting"/"Your sort is paused") at the given level, and the body line (paused line / goal / fallback). It does **not** own Resume: the review showed the workspace's confirm flow replaces the whole action row, so an actions-slot that owns the entire area is the only shape that keeps the state machine in `ActiveSessionPanel` (rev 1's `children`+`resumeLabel` interface is withdrawn). Strings live in one file; both surfaces get the soft copy at once. Visual divergence is explicit: the workspace passes `className="dark:bg-surface-raised dark:shadow-raised"` (its pinned test keeps passing); the hub passes none and keeps `headingLevel="h2"` (outline `h1→h2→h3` preserved).

## Errors & edges

- Undo/settled precedence over the start card unchanged (a just-set-aside session shows its undo, never "Start sorting").
- Hub "New session" gating (purses-4bhh) untouched. No API/DB/route changes.

## Testing

- `ActiveSessionPanel.test.tsx`: start card renders with correct progress-keyed copy (both variants); absent when session exists / undo pending / `startHref` missing (bare-DOM pin extends); undo-precedence case; existing dark-elevation pin keeps passing via the className pass-through.
- New `SessionResumeCard.test.tsx`: heading per status at both heading levels, Badge absent, fallback copy, actions slot renders.
- Page-level: `collections/[id]` page test (if present) or panel test covers `hasEverSorted` wiring; hub page test updated for new copy + `h2` level.
- e2e copy updates in ALL THREE files: `session-undo.spec.ts`, `session-pause.spec.ts`, `session-create-after-set-aside.spec.ts`; suites `adaptive-collection-workspace`, `session-*` must stay green. New jsdom coverage for the items-no-session fixture: start card present + lead action demoted.
- PR screenshots: workspace start card (never-sorted), workspace resume card, hub card — light+dark.

## Out of scope

- One-tap session start (purses-znkt child) — start card links to `/sort/new`.
- Still-to-sort meta (purses-1xbp.1, owner).
- Hub voice pass beyond the shared card strings (purses-znkt child).
