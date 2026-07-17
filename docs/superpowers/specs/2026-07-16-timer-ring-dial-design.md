# Timer ring + touch-set dial — design

**Date:** 2026-07-16 · **Epic:** purses-n4wm · **Branch:** feat/timer-ring
**Owner decisions folded in:** one branch/PR for the whole epic; the timer is settable by touch (min 30 s, max 5 min), live during a round; 30-second snapping; dragging below the minimum lands on "no timer"; HTML + CSS rendering (no SVG).

## Purpose

Replace the linear round-timer bar with the wireframes' quiet ring ("violet ring = round timer (no digits)", "Quiet ring, no clock"), add the gold completion moment ("4 · Round complete (ring → gold)"), give round lengths their feel-based names, and make the length a touch-set dial. The timer stays a gentle fatigue guard, never a stopwatch.

## What exists today (verified)

- `src/features/sorting/RoundTimer.tsx` — linear `h-2` bar, violet `bg-decor` fill shrinking on a 1 s tick, gold `bg-spark` at expiry with "✓ Round complete", visible "About N minutes left in this round" text, `role="timer" aria-live="polite"`; `boxMs=null` renders only the round label.
- `src/lib/round-timer.ts` — pure math (`remainingMs`, `isExpired`, `fractionElapsed`, injectable clock). **Unchanged by this work.**
- `src/features/sorting/RoundShell.tsx` — header `timer` slot (`min-w-40 flex-1 sm:max-w-xs`), plus a step-circle round-progress indicator (not a timer; untouched).
- `src/features/sorting/useOptimisticRound.ts` — owns `startedAtMs`, `boxMs`, `expired`, `onExpire`, `onBoxChange(box)`; mid-round changes re-arm `boxMs` against the **unchanged** start time; expiry-as-pause. Contracts preserved.
- Round length is chosen from discrete options (`ROUND_BOX_OPTIONS`), persisted device-locally as `pi-round-box`; the welcome walkthrough seeds `"2"`, and a stale `"10"` clamps.

## Components

### 1. `TimerRing` (shared presentational)

One stateless element used by every timer surface. A `rounded-full` div whose background is `conic-gradient(<sweep> var(--ring-fraction), <track> 0)`, with an inner disc making it a ring — the wireframes' own technique. No SVG.

- **Colors:** sweep `decor` (violet), track the pale content-soft tone; expired state swaps to `spark` gold. Inner disc uses the surface token (never `#fff`) so dark mode is correct. All role tokens from DESIGN.md — no raw hexes.
- **Sizes:** `sm` ≈ 40 px (round header), `lg` ≈ 200 px (dial), `badge` ≈ 56 px (completion moment).
- **Fraction:** driven by a `--ring-fraction` custom property set from `fractionElapsed()`; the display depletes (full → empty) to match the wireframe sweep.
- **Motion:** the 1 s tick moves the fraction in discrete steps — no continuous CSS animation, so there is nothing to disable for `prefers-reduced-motion`. (A short transition on the property may smooth the step; if added, it is disabled under reduced motion.)

### 2. `RoundTimer` (display) — rewired visuals, same contract

- Renders `TimerRing sm` in the header slot instead of the bar. **No digits while running.**
- The remaining-time strings ("About N minutes left…", "Less than a minute…", "✓ Round complete") become `sr-only` inside the existing `role="timer" aria-live="polite"` container — non-sighted users keep the coarse announcements sighted users now get from the ring.
- At expiry the ring turns gold with a visible ✓ (color is not the only signal).
- `boxMs=null` → no ring, round label only (unchanged).
- **Tap-to-adjust (live):** the running ring is wrapped in a ≥44 px button ("Change round length") that opens the dial popover (tablet) / bottom sheet (phone). Display stays quiet — no drag affordance on the small ring itself.

### 3. `TimerDial` (input) — the touch-set control

`TimerRing lg` plus pointer handling; used in the round-length chooser at round start and in the mid-round popover. One component, two hosts.

