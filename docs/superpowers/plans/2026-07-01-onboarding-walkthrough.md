# Plan — Onboarding walkthrough (bead purses-ka23)

Spec: `docs/superpowers/specs/2026-07-01-onboarding-walkthrough-design.md` (approved + review folded). Execute via subagent-driven-development. Client-only, no DB.

## Global constraints (bind every task + review)
- **Copy is verbatim from the spec** (the five beats). Copy rule: **at most one adjective/adverb per sentence, prefer zero** — do NOT pad. Purpose screen must contain "Adored isn't a store"; nowhere may use marketplace/price/buy/cart/"shop" language.
- **No DB, no API calls, no new dependencies.** Reuse existing DS components (`TierBadge`, `Button`, `Card`, Playfair, tokens). Scripted flow = local React state only.
- **a11y:** skippable at every beat; tap-first, no swipe; touch targets ≥44px (`h-11`); reduced-motion respected (no essential motion); WCAG AA both themes; top-left back/breadcrumb + top-right user area conventions where the chrome shows.
- **Earned aha:** the compare choice drives the Standing — the picked item ranks above the passed-over one; triage tiers group the rest.
- **Standard testing discipline** (new feature): real behavioral tests that run in CI (`npm run test:ci`).

## Task 1 — The walkthrough flow (`/welcome`)
Files:
- `public/onboarding/` — copy ~5 curated OBJECT images (from `e2e/fixtures/demo-images/` accessories set — no people/animals/landscapes) so they render with no DB/Blob. Keep names stable.
- `src/features/onboarding/sampleData.ts` — ~5 sample items `{ id, name, imageSrc }` (names like "The tan leather tote") + a pure `buildStanding(compareWinnerId, triageChoices)` that returns the ranked list (winner above loser; Love/Like above Maybe above Onward). Unit-tested.
- `src/features/onboarding/WalkthroughShell.tsx` — holds step index + collected choices; renders the active beat; a quiet persistent "Skip for now" (calls onDismiss + routes to `/collections`); reduced-motion-aware (no essential transition).
- Beat components (one file each): `WelcomePurpose`, `WelcomeTriage` (one item on screen, four `TierBadge` tiers), `WelcomeCompare` (two items, prompt dominant, a choice between yours — not shop cards), `WelcomeStanding` (ranked rows + most-loved hero, from `buildStanding`), `WelcomeHandoff` (CTA → new-collection flow; quiet "I'll explore on my own").
- `src/app/welcome/page.tsx` — renders the shell (client). Playfair hero on Purpose.

Tests (`*.test.tsx`): each beat renders its verbatim copy; a tap advances (triage/compare); "Skip for now" fires dismiss; `buildStanding` ranks the picked item above the passed-over (both outcomes) and orders tiers; copy-guard test (purpose has "isn't a store"; no marketplace/price/buy/cart language anywhere in the beats); reduced-motion + ≥44px assertions.

## Task 2 — Trigger, re-open, dismissal
Files:
- **First-run gate (one place):** on the authed collections entry, if the user has zero collections AND not dismissed → send to `/welcome`. (Server-component reads collections count it already has; dismissal is client — so the gate is a small client check on the collections page, or a `WelcomeGate` client component. Keep it in ONE place; do not scatter.)
- **Dismissal:** `localStorage` key (e.g. `adored-welcome-dismissed`); set on Skip and on Hand-off completion. Re-open does NOT clear it.
- **Re-open:** a quiet "How Adored works" link on `/profile` → `/welcome`.

Tests: zero-collections + not-dismissed → the gate routes to `/welcome`; dismissed → does not; the `/profile` link points at `/welcome`; re-open leaves the flag set.

## Out of scope
Building/pool/members/sharing/finalize; a new Header menu; seeded real data; server-side dismissal; video; gamified progress.

## Done = 
build + lint + `test:ci` green; light/dark screenshots of the 5 beats captured for the PR; whole-branch adversarial review (UX + Graphic-Design + tone + a11y) clean; merged.
