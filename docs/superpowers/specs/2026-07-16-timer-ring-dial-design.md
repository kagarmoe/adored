# Timer ring + touch-set dial — design

**Date:** 2026-07-16 · **Epic:** purses-n4wm · **Branch:** feat/timer-ring · **Rev 2** (adversarial spec review folded in: UX, Architect, Craftsman+QA, Graphic Design)
**Owner decisions:** one branch/PR for the whole epic; the timer is settable by touch (min 30 s, max 5 min), live during a round; 30-second snapping; below the minimum lands on "no timer"; HTML + CSS rendering (no SVG).

## Purpose

Replace the linear round-timer bar with the wireframes' quiet ring ("violet ring = round timer (no digits)", "Quiet ring, no clock"), add the gold completion moment ("4 · Round complete (ring → gold)"), give round lengths their feel-based names, and make the length a touch-set dial. The timer stays a gentle fatigue guard, never a stopwatch. The dial (owner-chosen over the wireframes' three-option list) trades one tap for a tactile, continuous-feeling control; the feel-band labels keep the *perceived* choice at four bands, not eleven steps.

## What exists today (verified, rev 2)

- `src/features/sorting/RoundTimer.tsx` — linear bar, violet fill on a 1 s tick, gold at expiry ("✓ Round complete"), visible "About N minutes left…" text, `role="timer" aria-live="polite"`; `boxMs=null` → round label only; `transition-[width] duration-1000 ease-linear` guarded by `useReducedMotion`; `firedRef` gates one-shot expiry (never resets on box change — hosts must preserve the `!ended` gate).
- `src/lib/round-timer.ts` — pure ms math (`remainingMs`, `isExpired`, `fractionElapsed`), unit-agnostic. **Unchanged.**
- `src/lib/round-preference.ts` — `RoundBox` (minutes union), `DEFAULT_ROUND_BOX = 2`, `ROUND_BOX_OPTIONS`, `VALID`, read-clamp (`10 || 20 → 5`), `pi-round-box` storage. `DEFAULT_ROUND_BOX` is how "2 minutes" arrives; nothing seeds the key except the screenshot harness (`e2e/screenshots/capture.ts`).
- `src/features/sorting/RoundLengthChooser.tsx` — the mid-round `<select>`; **three live hosts**: `RoundSurface.tsx`, `TriageRound.tsx`, `UsageRound.tsx`. Its "'No timer' is a first-class peer, never a hidden mode" comment is a contract this design must keep.
- `src/features/sorting/StartSessionForm.tsx` — a **fourth** length control (`TIMEBOX_OPTIONS` from `ROUND_BOX_OPTIONS`); session POST carries no length — round length is **purely client-local** (no server/DB surface; verified against schema).
- `useOptimisticRound.ts` + `RoundSurface.tsx` — **duplicate** `boxToMs = box · MINUTE_MS` converters; `onBoxChange` re-arms against the never-updated `startedAtMs`; **expiry irreversibly ENDS the round** (one-shot end sequence, frozen recap, flush) — it is *not* a pause. Pause is a separate hub affordance.
- `SortHelpDialog.tsx` — the repo's one overlay: hand-rolled `role="dialog"`, focus trap, Escape, trigger refocus. The pattern this design reuses.
- No e2e spec asserts any timer UI today; the walkthrough/tutorials never teach the timer.

## Components

### 1. `TimerRing` (shared presentational)

Stateless ring: `rounded-full` div, `background: conic-gradient(<sweep> calc(var(--ring-fraction) - 0.5%), <track> var(--ring-fraction))` — the 0.5 % blend kills the hard-stop aliasing at small sizes. Inner disc (~75 % diameter at every size) makes it a ring; the disc color **matches the host backdrop** (passed in), so the ring reads as a cut-out, not a pale circle.

