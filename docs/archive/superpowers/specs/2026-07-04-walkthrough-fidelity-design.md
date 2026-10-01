# New-User Walkthrough Fidelity — Design

**Date:** 2026-07-04
**Status:** Revised after adversarial review (QA, Architect, Craftsman, UX/Tone personas — all findings folded in below)

## Problem

The first-run walkthrough at `/welcome` (five client-only beats: purpose → triage →
compare → standing → handoff) no longer represents the app it introduces:

1. **It never explains the sorting model.** The real app has *sorting sessions*
   containing two kinds of rounds — **Triage** and **Compare** — chosen from a
   session hub. The walkthrough demos both mechanics but never names them or says
   they are rounds you'll pick between, so a new user meets the session hub cold.
2. **It hides the mercy affordances that PRODUCT.md treats as core.** Real triage has
   "Not yet" (defer) and "Not mine" (set aside) — the product's answer to the
   entangled pile ("never forcing a decision on what was never theirs to weigh").
   Real compare has **Tie** and **Skip**. The walkthrough shows none of these, so it
   teaches a *stricter* app than the one that exists.
3. **Its results beat misnames the destination.** The walkthrough's beat is titled
   "What you love most"; the real results page is **"Where things stand"** (a live
   standing), with "What you love most" as its hero subsection. Copy also drifts on
   the compare sub-line.
4. **It skips the actual first steps and the loop after.** After the handoff the
   user must create a collection and *add photos of their things*; sorting happens
   in short, pausable rounds; and the standing can be **refined** afterward
   ("Put things in order" starts another round) and then finalized and shared.
   None of these expectations are set.
5. **Root cause is structural.** `WelcomeTriage`/`WelcomeCompare` are hand-rolled
   copies of the real screens, so drift is guaranteed as the app evolves.

## Goals

- The walkthrough teaches the app that exists: the round kinds by name, the escape
  hatches (Tie/Skip/Not yet/Not mine), the real results framing, and that the
  standing can be refined afterward and then finalized and shared.
- One quiet product explanation: what Adored is, and the shape of the journey
  (gather photos → sort in short rounds → see where things stand).
- **Fidelity by construction:** the demo beats render the *real* interaction
  components against sample data, and every teaching string the real app also
  displays comes from one shared module — so neither layout nor copy can silently
  fork again.
- Stays short (~60s), skippable at every beat, client-only (no API, no DB), and
  inside TONE.md (no gamification, affirmation-first, one decision at a time).

## Non-goals

- No in-app coach-mark tour or seeded sample collection (Approach C, below).
- No demo of the session start form (goal / scope / round length) — it is
  self-explanatory at the moment of use; the handoff sets the expectation instead.
- No teaching of finalize/share *mechanics* — one quiet forward reference in the
  refine beat only (PRODUCT.md: "Finish, then share").
- No change to the gate (`shouldShowWelcome`) or the dismissal cookie mechanics.
- **No manual drag-to-reorder teaching.** The app has no manual reordering of
  results today ("Put things in order", `results/page.tsx:90`, links back into
  compare rounds; Finalize snapshots the current order). The walkthrough teaches
  the refinement loop that exists. If drag-reorder ships later, the refine beat's
  shared copy is the one place to update. (Filed as a separate product question —
  see *Open questions*.)

## Approaches considered

- **A. Copy-only pass.** Fix names and sub-copy in the existing hand-rolled beats.
  Cheapest, but leaves the structural drift (point 5): showing Tie/Skip/defer/
  set-aside would mean re-implementing them a second time — the disease itself.
- **B. Fidelity + structure (chosen).** Reuse the real interaction components in a
  typed local mode, share every dual-displayed string, align the standing beat with
  the real results page. Medium diff, kills the drift mechanism.
- **C. Guided first real session.** Seed a sample collection in the DB and coach-mark
  the real flow. Highest fidelity but a large build for a first-run moment;
  rejected for now.

## Design

### Beat structure

`purpose → triage → usage → compare → standing → refine → handoff` (seven
beats), linear, "Skip for now" on every beat except handoff. All state stays in
`WalkthroughShell` (client-only).

**1. Purpose** — keep "Rediscover what you love" and orient to the real
collection model. Body copy: *"Adored helps you build a collection from photos,
make items when you're ready, and notice what you love most through short
rounds."* Add the journey in four quiet steps (text, not icons-and-arrows): *Add
photos to a collection. Make items when you're ready. Sort in short rounds. See
what you love most.* One `Show me how` CTA.