- **Gesture:** drag (or tap) anywhere on the ring; pointer angle from the dial center maps to a value, snapped to 30 s steps in **[30 s … 300 s]**. Dragging below the minimum (sweeping past the top counter-clockwise, or releasing under 15 s) lands on **"no timer"** — the ring empties and the label reads "no clock at all".
- **Feedback while setting (digits allowed here, per the wireframes' own "Start · 2 min"):** a live label under the dial — "2 minutes — a handful", "1½ minutes — a handful", "30 seconds — a breath", "no clock at all".
- **Keyboard/SR:** `role="slider"`, `aria-valuemin=0` (0 ⇒ no timer), `aria-valuemax=300`, `aria-valuenow` in seconds, `aria-valuetext` = the live label; ← ↓ / → ↑ move one 30 s step (below 30 s → no timer), Home = no timer, End = 5 minutes. The slider pattern is the single-pointer/keyboard alternative WCAG 2.5.1 requires for the drag gesture.
- **Commit semantics:** at round start the dial sets the stored preference; mid-round it calls the existing `onBoxChange` — re-arming against the unchanged start time (never resetting the clock), `no timer` → `null` (timer disappears; expiry-as-pause simply never fires).

### 4. Completion moment

The round recap ("Here's what moved") leads with `TimerRing badge` in its gold/✓ state above the heading — the wireframes' "ring → gold" beat. Decorative (`aria-hidden`); the existing live-region text carries the meaning. Appears only when the round had a timer.

### 5. Feel-based names

Total mapping over every reachable value (bands cover all 30 s steps):

| Value | Name |
|---|---|
| 30 s – 1 min | **a breath** |
| 1½ – 2½ min | **a handful** |
| 3 – 5 min | **a real dent** |
| no timer | **no clock at all** |

Formatting: whole minutes as "N minutes", half steps as "N½ minutes", 30 s as "30 seconds". Names appear wherever a length is *chosen or announced* (dial label, `aria-valuetext`, start-screen chooser); never on the running ring.

## Data model

- `RoundBox` becomes **seconds** (`30 | 60 | … | 300`) **or `"none"`** — stored in `pi-round-box` as the number string or `"none"`.
- **Legacy parsing** (old minutes values, read-once on load): `"0.5"`→30, `"1"`→60, `"2"`→120, `"5"`→300, `"10"`→300 (existing clamp), `"none"`→"none", unparseable → default 120.
- The `box·MINUTE_MS` conversion in `useOptimisticRound`/hosts becomes seconds→ms. `src/lib/round-timer.ts` math is untouched.
- Welcome walkthrough seed `"2"` parses via the legacy map — no fixture churn required, but fixtures may move to `"120"` for clarity.

## Errors & edges

- Drag past 5 min clamps at 300 s; erratic pointer values snap to the nearest legal step; the dial never produces an out-of-range value.
- Mid-round shrink below elapsed time ⇒ `isExpired` is immediately true ⇒ existing expiry-as-pause path (already the contract; a test pins it).
- Storage unavailable ⇒ default 2 minutes, dial still works for the session (existing behavior).

## Testing

- **Unit:** angle→step mapping (including the below-min → none edge and the 359°/0° boundary), legacy `pi-round-box` parsing, band/label formatter totality (every step has a name), seconds→ms conversion.
- **Component (jsdom):** `RoundTimer` — ring renders with fraction, gold+✓ at expiry, sr-only strings present in the live region, `boxMs=null` renders no ring; `TimerDial` — slider keyboard semantics (arrows, Home/End, below-min → none), `aria-valuetext`, commit calls; tap-to-adjust opens and closes the popover.
- **e2e (tablet + phone, the dial is a new touch interaction):** start a round setting the length by dial → quiet ring runs (no digits visible) → adjust live via tap-to-adjust → complete → gold recap moment. Existing round/sort specs stay green.
- All tests run in CI's existing gate/e2e jobs (no new env flags); the mapped Playwright specs are added to the selective spec map if a new spec file is created.

## Out of scope

- Wireframe-doc sync for shipped timer behaviors — bead purses-xnp8.
- Results-page ranked-item images/decorations — bead purses-21x5.1.
- Any change to `src/lib/round-timer.ts` math or session/round semantics.
