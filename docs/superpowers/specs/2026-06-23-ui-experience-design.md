# UI / Experience Cluster — Design Spec

**Date:** 2026-06-23
**Status:** Reviewed (adversarial spec review folded 2026-06-23) — ready for planning
**Author:** autonomous UI session (post-pv9)
**Governing authorities (in order):** [`TONE.md`](../../../TONE.md) (first-order) → [`PRODUCT.md`](../../../PRODUCT.md) → [`DESIGN.md`](../../../DESIGN.md). Wireframes are reference, not law.

## 0. Review folds (changelog)

A 6-persona adversarial review (UX, Graphic Design, Accessibility, Craftsman, QA, Architect) ran against the draft and returned CONCERNS (no BLOCK). Material folds:
- **RoleBadge** reframed: `Badge` already ships AA-locked `owner`/`curator` variants; the draft's `info`/teal suggestion failed AA in both themes and poached a reserved hue. RoleBadge is now a thin wrapper over the existing variants; the real fix is `MemberList`'s tier-ramp-for-identity mis-map.
- **Count grid** (results) is an explicit Epic B deliverable now — the bold per-tier integer tally is count-shaming (TONE 1 & 4).
- **`effectiveBucket` helper** + drift test required (the `manualBucket || computedBucket` expression is already inlined twice un-tested).
- **wew session-carry** gets exact callback edits; its e2e is committed (not prose) and lives under `e2e/**` so the selective filter fires.
- **Capture vs finalized-lock**: result-items PATCH 409s on finalized; capture metadata must survive finalization.
- **a11y prerequisites folded**: fix `Input`/`Textarea` label association (purses-1qor) and give `ErrorMessage` a live region (purses-na0a) — the new forms depend on both.
- **PR1 split** into PR1a (risky auth/profile) + PR1b (cosmetic polish).
- **CI placement constraints** pinned: un-mocked-seam tests under `src/lib/db/`; e2e under `e2e/**`.

## 1. Purpose

The pv9 authorization epic is complete (Owner/Curator roles, one `requireApiCapability` chokepoint, IDOR closed). This effort delivers the deferred **user-facing experience**.

The one thing every screen here must obey (TONE.md): the purpose is **realizing what you love** (affirmation), not deciding what to discard. "Which do you love more?", never "keep or let go?" Letting go follows; it is never the headline — and **never tallied**. Each object is a story — asked *forward* ("where will it go next?") and kept as a memento *after* a choice, never solicited as the prompt *for* one.

## 2. Owner decisions (settled 2026-06-23)

- **Scope:** all four epics (A→D) land this session; PR order and count are mine to choose.
- **Voice capture (purses-0a6): deferred.** Every capture feature ships **typed-first** (a typed fallback is the permanent baseline regardless). Voice becomes its own later spec.

## 3. Decomposition & sequencing

Five workstreams over **five PRs** (PR1 split per the review to isolate the risky auth change from cosmetic polish). Each PR is one logical change with full gates.

| PR | Branch (suggested) | Scope | Triggers e2e? |
|----|------|-------|------|
| **PR1a** | `ui-profile-displayname` | Profile page + display-name editing + **NextAuth session-carry fix** (§5.1). Fix `Input`/`Textarea` label association (purses-1qor) as the profile form's a11y prerequisite. **E2e:** extract shared fixtures to `e2e/fixtures/ui.ts` (y1o); UI-login→protected-page spec (asz); set-name→header-reflects spec. | Yes (`src/app/**` + `e2e/**`) |
| **PR1b** | `ui-pv9-polish` | RoleBadge wrapper + fix MemberList tier-ramp mis-map (c0w), give `ErrorMessage` a live region (purses-na0a), MemberList/InviteForm design-system polish + th14 timer cleanup, PhotoDeleteControl verify, items-page test reconcile. **E2e:** members+invitations spec (nvj). | Yes |
| **PR2** | `ui-o93-results-onward` | Epic B: partition loved vs Onward; **remove the count-shaming tally**; gentle forward-framed Onward section; affirmation end-beat; all-Onward copy. Verify pairwise drives ranking. | Yes |
| **PR3** | `ui-gentle-affordances` | Epic C: "I need a moment" pause (z76), "Not Mine — set aside" (1an), undo after setting a session aside (2f3f). Evaluate defer/skip (x5u). | Yes |
| **PR4** | `ui-capture-rehome-story` | Epic D (typed-first): rehome "Who would love this?" (oub) + story memento (ib3) in the post-decision Onward surface. Voice (0a6) deferred. | Yes |

