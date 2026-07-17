# Collection workspace: state-aware Continue — design

**Date:** 2026-07-17 · **Epic:** purses-1xbp · **Branch:** feat/collection-home-continue
**Provenance:** decisions recorded from the verified design-system reconciliation (wireframe rules quoted below) and its adversarial verification; owner pre-approved the epic scope and granted overnight execute-and-merge authority.

## Purpose

Make the workspace's Continue section obey the wireframes' state rule — *"'Start' before anything is sorted; 'Keep sorting' only after. No items at all → Add photos"* and *"One primary action at a time — 'Sort' wins once items exist"* — and soften the resume card's machinery language. Dedupe the resume card that is hand-written twice.

## What exists today (verified on main)

- `src/features/sessions/ActiveSessionPanel.tsx` owns the Continue section chrome (post-#351): renders the section + heading only when it has content (settled note / undo notice / session card); returns `null` when `session == null` with no undo — so a user with items who never sorted sees **no Continue section and no start affordance**.
- The session card says **"Active session"** with a status `Badge`; active body falls back to **"Preference discovery"**. Card heading is an `h2 text-lg` nested under the section's `h2` "Continue".
- `src/app/collections/[id]/page.tsx`: `leadActionVariant` demotes the Build lead ("Add photos"/"Make items") to secondary **only when a session exists**; with items but no session, Build stays the primary and Sort has no presence at all.
- `src/app/collections/[id]/sort/page.tsx` (~L58–91) hand-duplicates the same session card (heading ternary, Badge, identical strings, Resume/ResumeControl) with a Details action instead of Set aside.

## Changes

### 1. Start card (the "Sort wins" rule)

`ActiveSessionPanel` gains `startHref?: string`. When there is **no session, no undo, no settled note** and `startHref` is provided, the panel renders — inside the same ContinueSection — a start card:

- Heading (`h3`): **"Start sorting"**
- Body: **"Begin with how you feel about each."** (wireframe copy, verbatim)
- One primary `Button` ("Start sorting") linking to `startHref`.

The page passes `startHref={`${base}/sort/new`}` **only when `itemPreview.length > 0`** (zero items keeps the wireframe's "No items at all → Add photos" — the empty/pool states are unchanged). `leadActionVariant` demotes to `"secondary"` when `currentSession` exists **or** items exist — exactly one primary action on the workspace, and it's Sort once there is anything to sort.

With `startHref` absent (pool-only workspace) and nothing else to show, the panel still returns `null` — no bare heading (the #351 invariant holds; tests keep pinning it).

### 2. Soft copy on the resume card

- Active heading **"Active session" → "Keep sorting"** (paused stays "Your sort is paused").
- **Drop the status `Badge`** — the sentence already carries the state; a status chip is machinery.
- Active body fallback **"Preference discovery" → "Pick up where you left off — one decision at a time."** (a real `session.goal` still wins).
- Card headings become **`h3`** (start card and resume card) under the section's `h2` — fixes the nested-h2 outline flagged in review.
- **No still-to-sort count** in this pass: the wireframe's "62 still to sort" needs a curator-scoped count query AND a TONE call (counts sit next to the no-shaming-metrics rule). Filed as a follow-up bead for the owner to weigh; out of scope here.

### 3. One `SessionResumeCard`

Extract the duplicated card into `src/features/sessions/SessionResumeCard.tsx`:

```tsx
interface SessionResumeCardProps {
  session: { id: string; number: number | null; goal: string | null; status: "active" | "paused" };
  resumeHref: string;
  curatorId: string;
  /** Right-side actions after Resume (workspace: Set aside; hub: Details). */
  children?: ReactNode;
  /** Workspace passes its resume-busy callback so Set aside can disable during a PATCH. */
  onResumeBusyChange?: (busy: boolean) => void;
  resumeLabel?: string; // workspace "Resume sorting", hub "Resume"
}
```

It owns: the Card shell, the heading ternary ("Keep sorting"/"Your sort is paused", `h3`), the body copy (goal/fallback/paused line), and the Resume affordance (paused → `ResumeControl` PATCH-then-navigate; active → `Link`+`Button`). Consumers supply their extra actions as children: `ActiveSessionPanel` its Set-aside confirm flow; the sort hub its Details link. Pure refactor of rendering — the set-aside/undo state machine stays in `ActiveSessionPanel`; the hub page stays a server component that renders the (client) card.

Both surfaces therefore get the soft copy at once, and the strings live in one file.

## Errors & edges

- Undo/settled notices keep precedence over the start card (a just-set-aside session must show its undo, not "Start sorting").
- The hub's "New session" button behavior is untouched (purses-4bhh gating).
- No API/DB changes; no route changes.

## Testing

- `ActiveSessionPanel.test.tsx`: start card renders (heading, body, primary link href) when `startHref` + no session; does NOT render when a session exists, when undo is pending, or when `startHref` is absent (bare-heading pin extends: no session AND no startHref → empty DOM). Undo-precedence test: set aside → undo notice, not start card.
- New `SessionResumeCard.test.tsx`: heading per status, Badge absent, fallback copy, paused renders `ResumeControl` (PATCH before navigate — port the existing assertion), active renders a plain link, children render.
- Hub `sort/page` coverage: existing page tests updated to the new copy ("Keep sorting", no badge).
- e2e: existing `adaptive-collection-workspace.spec.ts`, `session-undo.spec.ts`, `session-pause.spec.ts` must stay green (they assert workspace/hub flows); update any copy-level assertions ("Active session") they pin.
- Screenshots for the PR: workspace with start card, workspace with resume card, hub card — light+dark.

## Out of scope

- One-tap session start (purses-znkt child) — the start card links to `/sort/new`.
- Still-to-sort meta (follow-up bead, owner TONE call).
- Any sort-hub voice pass beyond the shared card's strings (purses-znkt child).