- **New role tokens (DESIGN.md amendment):** `ring-sweep` / `ring-track`, one pair per ramp, chosen to clear **≥3:1 against each other in both themes** — the existing `decor`/`content-soft` pair fails (1.61:1 light, 1.97:1 dark). Direction: light deepens toward the wireframe violet (`#8e7ea8` on `#ece8f1` = 3.05:1); dark takes a lighter sweep on a darker track. Exact values are pinned by new `contrast.test.ts` pairs (below) — the test, not taste, is the gate.
- **Expired state:** band swaps to `spark` gold with a centered ✓ in **`ink` on the disc** (AA in both ramps; `spark-ink` is only safe *on* gold). The gold band's low contrast against light surfaces is acceptable because the ✓ + live-region text carry the state — the band is accent, not signal.
- **Sizes:** one component, diameter prop: 40 px (header), 200 px (dial), 56 px (completion badge).
- **Motion: committed — discrete 1 s steps, no CSS transition on the gradient.** A custom property inside `conic-gradient()` doesn't transition without `@property` registration; discrete steps are simpler, honest, and need no reduced-motion branch.

### 2. `RoundTimer` (display) — rewired visuals, same contract

- `TimerRing` 40 px in the header slot; **no digits while running**. RoundShell's timer slot drops `min-w-40 flex-1` (bar-era sizing) — ring + label are intrinsic width, right-aligned.
- Remaining-time strings become `sr-only` inside the existing `role="timer" aria-live="polite"` container. **Honesty contract preserved:** a 30 s round announces sub-minute copy, never "About 1 minute" (named test).
- Expiry: gold ring + ✓ (visible), existing announcement text.
- **Tap-to-adjust (live):** the ring is wrapped in a ≥44 px button labeled "Change round length" that opens the dial dialog. **In the no-timer state the button remains** — an empty ring outline + quiet "No clock" label — so no-timer is never a dead end (keeps the RoundLengthChooser first-class-peer contract). `boxMs=null` therefore renders the empty-ring button, not nothing.

### 3. `TimerDial` (input)