**Verify, don't rebuild (purses-yuw):** memory `e2e-selective-required` says e2e is already required+selective on `main`. yuw's deliverable is **command output proving** it (verification-before-completion), recorded in a PR — not new CI work, unless verification shows a gap.

## 4. Shared design language

### 4.1 RoleBadge — a thin wrapper over EXISTING Badge variants (used by A)

`src/components/ui/Badge.tsx` **already defines** AA-locked `owner` (`bg-accent-periwinkle text-ink`) and `curator` (`bg-accent-aqua text-ink`) variants (both verified in `src/lib/design/contrast.test.ts`, both themes). Do **not** invent new tokens, and never use a reserved semantic hue (`info`/`error`/`warning`/`success`) for an identity badge.

- `RoleBadge({ role })` is a ≤3-line semantic wrapper mapping `role → "owner" | "curator"` Badge variant. Justified by two consumers (members list + profile). It introduces **no new colour token**.
- Owner = `accent-periwinkle`, Curator = `accent-aqua`, both with `text-ink`. (Pinned by name so no one reaches for `decor` mauve, which DESIGN.md forbids as an identity colour.)
- **Always renders visible label text** (the accessible name); any icon is decorative (`aria-hidden="true"`). No icon-only variant.
- Roles are identity, not a leaderboard — no "admin > member" framing.
- If a future consumer needs to resolve Owner from `collections.ownerId` (when `role` doesn't carry it), *that* is the trigger to grow the wrapper — state it then.

### 4.2 The Onward section + tier tokens — container built by B, filled by D

- The lowest tier (`low` bucket = "Onward") renders as a **separate, gentle section** below the loved ranking, forward-framed ("Where these go next"), calm copy, **no count**, no red, no "released" finality.
- Onward ItemCards reuse the **existing** tier tokens (`tier-onward`/`tier-onward-ink`, AA-locked, flips correctly in dark) via a **single shared tier→token source** — not a new hand-rolled class map. (`results/page.tsx` L31-34 already duplicates Badge's tier map; do not add a fourth copy — consolidate onto one helper.)

### 4.3 Copy, motion & feedback guardrails (TONE + a11y floor)

- Affirmation only; **no count-down/tally framing**, no "too many", no shaming.
- Forward prompts ("where will it go next?"), never backward at the moment of choosing.
- Calm motion; honour `prefers-reduced-motion` (crossfade/instant). No confetti/streaks/scores.
- **Feedback floor:** every tap (pause, set-aside, undo, save, choose) acknowledges within ~150–300ms (affordance/optimistic state) so reversibility feels immediate.
- **Status is announced:** success/error and state changes (name updated, item set aside, session paused, undo) surface through a live region (`role="status"`/`role="alert"`) or managed focus — never a silent DOM swap.
- Tap-first, ≥44px, no swiping. WCAG 2.1 AA in **both** themes (any new fg/bg pairing adds a `contrast.test.ts` row before merge).

## 5. Epic A — pv9 polish + role/profile (PR1a + PR1b)

### 5.1 Profile page + display name + session-carry (purses-wew) — PR1a

**Current state:** `PATCH /api/users/me` exists → `UserController.updateCurrentUser`. The jwt callback (`src/lib/auth.ts:85`) sets **only** `token.id` and has **no `update` trigger**; the session callback writes only `id`. So `name` set at sign-in goes stale after an edit until re-login — the "UI display bug."

**Build:**
- `src/app/profile/page.tsx` — calm Server-Component shell + small `"use client"` form. Shows email + editable display name. Tap-first, ≥44px, reduced-motion safe. Reached from the header user area (top-right).
- **Session-carry (exact edits):**
  - jwt callback: seed `token.name` from `authUser` on sign-in; add `if (trigger === "update" && session?.name !== undefined) token.name = session.name`.
  - session callback: set `session.user.name = token.name`.
  - Profile form calls `useSession().update({ name })` after a successful `PATCH`, so the header reflects the new name **without re-login** (`nextjs-client-state-survives-router-refresh`).
- **Validation / clear (schema + controller change required):** the existing `UpdateUserSchema` (`name: z.string().min(1).optional()`) rejects empty and the controller spread drops falsy → "clear the name" is currently impossible. Change to: trim; bound length (`.max(...)`); treat empty-after-trim as an explicit **unset** (`name: null` written), not a 400. Keep this flow **name-only** — email mutation is **out of scope** for the profile form (don't expose it; tighten the schema/path so a name-only form can't carry an email change).
- Fallback: name → email local-part when unset (gentle, not "Anonymous").
- **a11y prerequisite (purses-1qor):** `Input`/`Textarea` currently lack `htmlFor`/`id` label association. Fix the primitives (associate label↔control via a generated id) so the profile form is AA — this is load-bearing, not optional.
- **a11y acceptance (committed, not prose):** label wired via `htmlFor`/`id`; `autocomplete="name"`; `:focus-visible` styled (never `outline:none`); full keyboard path tab→type→submit; save success/failure announced via live region; the post-update name change announced (polite) or focus moved to confirm.

**Tests (committed):**
- API/seam (under `src/lib/db/`, `RUN_DB_TESTS=1`): `PATCH /api/users/me` clamps/rejects over-length name; empty-after-trim → `row.name === null` + 200 (not 500, not stored blank); never mutates email via this flow.
- Unit: jwt `update`-trigger branch updates `token.name`.
- Component (jsdom): profile form renders, validates, calls `update()` on success.
- **E2e (under `e2e/**`):** set display name via the form → header renders the name **without re-login**. (PR1a also adds the profile page under `src/app/**`, so the selective e2e filter fires; an auth-only change would not — this PR is never auth-only.)

### 5.2 RoleBadge + surface it (purses-c0w) — PR1b

- Build §4.1 RoleBadge over the **existing** Badge `owner`/`curator` variants.
- **Fix the actual bug:** `MemberList.tsx` L30-32 maps owner→`high`/curator→`medium` (the tier value-ramp — identity rendered as a leaderboard rung, forbidden by DESIGN.md §Tiers + TONE 4). Route through RoleBadge / the role variants.
- Surface role on the members list and (lightly) the profile. Owner vs Curator by label+token, never hue alone.
- **No new role concept** — per-collection `memberships.role` + `collections.ownerId` only.
- **Test:** a role badge renders the role token + label (assert it is the role variant, **not** a tier token) — this is the regression guard for the tone bug.

### 5.3 MemberList / InviteForm polish + ErrorMessage live region — PR1b

- `ErrorMessage` (`src/components/ui/ErrorMessage.tsx`) is a plain `<div>` with no `role`/`aria-live` (purses-na0a). **Add the live-region semantics** (`role="alert"` / `aria-live`); add a matching success `role="status"` surface. Test asserts the role/aria-live attribute. (Route InviteForm/profile errors through it.)
- `MemberList.tsx`: route role rendering through RoleBadge; verify design-system conformance (tokens, spacing, ≥44px, AA); replace the raw `userId` fallback/subtitle with a gentler identity (name → email; avoid leaking the raw id as the primary line).
- `InviteForm.tsx`: design-system polish; success surface uses the live-region pattern; **purses-th14**: the success `setTimeout` has no cleanup → state update on unmounted; store the timer id and clear it on unmount.

### 5.4 PhotoDeleteControl — verify (any curator) — PR1b

`PhotoDeleteControl.tsx` + test already exist; pv9 made delete available to any curator. **Verify via the existing component test** that any-curator delete is asserted and that the test **runs in the unit gate**; if that assertion is absent, *adding it is the work*. Polish only if it drifts (`modal-in-card-needs-portal` if it overlays an interactive card).

### 5.5 Items-page test reconcile — PR1b

The item-detail page test (`src/app/collections/[id]/items/[itemNumber]/page.test.tsx`) is intentionally **stricter than the API** (pv9 display drift). Reconcile: align the test to the shipped display contract or document why the stricter assertion stands. Resolve the drift; don't paper over it.

## 6. Epic B — o93 results "letting go / Onward" (PR2)

**Current state** (`results/[resultNumber]/page.tsx`): a 4-up grid renders a **bold integer count per tier** (L104-111, incl. Onward), then `MostLovedHero` (rank 1) + "The full ranking" over `ranked.slice(1)` — which **lumps the `low`/Onward items in**. Scoring is correct (purses-h02 closed).

**Change:**
1. **Remove the count-shaming tally.** The bold per-tier integer grid (L104-111) is the machine counting — forbidden by TONE 1 ("tallying what's gone") & 4 ("counted against"). Replace it with either nothing (lead with the hero) or a calm, **label-only** tier legend (no integers, definitely no Onward count). This is an explicit deliverable, not silence.
2. **Partition** `ranked` into **loved** (`top`/`high`/`medium`) and **onward** (`low`) via a shared `effectiveBucket(item)` helper (§4.2, also §9). "The full ranking" renders only the loved set; hero is the loved-set rank 1.
3. **Onward section** (§4.2): separate, gentle, forward-framed heading ("Where these go next"), calm copy, ItemCards on `tier-onward` tokens, **no count**, no red, no finality language.
4. **Peak-End / affirmation end-beat.** Onward sits *beneath* the loved ranking, so the page would *end* on letting-go (then SharePanel). Add a quiet affirmation closing beat (person-side, forward) after Onward so the last impression is affirmation, not subtraction — letting go is never the headline, including structurally.
5. **All-Onward edge case (the most tone-dangerous screen).** If nothing scored as loved, lead with copy that affirms the **act of deciding / the clarity reached** — never "nothing loved", never a count. (Constraint, refine wording at build; example direction: "You've made your choices" / honoring the decisions, not the absence.) Requires its own test + screenshot.
6. **Verify pairwise drives ranking** — a regression guard (h02 fixed the discard bug): a **DB-backed test under `src/lib/db/`** that records a pairwise choice promoting B over A, re-materializes the result, and asserts the resulting **order** reflects the promotion (crosses scoring→result-items un-mocked). A pairwise test that hand-rolls its own ordering would be tautological — assert the real materialized order.

**Tests (committed):**
- `effectiveBucket` / partition: a `low`-bucket item **never** appears in "the full ranking"; the loved/onward partition and any retained tier overview are both derived from the one helper (no drift); a `manualBucket` override lands the item where the override dictates.
- Pairwise→order DB-backed test (above).
- Component/e2e: results renders Onward as a separate section; all-Onward screen renders the affirmation copy.

**a11y:** semantic `<section>` + heading; ramp tokens AA both themes; tap-first.

## 7. Epic C — gentle affordances (PR3) — direction

Refined at PR3 plan time. Acceptance below is committed now (the correctness/reversibility branches, per the review).

- **"I need a moment" pause (purses-z76):** always-available, low-emphasis; saves position; returns gently. Not a modal interruption, no "are you sure you want to quit?" pressure.
- **"Not Mine — set aside" (purses-1an):** zero-engagement escape hatch — an item never theirs to weigh is set aside with **no tier and no story prompt**. Distinct from Onward (deliberately rehomed) and Skip (deferred). Surfaced in triage.
- **Undo after setting a session aside (purses-2f3f):** reversible, non-destructive; gentle undo, no "are you sure" alarm.
- **Evaluate skip/defer (purses-x5u):** compare already demotes Tie/Skip to ghost actions. Include a distinct "defer this pair" only if it adds value beyond Skip; else note as covered.

**Committed acceptance/tests (C):** each affordance tap-first ≥44px, reversible, non-shaming, reduced-motion safe, **keyboard-operable**, outcome **announced via `role="status"`**, focus managed on the gentle return, feedback within ~150-300ms; none introduces urgency or a count. Named tests: **undo restores prior state** (DB-backed, reversibility branch); **set-aside item has null tier AND no story row** (the branch distinct from Onward/Skip); pause saves+restores position.

## 8. Epic D — capture features, typed-first (PR4) — direction

Lives in the post-decision Onward surface (PR2). Refined at PR4 plan time; the privacy + finalized-state branches are committed now.

- **Rehome "Who would love this?" (purses-oub):** on an Onward item, an optional forward prompt capturing a recipient/place as **free text**. Optional, never required, never gates a decision. **Captured post-decision only this session** — defer triage-reachability (the review flags pre-decision capture as edging past TONE commitment 2's before/after axis; post-decision is unambiguously safe and matches the story placement).
- **Story memento (purses-ib3):** on an Onward item (post-decision), an optional photo + short caption, prompted **forward**. Never required; never gates.
- **Voice (purses-0a6): deferred** — typed inputs only.

**Finalized-state contract (the seam, per Architect):** the only result-item mutation route (`PATCH /api/sort-results/[id]/items/[rid]`) **409s once the result is finalized** — but "post-decision memento" most naturally means a *finalized* result. Capture is **metadata, not ranking**, and must **survive/accept writes on a finalized result** while rank/bucket stay locked. Decide the mechanism at PR4 plan time with `postgres-review` — either a capture write path not gated by the finalized lock, or amend the route to permit `note`/`rehomeTo` fields while finalized. **Committed acceptance test: capture succeeds on a finalized result.**

**Data:** smallest free-text addition that holds the note/recipient (nullable column or one lightweight related row). Validate at the boundary; bound length. **Resist a "recipients model"** until a named second consumer demands it.

**Committed acceptance/tests (D):** capture optional, forward-framed, post-decision; typed with visible `<label>`, save/edit/clear keyboard-reachable with announced state, error via `role="alert"`; **default private**; AA + reduced-motion + ≥44px. Named tests: capture round-trips **save→edit→clear**; **a newly-captured note/memento is NOT visible on shared/finalized results** (the private-by-default privacy regression guard — highest-stakes invariant in the cluster); over-length note rejected at the boundary (under `src/lib/db/`).

## 9. Testing strategy

- **CI placement (load-bearing):** any **un-mocked-seam / DB-backed** test MUST live under `src/lib/db/` (the only path the `db-tests` job runs: `RUN_DB_TESTS=1 vitest run src/lib/db`) and be guarded by `RUN_DB_TESTS=1`, or it does not run in CI and does not count. Any **e2e** spec MUST live under `e2e/**` (the selective-filter path).
- **Unit/component:** new components/pages get jsdom + `@testing-library` tests (`component-test-recipe`: per-file `// @vitest-environment jsdom`). Coverage merged floor (82) — union of unit + db tiers (`coverage-merged-floor`).
- **Each "verify" names a runnable check + its tier** (Craftsman): never "looked fine". E.g. PhotoDeleteControl → the component test asserting any-curator delete runs in the unit gate.
- **E2e** auth via `e2e/fixtures` (no `/login` UI driving except the explicit asz spec); tablet+phone+desktop (`e2e-harness-shape`). Extract shared locators to `e2e/fixtures/ui.ts` (y1o) in PR1a.
- **TDD:** failing test first, then minimal code (CLAUDE.md override: YAGNI does not apply to tests; every non-trivial branch/error path tested).
- **Error/boundary paths committed** per epic (profile validation reject/clear, capture length bound, undo reversibility, private-by-default) — enumerated in §5/§6/§7/§8, not deferred.

## 10. Screenshots (hard rule)

Every UI PR ships **inline light+dark screenshots** in the body (`ui-prs-include-screenshots`, `pr-screenshots`): `npm run screenshots` (extend `e2e/screenshots/capture.ts` `surfaces`), then release+embed per `docs/cookbook/add-images-to-pr.md`. Verify in the **signed-in** browser (anonymous 404 on a private-repo asset is expected). The all-Onward results screen (§6.5) is a required screenshot.

## 11. Out of scope / deferred

- Backend/authz changes (pv9 done). Pages fetch via `XController.fromDb(db)` in Server Components; repos import-private.
- Voice capture (0a6) — its own later spec.
- Rehome **triage-reachability** (post-decision only this session) and surfacing rehome/story on **shared/finalized** results (capture + private display only).
- Multi-curator preference independence (k3f), pool grouping (1xr), background removal (k2x), SessionAnalytics reframe (gjr) — unrelated.
- Migration NOTICE purses-h6a — ignore unless it blocks.

## 12. Risks (post-fold)

- **wew session-carry:** specified exact callback edits + committed e2e; the e2e lives under `e2e/**` and the PR touches `src/app/**`, so the selective filter fires (an auth-only change would not — never ship auth-only here).
- **Count-grid removal regressions:** the count grid currently anchors the page; removing it must not break the loved-ranking render. Covered by the partition + render tests.
- **effectiveBucket drift:** one helper for counts (if any) + partition; test asserts they agree.
- **Capture finalized-lock:** named contract + acceptance test that capture works on a finalized result.
- **a11y prerequisite creep:** fixing `Input`/`ErrorMessage` (1qor/na0a) is in PR1's path because the new forms need them — small shared-primitive fixes, not unrelated refactor; they close real beads.
- **D schema creep:** smallest free-text addition; no recipients model until a second consumer.