**2. Triage** — a small kicker composed from the shared round name: **"A Triage
round"**, with the shared one-line explainer beneath it. The kicker + explainer
**replace** the current "Tap how you feel. There are no wrong answers." line —
meta-copy on this decision screen is capped at those two short lines. The beat
renders the real `DecisionControls` (Love/Like/Maybe/Onward from the shared
decisions constant), and the real `DeferControl` ("Not yet") and `SetAsideButton`
("Not mine") beneath the hairline, all in local mode. Because the real controls
carry their meaning only in `title` attributes (invisible on a tablet), one quiet
caption sits under the escapes on every item: *"Not yet keeps it for later. Not
mine sets it aside."* Three sample items, one at a time; the third is deliberately
not-yours flavored (e.g. "The kid's dinosaur lamp") so "Not mine" has a natural
moment — but every control is valid on every item. Unlike real triage, a deferred
item does **not** resurface within the walkthrough: any choice (tier, Not yet,
Not mine) records and advances, keeping the beat short.

**3. Usage** — kicker **"A Usage round"** + the shared explainer. Renders the
real usage controls in local mode: the dominant prompt **"Do you use this?"**,
the visible choices **"Yes, I use it"** and **"Not these days"**, and the quiet
pass control **"Skip for now"**. One item, then the walkthrough advances.

**4. Compare** — kicker **"A Compare round"** + the shared explainer. Renders the
real `CompareChoice` in local mode: two cards, plus the quiet **Tie** and **Skip**
buttons, with the shared sub-line ("Tap the one you love more. Tie or skip
whenever you like."). One pair.

**5. Standing** — retitled **"Where things stand"** to match the real results page.
Composition is pinned to mirror `RankedResults`' documented ordering invariant:
hero labeled **"What you love most"** first, ranked rows beneath, then — only when
non-empty, and in the real page's subordinate styling (quiet eyebrow headings,
`text-ink-soft`) — a **"Where these go next"** group for Onward items, a
**"Set aside — waiting, whenever you want them"** row for "Not mine", and a
**"Ready when you are"** row for a deferred item. The affirmation line **"What you
love most is at the top."** is the beat's *last* content — nothing follows it. If
every item was deferred/set aside (no ranked rows), the hero is omitted and the
beat closes on the real page's calm variant "You've made your choices." instead.

**6. Refine (new)** — one short beat, after the payoff: the standing is alive, not
a verdict. Two sentences: *"The standing keeps updating as you sort — **Put things
in order** starts another round whenever you want it truer."* and the single
forward reference *"When it feels complete, you can finalize it and share it."*
The button name "Put things in order" is quoted exactly (same-token recognition
with `results/page.tsx:90`). Continue CTA advances to handoff.

**7. Handoff** — "Now, your turn." Body copy sets the real expectations:
*"Begin with photos. They can wait in the pool until you make items."* and *"Sort
whenever you like, one gentle round at a time."* Primary CTA
`Start a collection` → `/collections/new`; secondary "I'll explore on my own."
(both unchanged; both dismiss the walkthrough, as today).

### Local mode on the real components — a typed union, not stacked optionals

`DecisionControls`, `DeferControl`, and `CompareChoice` each replace their
required backend-target props (`sessionId` for the decision components,
`collectionId` for `DeferControl`, whose escape posts to the dispositions API;
plus `onDecisionMade` where present) with one discriminated `submit` prop:

```ts
type Submit =
  | { kind: "session"; sessionId: string; onDecisionMade?: () => void } // today's behavior, byte-for-byte
  | { kind: "local"; onDecision: (d: <component's decision shape>) => void };
// DeferControl's session arm carries collectionId instead of sessionId.
```

Rationale (Architect + Craftsman convergence): prop-presence sniffing with two
optional callbacks leaves a meaningless both-set state and forces the walkthrough
to pass a fake `sessionId`; the union makes both unrepresentable, and
`kind: "local"` is self-describing against accidental production use (a cheap
guard test asserts nothing under `src/app/collections/**` passes `kind: "local"`).