`TimerRing` 200 px + pointer/keyboard handling, hosted in (a) the round-start chooser (replacing StartSessionForm's select) and (b) the mid-round dialog. Here the sweep means *duration set* — the dialog title "Round length" and the persistent label disambiguate it from the remaining-time header ring.

- **Geometry (explicit):** 12-o'clock = start, clockwise; full circle = 300 s, so each 30 s step = 36° of arc (~50 px at the dial's radius). A **visible handle** sits at the value angle — the draggability signifier and the Fitts target. The "no clock" zone is the full first step-width below 30 s (a 36° band, not a sliver); entering it previews "no clock at all".
- **Values:** 30 s steps in [30 … 300]; below-min = "no timer". Erratic pointer values snap to the nearest legal step; past 5 min clamps.
- **Commit semantics (blocker fix):** the dial **previews continuously but never re-arms `boxMs` mid-gesture**. Mid-round, the dialog commits **once, on "Done"** (Esc / scrim = cancel, no change) — because a commit below elapsed time immediately and irreversibly *ends* the round (today's deliberate contract, kept — but it must be reachable only by a deliberate act, never by a finger passing through values). At round start there is no running clock, so the dial commits the stored preference on release.
- **Feedback while setting** (digits allowed here, per the wireframes' own "Start · 2 min"): a **persistent** label — "2 minutes — a handful", "no clock at all" — rendered whenever the dial is visible, not only mid-drag (it is also the non-hue discriminator between empty and 30 s). Quiet microcopy beneath: "Drag or tap to set." (the control is novel; nothing else teaches it).
- **Keyboard/SR:** `role="slider"`, `aria-valuemin=0` (0 ⇒ no timer), `aria-valuemax=300`, `aria-valuenow` seconds, `aria-valuetext` = the label; arrows ±30 s (below 30 → no timer), Home = no timer, End = 5 min. Keyboard changes preview like drag; Done commits. Satisfies WCAG 2.5.1's single-pointer alternative.

### 4. Mid-round dialog (one overlay, responsive)

**One** dialog in the `SortHelpDialog` pattern — focus trap, Escape, scrim, trigger refocus — not a popover + bottom-sheet pair. Phone presentation (full-width, bottom-aligned under `sm:`) vs tablet (centered card) is CSS only, so the interaction is viewport-insensitive and one tablet e2e covers it. **Focus contract:** open → focus the slider; Done/Esc/scrim → focus returns to the ring button.

### 5. `RoundLengthChooser` and `StartSessionForm` (blast radius, explicit)

- `RoundLengthChooser.tsx` is **deleted**; its three hosts render nothing in that slot — the ring button is the affordance. `RoundLengthChooser.test.tsx` deleted; its behavioral pins (persist + live re-arm + no-timer peer) port to the dial/dialog tests.
- `StartSessionForm.tsx` replaces its length `<select>` with the `TimerDial` (its helper copy adapts); `StartSessionForm.test.tsx` updates.
- `WhatMoved` (recap) gains a `hadTimer` prop from its hosts to gate the completion badge.

### 6. Completion moment

The recap leads with `TimerRing` 56 px in gold/✓ above "Here's what moved" — decorative (`aria-hidden`), meaning carried by the existing live-region text; only when the round had a timer. A marker, not a celebration (TONE: no gamification).

### 7. Feel-based names

Total over every reachable value:

| Value | Name |
|---|---|
| 30 s – 1 min | **a breath** |
| 1½ – 2½ min | **a handful** |
| 3 – 5 min | **a real dent** |
| no timer | **no clock at all** |

Formatting: "30 seconds", "1 minute", "1½ minutes", "2 minutes"… Names appear where a length is chosen or announced; never on the running ring. *(TONE note: "a real dent" is wireframe-sourced; flagged to the owner as a deliberate keep-or-rename call — default keep.)*

## Data model

- `RoundBox` becomes **seconds** (`30 | 60 | … | 300`) or `"none"`, stored in `pi-round-box` (number string or `"none"`). The union stays flat (a discriminated kind adds ceremony, no safety); the **unit lives in the name** — `RoundBoxSeconds` — and **one** shared `boxToMs(seconds)` converter replaces the two duplicates (`useOptimisticRound.ts`, `RoundSurface.tsx`), so a missed call site is a type error, not a silent 60× bug.
- **Legacy parsing** (read-once): `"0.5"`→30, `"1"`→60, `"2"`→120, `"5"`→300, `"10"`→300, **`"20"`→300** (both existing clamps), `"none"`→"none", unparseable → 120. Old minute strings and new second strings are disjoint — unambiguous.
- Round length remains **client-local only** — no session/DB field (verified).
- Test fixtures seeding minutes (`TriageRound/UsageRound/RoundSurface` tests, `capture.ts` `"2"`) keep working via the map; they migrate to second values in this branch for clarity.

## Errors & edges

- Mid-round Done with a value below elapsed ⇒ round ends immediately with the frozen recap — **deliberate, dialog-gated**; a named test pins that mid-drag preview never triggers it.
- Growing the box mid-round re-arms against the **unchanged** start (named test: remaining time reflects original start + new box).
- Hosts preserve the `!ended` gate around the adjust button so the one-shot `firedRef` contract holds.
- Storage unavailable ⇒ default 2 minutes, dial still works for the session.

## Testing

- **Contrast (CI gate, new):** `contrast.test.ts` pairs — `[ring-sweep, ring-track, 3.0]` in both themes; `[✓ ink, disc, 4.5]`; these pin the new tokens.
- **Unit:** angle→step mapping (incl. below-min band, 359°/0° boundary), legacy `pi-round-box` parsing (all seven legacy values), band/label formatter totality, single `boxToMs`.
- **Component (jsdom):** RoundTimer — ring fraction, gold+✓ at expiry, sr-only strings (incl. the 30 s sub-minute honesty case), empty-ring button in the no-timer state; TimerDial — slider keyboard semantics, `aria-valuetext`, preview-vs-commit (no `onBoxChange` until Done mid-round), dialog focus contract (open → slider; close → ring button); StartSessionForm with the dial.
- **e2e — new `e2e/timer-ring.spec.ts` (tablet; added to CI's selective spec map under the sort area):** set length via **keyboard** on the dial at round start → quiet ring runs (no digits) → tap-to-adjust mid-round → Done → complete → gold recap. Drag/angle math stays at unit level (Playwright arc-drag is brittle and re-tests unit-covered math). Phone styling asserted at jsdom level; the interaction is viewport-insensitive by design.
- Existing round/sort specs stay green (weak evidence by itself — none asserts timer UI; the named tests above are the real net).

## Out of scope

- Wireframe-doc sync for shipped timer behaviors — bead purses-xnp8.
- Results-page ranked-item images/decorations — bead purses-21x5.1.
- `src/lib/round-timer.ts` math, session/round semantics, server storage of round length.
