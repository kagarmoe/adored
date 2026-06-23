# UI / Experience Cluster — Design Spec

**Date:** 2026-06-23
**Status:** Draft for review
**Author:** autonomous UI session (post-pv9)
**Governing authorities (in order):** [`TONE.md`](../../../TONE.md) (first-order) → [`PRODUCT.md`](../../../PRODUCT.md) → [`DESIGN.md`](../../../DESIGN.md). Wireframes are reference, not law.

## 1. Purpose

The pv9 authorization epic is complete (Owner/Curator roles, one `requireApiCapability` chokepoint, IDOR closed). The backend is solid. This effort delivers the deferred **user-facing experience**: polishing the pv9 UI handoff to the design system, finishing the o93 sort-flow redesign's results surface, and adding the gentle affordances and capture features that serve the grieving primary user.

The one thing every screen here must obey (TONE.md): the purpose is **realizing what you love** (affirmation), not deciding what to discard. "Which do you love more?", never "keep or let go?" Letting go follows; it is never the headline. Each object is a story — asked *forward* ("where will it go next?") and kept as a memento *after* a choice, never solicited as the prompt *for* one.

## 2. Owner decisions (settled 2026-06-23)

- **Scope:** all four epics (A→D) land this session; PR order and count are mine to choose.
- **Voice capture (purses-0a6): deferred.** Every capture feature ships **typed-first** (the issues already require a typed fallback always-present). Voice becomes its own later spec — no Web Speech vs server-transcription decision is forced now, and no grief-adjacent audio leaves the device this session.

## 3. Decomposition & sequencing

Five workstreams. Sequenced so each PR's foundation is built before its dependents, and the highest-certainty, lowest-risk work goes first to establish shared components (RoleBadge, the Onward section).

| PR | Epic | Scope | Depends on |
|----|------|-------|-----------|
| **PR1** | A — pv9 polish + role/profile | RoleBadge (c0w), profile page + name editing + session carries name (wew), MemberList/InviteForm design-system polish, PhotoDeleteControl verify, items-page test reconcile, InviteForm setTimeout cleanup (th14). **E2e:** extract shared fixtures (y1o), members+invitations spec (nvj), UI-login→protected-page (asz). | — |
| **PR2** | B — o93 results "letting go / Onward" | Split the `low`/Onward bucket out of "the full ranking" into a separate gentle, forward-framed section. Verify pairwise drives the ranking (scoring already landed by closed purses-h02). **E2e:** results-renders-Onward-separately. | — (B builds the container D fills) |
| **PR3** | C — gentle affordances | "I need a moment" pause (z76), "Not Mine — set aside" zero-engagement escape hatch (1an), undo after setting a session aside (2f3f). Evaluate defer/skip (x5u) for inclusion. | — |
| **PR4** | D — capture features (typed-first) | Rehome "Who would love this?" (oub) and story memento (ib3), both in the post-decision Onward surface PR2 builds. Voice (0a6) deferred. | PR2 (Onward section) |
| (folded) | E — e2e | y1o → PR1; asz/nvj → PR1; results spec → PR2; verify yuw (e2e already required+selective on main per memory). | per host PR |

**Verify, don't rebuild (purses-yuw):** memory `e2e-selective-required` says e2e is already a required, selective check on `main`. yuw is a verification + close, not new CI work, unless verification shows a gap.

## 4. Shared design language

These conventions hold across all four epics and are the reusable units.

### 4.1 RoleBadge (`src/features/collections/RoleBadge.tsx`) — NEW, used by A

A single component for displaying a membership role, reused everywhere a role appears (members list, profile, collection views).

- Source of truth: `memberships.role` (`"curator"`) and `collections.ownerId` (owner). **No global `user.role`** (purses-c0w decision).
- Wraps the existing `Badge` primitive; never raw hexes.
- **Colour is never the sole signal** (DESIGN.md): each role carries label + (optional) icon, distinguishable in greyscale.
  - **Owner** → a quiet distinguished badge (e.g. `info`/teal-family token + label "Owner").
  - **Curator** → neutral hairline badge + label "Curator".
- Roles are **not** ranked/shaming; this is identity, not a leaderboard. No "admin > member" hierarchy framing.

### 4.2 The Onward section — NEW container, built by B, filled by D

The lowest tier (`low` bucket = "Onward") renders as a **separate, gentle section** below the loved ranking — never mixed into "the full ranking" grid. Forward-framed heading ("Where these go next" / "Onward"), calm copy, no count-shaming, no red. This is the post-decision home for rehome + story (D).

### 4.3 Copy & motion guardrails (TONE)