**Local-mode contract (uniform across components):**
- The decision is **synchronous**: no fetch, no `posthog.capture`, no
  `router.refresh()`, and **no pending/busy/"Saving…" state is ever entered** —
  there is no save to signal. Controls are enabled for the next item immediately.
  (This deliberately bypasses `AsyncActionButton`'s never-reset success path in
  `DeferControl`, and `DecisionControls`/`CompareChoice`'s pending-across-refresh
  machinery — both documented soft-lock classes when an instance is reused.)
- `CompareChoice` in local mode structurally cannot allocate idempotency
  `clientKeys` (they live in the session branch).
- With `kind: "session"`, behavior is byte-for-byte today's; the two production
  call sites per component (triage/compare pages) are updated mechanically.

**`SetAsideButton` is the exception and gets its own mechanism** (review
convergence, promoted): its network path lives in `TriageUndoProvider` —
`useTriageUndo()` *throws* outside a provider, and the fetch + undo state are the
provider's (`TriageUndoProvider.tsx:52-73`). The button switches to reading the
context **optionally** (direct `useContext`, no throw) and gains the same `submit`
union; in local mode it never touches the provider, and the walkthrough renders it
**without** a `TriageUndoProvider` mounted. Consequence, stated deliberately: the
real "Bring back" undo notice does not appear in the walkthrough — the item
advances instead (consistent with the defer rule above). `TriageUndoProvider`
itself is untouched.

The walkthrough passes complete domain `Item` values built in `sampleData.ts`
(fixed ids/names, committed `public/onboarding/` images via the existing
`heroA`/`heroB` props). Production prop types are never optionalized for the
demo's sake.

### Shared teaching copy — `src/features/sorting/roundCopy.ts`

One plain-constants module (no `"use client"` — a comment in the file says so; it
is imported by the *server* session-hub page and the client walkthrough). It owns
every string displayed in both places:

- **Round names:** "Triage", "Compare" — hub cards and walkthrough kickers compose
  from the same token ("A Triage round").
- **Round explainers — rewritten person-side (TONE fix, not amendment).** The
  current hub strings fail TONE.md's litmus: "Quickly **bucket** one item at a
  time" is an inventory verb with pace injected; "Pick between pairs to **refine
  ranking**" is the algorithm's job description. Canonizing them for a brand-new
  user would set a quiet precedent TONE.md's Authority clause forbids. The module
  ships person-side rewrites consumed by hub *and* walkthrough, e.g. Triage: *"One
  at a time — how do you feel about each?"*; Compare: *"Two side by side — which
  do you love more?"* (final wording checked against TONE.md at implementation;
  the requirement is person-side voice, no pace, no inventory verbs).
- **Compare sub-line** ("Tap the one you love more. Tie or skip whenever you
  like.") — currently typed in the compare page, about to be typed a third time;
  it moves here (or into `CompareChoice` itself, implementer's choice — one home).
- **Triage decisions constant:** the Love/Like/Maybe/Onward `decisions` array is
  caller-supplied to `DecisionControls` today (labels live at the page call site —
  the exact drift mechanism, one level down). It becomes a shared constant
  consumed by the triage page and the walkthrough.

`RoundSurface`'s in-round labels ("This round", "Comparing") stay where they are —
out of scope, noted for a future copy pass.

### Standing computation (`buildStanding`)

Pure and deterministic, now over **typed outcomes** so illegal states are
unrepresentable (an item cannot be both tiered and deferred; a tie cannot carry a
winner):

```ts
type TriageOutcome = { kind: "tier"; tier: Tier } | { kind: "deferred" } | { kind: "setAside" };
type CompareOutcome = { kind: "win"; winnerId: string } | { kind: "tie" } | { kind: "skip" };
```

Rules (exhaustive; each is a unit case):
- **Win** → winner "love", passed-over "like" (as today). **Tie** → both "love".
  **Skip** → both "like". Pair order as displayed for tie/skip.
  (A code comment marks tie/skip→tier as a **demo-only mapping**, not
  `ScoringService` semantics — do not port.)
- Triage `tier` outcomes order the remaining ranked rows (love > like > maybe >
  onward, as today).
- `deferred` → out of the ranking, rendered as the "Ready when you are" row.
- `setAside` → out of the ranking, rendered in the set-aside row.
- Compare pair and triage items are disjoint sets (as today), kept so by
  construction.
- Empty ranked set (everything deferred/set aside) → standing renders the calm
  all-decided variant (see beat 4).

### Accessibility (behavioral contract, not just budget)

- **Focus on advance:** each item/beat transition moves focus to the new content's
  heading — the walkthrough's beat-swap is new behavior with no real-screen
  precedent to inherit, and the codebase already treats focus survival as
  first-class (`SetAsideButton.tsx:13-17`). Tested.
- **Announcements:** beat content sits in an `aria-live="polite"` region
  (mirroring `results/page.tsx:100-101`), so item advances and beat changes are
  announced.
- **Touch semantics:** the escapes' meaning is visible on screen (the beat-2
  caption), not only in `title` attributes.
- Unchanged budget otherwise: ≥44px targets, visible focus rings, no new motion,
  no counts or scores.

## Testing (all in the CI gate — the `gate` unit job and the `e2e` job, whose
paths filter already covers `src/features/**` and `e2e/**`)

