# PROPOSAL (owner review required): collapse the session URL tier — /sort as the hub

**Date:** 2026-07-17 · **Bead:** purses-znkt.3 · **Status: NOT approved, NOT implemented.** This is the L-sized reconciliation item; per workflow it needs your sign-off, then its own adversarial spec review, before any plan.

## The idea (wireframes' shape)

The wireframes have no session tier: `Sort` IS the hub ("Hub recommends a round → timed round → back to hub"; the word "session" appears nowhere). The product nests everything under `/sort/[sessionNumber]/…`, exposing session machinery in URLs, breadcrumbs, and copy.

Proposed shape:
- `/collections/[id]/sort` becomes the round-chooser hub directly: the RecommendedRound card + the three round cards + analytics live HERE (today they're one level down).
- Rounds move up a tier: `/sort/triage`, `/sort/usage`, `/sort/compare` (no number in the URL).
- The active session is auto-created/reused server-side on first entry — `sessions_active_unique` already guarantees at most one open per curator, so "the current session" is derivable without a URL segment. (The overnight one-tap work half-way proves this: it creates with defaults and lands in a round.)
- Session history ("Earlier passes") stays on the hub; a past session's detail could live at `/sort/passes/[number]` or fold into analytics.

## Why it's L, and the risks to weigh

- **Route moves with real blast radius:** triage/usage/compare pages, RoundSurface/hub wiring, breadcrumbs, the authz-enumeration suite, many e2e specs, deep links in copy/emails (none known), and the pause/resume flows that today navigate via `/sort/[n]`.
- **Two-tab semantics:** with no number in the URL, two tabs can't point at different sessions (today they can, though the one-open invariant makes that mostly moot).
- **Set-aside undo + session numbers in analytics** need re-homing decisions.
- **Migration:** old `/sort/[n]/…` URLs need guard-first permanent redirects (the pattern #`feat/sort-flow-polish` just established for the shelf).

## Recommendation

Do it, but as its own epic after the current sweep settles: the voice/one-tap changes just shipped deliver most of the felt benefit; the URL collapse is structural hygiene whose payoff is coherence, not a user-visible feature. If you approve, I'll run the full spec → adversarial review → plan cycle on it.

**Decision needed from you:** approve direction / modify / decline (and whether `/sort/passes/[number]` history detail is wanted at all).