- Affirmation framing only; no subtraction/cull/count-down language; no "too many".
- Forward-looking prompts ("where will it go next?"), never backward at the moment of choosing ("what did this mean to you?").
- Calm motion; honour `prefers-reduced-motion` (crossfade/instant). No confetti/streaks/scores.
- Tap-first, ≥44px targets, no swiping. WCAG 2.1 AA in **both** themes.

## 5. Epic A — pv9 polish + role/profile (PR1)

### 5.1 Profile page + display name (purses-wew)

**Current state:** `PATCH /api/users/me` already exists → `UserController.updateCurrentUser(id, body)`. `Header.tsx` already renders `session.user.name || session.user.email`. There is **no profile page**. The "UI display bug": `name` is not carried into the NextAuth session/JWT, so the header always falls through to email even when a name is set.

**Build:**
- `src/app/profile/page.tsx` — a calm profile surface (Server Component shell + a small `"use client"` form). Shows current name + email; lets the user set/edit a display name. Tap-first; ≥44px; reduced-motion safe.
- Profile form posts to the existing `PATCH /api/users/me`. Validate the name at the boundary (trim; bound length; reject empty-after-trim → unset, not error). Re-check input server-side; do not trust the client.
- **Fix the session carry:** ensure the NextAuth `jwt`/`session` callbacks include `name` so the header and profile reflect a freshly-set name without re-login (or refetch via `useSession().update()`). Confirm `nextjs-client-state-survives-router-refresh` semantics.
- Fallback: name → email local-part when name is unset (gentle, not "Anonymous").
- Reach profile from the header user area (top-right, per nav rules). Keep "Sign out" reachable.

**Tone:** the profile is *identity*, not configuration density. One field that matters (your name), shown with care. No settings-dashboard framing.

### 5.2 RoleBadge + surface it (purses-c0w)

- Build §4.1 RoleBadge.
- Surface the current user's role where they appear: members list, and (lightly) profile. Owner vs curator distinguished by label+token, never hue alone.
- **No new role concept.** Per-collection `memberships.role` + `collections.ownerId` only.

### 5.3 MemberList / InviteForm polish

- `MemberList.tsx`: now role-only badges (pv9 removed permission flags) — route them through RoleBadge; verify design-system conformance (tokens, spacing, ≥44px, AA).
- `InviteForm.tsx`: now email-only — polish to the design system; ensure the success/error surfaces use the shared `ErrorMessage`/live-region pattern.
- **purses-th14 (fold in):** the InviteForm success `setTimeout` has no cleanup → state update on unmounted component. Add cleanup (clear timer on unmount / effect teardown). Small, touches the same file.

### 5.4 PhotoDeleteControl — verify (any curator)

`PhotoDeleteControl.tsx` + test already exist; pv9 made delete available to any curator. **Verify** it conforms to the design system and the any-curator capability; polish only if it drifts. (`modal-in-card-needs-portal` applies if it overlays an interactive card.)

### 5.5 Items-page test reconcile

A pv9 note: the item-detail page test (`src/app/collections/[id]/items/[itemNumber]/page.test.tsx`) is intentionally **stricter than the API** (display drift). Reconcile: align the test's expectation with the shipped display contract, or document why the stricter assertion stands. Resolve the drift, don't paper over it.

## 6. Epic B — o93 results "letting go / Onward" (PR2)

**Current state** (`results/[resultNumber]/page.tsx`): renders a 4-tier count grid, then `MostLovedHero` (rank 1) + a "The full ranking" grid over `ranked.slice(1)` — which **includes the `low`/Onward items mixed in**. Scoring is correct (purses-h02 closed: triage tier base + pairwise deltas + recompute bucket; Release/Onward excluded from ranked favorites).

**Change:**
1. Partition `ranked` into **loved** (`top`/`high`/`medium`) and **onward** (`low`). "The full ranking" renders only the loved set. The hero is rank-1 of the loved set.
2. Render **onward** as a separate §4.2 gentle section beneath the loved ranking: forward-framed heading, calm copy, ItemCards reusing the value-ramp `tier-onward` tokens. No red, no count-shaming, no "released" finality language.
3. Empty-state grace: if there is no onward set, the section is simply absent (not an empty "nothing to let go" panel). If there is *only* an onward set (rare), still lead with affirmation copy.
4. **Verify pairwise drives ranking:** confirm via test/e2e that a pairwise choice changes displayed order (h02 fixed the discard bug; this is a regression guard, not new scoring).

**Reduced motion / a11y:** section is semantic (`<section>` + heading); ramp tokens AA in both themes; tap-first.

## 7. Epic C — gentle affordances (PR3) — direction

Refined to implementation resolution at PR3 plan time. Acceptance below.