**Unit — walkthrough flows (`WalkthroughShell`):** happy path; tie path; skip
path; defer path (asserting the deferred item does **not** resurface and the beat
advances); set-aside path; all-deferred/set-aside path (calm variant); skip-for-now
dismissal on each beat; standing beat reflects each choice set; focus lands on the
new heading after each advance.

**Unit — `buildStanding`:** one case per rule bullet above, driven by the typed
outcomes (exhaustive switch).

**Unit — local mode (paired, in the components' existing test files):** for each
of the four components, *adjacent to* the existing "fetch IS called with real
URL/body" positives: with `kind: "local"`, tapping calls `onDecision`, performs
**no fetch** (mock `fetch`, assert not called), **no `posthog.capture`**
(mock the module — its transport batches, so a fetch-mock alone is blind to it),
no navigation, and the control is **re-enabled afterward** (no pending
soft-lock). `SetAsideButton`'s local test renders **without** a provider and must
fail against today's throwing hook — proving the test is non-vacuous.

**Unit — guard:** no file under `src/app/collections/**` passes `kind: "local"`.

**Unit — shared copy, both directions:** the session-hub test asserts its cards
render from `roundCopy.ts`, **and** the walkthrough tests assert the kickers/
explainers render from the same constants (the mirror assertion — either side
forking fails a test). Hub-page tests asserting the old explainer strings are
updated to the rewrites.

**Unit — copy/a11y:** extend `copy-a11y.test.tsx` for all new beats' copy,
including the refine beat and the escapes caption.

**Existing-test migration (explicit, so nothing is quietly deleted):**
`beats.test.tsx:83` and `WalkthroughShell.test.tsx:43` retitle their heading
assertion to "Where things stand", and "What you love most" survives as the
hero-subsection assertion; `beats.test.tsx`'s hand-rolled `WelcomeTriage`/
`WelcomeCompare` internals tests are superseded by the local-mode + shared-constant
tests above (replaced, not dropped — equivalent behavior must stay pinned);
`sampleData.test.ts` extends to the typed-outcome `buildStanding`.

**e2e (new `e2e/welcome-walkthrough.spec.ts`) — with its fixture design stated,
because the suite's defaults fight this scenario:** the shared
`storageState: e2e/.auth/user.json` user has collections and existing specs
*deliberately set the dismissal cookie* to disarm the `/welcome` redirect
(`auth-navigation.spec.ts:19-31`). This spec therefore uses a **logged-out
storageState and signs up a fresh, per-project-unique user** (the suite runs the
same DB serially across 3 device projects — a fixed email collides on runs 2-3),
with no dismissal cookie. Scenarios: zero-collection login redirects to
`/welcome`; full tap-through including one Tie and one "Not mine" reaches the
handoff; `Start a collection` lands on `/collections/new`; **finishing the
walkthrough then "I'll explore on my own" lands on `/collections` and stays there
on reload** (pins that the handoff path dismissed — otherwise a zero-collection
user loops `/collections → /welcome` forever); "Skip for now" mid-walkthrough
does the same.

## Open questions / assumptions

- **Assumed:** the standalone sample-data walkthrough is the right vehicle
  (Approach B, not C). If a guided real first session is wanted instead, this spec
  is the wrong shape — say so before planning proceeds.
- **Assumed:** seven beats, no "session start form" beat (the form explains itself
  in place).
- **Product question (separate from this work):** should results support *manual*
  reordering (drag), per PRODUCT.md's "drag is permitted for reordering results"?
  Nothing exists today; the refine beat teaches the loop that does. If wanted,
  that is its own spec — file a bead.