- **"I need a moment" pause (purses-z76):** an always-available, low-emphasis affordance during triage/compare to pause and step away. Saves position; returns gently. Not a modal interruption; a quiet exit. No "are you sure you want to quit?" pressure.
- **"Not Mine — set aside" (purses-1an):** a **zero-engagement** escape hatch — an item that was never theirs to weigh (a child's, a partner's) is set aside with no decision, no tier, no story prompt. Distinct from Onward (deliberately rehomed) and from skip (deferred). Surfaced in triage.
- **Undo after setting a session aside (purses-2f3f):** setting a sort session aside is reversible; a gentle, non-destructive undo/confirmation. No data loss; no "are you sure" alarm.
- **Evaluate skip/defer (purses-x5u):** the compare flow already demotes Tie/Skip to ghost actions (o93 design layer). If a distinct "defer this hard pair for now" affordance adds value beyond Skip, include it; else note as covered.

**Acceptance (C):** each affordance is reachable tap-first ≥44px, reversible, non-shaming, reduced-motion safe; none introduces urgency or a count. Real component tests + e2e for the new interactions.

## 8. Epic D — capture features, typed-first (PR4) — direction

Lives in the post-decision Onward surface (PR2). Refined at PR4 plan time.

- **Rehome "Who would love this?" (purses-oub):** on an Onward item, an optional forward prompt — "Who would love this?" — capturing a recipient/place as **free text** (minimum). Optional, never required, never gates a decision. Per owner refinement: the forward *name* may also be reachable from triage; any *backward* note stays post-decision. Default private; opt-in to surface on shared results ("For Sarah" grouping) is **out of scope** for this PR (free-text capture + display only).
- **Story memento (purses-ib3):** on an Onward item (post-decision), an optional photo + short caption memento, prompted **forward**. Never required; never gates. Default private.
- **Voice (purses-0a6): deferred** — typed inputs only this session; a typed fallback is the permanent baseline regardless.

**Data:** prefer the smallest schema addition that holds free text on an item/result-item (e.g. an optional `note` / `rehomeTo` column or a lightweight related row). Exact schema decided at PR4 plan time with `postgres-review`. Validate at the boundary; bound length.

**Acceptance (D):** capture is optional, forward-framed, post-decision (story) / forward-reachable (rehome name); typed with clear save/edit/clear; private by default; AA + reduced-motion + ≥44px. Real tests; at least one un-mocked layer crossing.

## 9. Testing strategy

- **Unit/component (every PR):** new components/pages get jsdom + `@testing-library` tests (`component-test-recipe`: per-file `// @vitest-environment jsdom`). Coverage merged floor (82) gates — union of unit + db tiers (`coverage-merged-floor`).
- **DB-backed (where a real layer is crossed):** behind `RUN_DB_TESTS=1`, serial (`parallel-test-workflow`: parallel authors don't run bd/commit concurrently; DB tests share one ephemeral Postgres → serial).
- **E2e (required, selective — every UI PR triggers it):** auth via `e2e/fixtures` (no /login UI driving except the explicit asz spec); tablet+phone+desktop viewports (`e2e-harness-shape`). Add e2e for new/changed UI. Extract shared locators to `e2e/fixtures/ui.ts` (y1o) in PR1.
- **TDD:** failing test first, then minimal code (CLAUDE.md global override: YAGNI does not apply to tests; every non-trivial branch/error path tested).

## 10. Screenshots (hard rule)

Every UI PR ships **inline light+dark screenshots** in the body (`ui-prs-include-screenshots`, `pr-screenshots`): `npm run screenshots` (extend `e2e/screenshots/capture.ts` `surfaces` to the changed screens), then release+embed per `docs/cookbook/add-images-to-pr.md`. Verify in the **signed-in** browser (anonymous 404 on a private-repo asset is expected).

## 11. Out of scope / deferred

- Backend/authz changes (pv9 done). Pages fetch via `XController.fromDb(db)` in Server Components; repos import-private.
- Voice capture (0a6) — its own later spec.
- Sharing rehome/story groupings on **shared/finalized** results (capture + private display only this session).
- Multi-curator preference independence (purses-k3f), pool grouping (purses-1xr), background removal (purses-k2x) — unrelated.
- Migration NOTICE purses-h6a (duplicate invitations.token index) — ignore unless it blocks.

## 12. Risks

- **wew session-carry:** NextAuth JWT/session callback changes can desync header/profile. Mitigate with `useSession().update()` and an e2e that sets a name then asserts the header reflects it.
- **B partition correctness:** ensure `manualBucket || computedBucket` is the single source for the loved/onward split (matches the count grid). One helper, used by both the counts and the partition, prevents drift.
- **D schema creep:** keep capture to the smallest free-text addition; resist a "recipients model" until a second consumer demands it (YAGNI).
