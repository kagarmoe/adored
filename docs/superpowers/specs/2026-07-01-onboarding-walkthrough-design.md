# Design — New-user onboarding walkthrough (bead purses-ka23)

Status: DRAFT for review. Governing authorities: `PRODUCT.md`, `TONE.md`. Brainstormed 2026-07-01.

## Problem
People shown Adored read it as a **marketplace** and miss that it is for **sorting** — noticing which of the things you already own you love most. The first run must install that mental model before teaching any mechanic. If a new user leaves thinking "shop," the walkthrough failed.

## Goal
A calm, skippable first-run sequence that (1) states the purpose and contrasts it with a store, then (2) lets the person *feel* the core loop — triage → compare → "what you love most" — on sample content, then (3) hands off to their own things. Success = a new user can say "it helps me see which of my own things I love most," not "it's a place to buy things."

## Approach (decided)
- **Name it + contrast, then show.** Lead with the purpose and the "not a store" contrast; reinforce by doing a tiny sort.
- **Scope = the core loop only.** Triage a couple → one compare → land on Standing. No building/pool/members/sharing/finalize in first run (those violate "one decision at a time" and "sharing is after-the-fact").
- **Scripted/static demo, not real data.** A self-contained client sequence over bundled sample items + a few committed demo images served from `public/`. No DB writes, no Blob dependency, nothing left in the account. Disposable.

## The five beats (final copy)
Copy rule (applies to every line): **at most one adjective/adverb per sentence — and prefer zero.** It is a ceiling, not a quota: nouns and verbs carry the meaning, and any adjective/adverb earns its place or gets cut. No coloratura. Person-side, calm, no gamification, no shaming.

1. **Purpose** — the anti-marketplace screen.
   - Hero (Playfair): **"Rediscover what you love."**
   - Framing (two sentences): **"Adored isn't a store. It's a way to notice which of your things you love most, one gentle choice at a time."**
   - Actions: **"Show me how"** (primary) · quiet **"Skip for now"**.
2. **Triage** (~2 taps) — one sample object at a time with the four tiers (Love/Like/Maybe/Onward, `TierBadge` tokens).
   - Prompt: **"How do you feel about this one?"**
   - Coach: **"Tap how you feel. There are no wrong answers."**
3. **Compare** (1 tap) — two sample things side by side.
   - Prompt: **"Which do you reach for more?"**
   - Coach: **"When two feel close, this shows which you reach for."**
4. **Standing** — the payoff + reframe. Lands on **"What you love most"**: the sample items ranked, `TierBadge` rows, most-loved hero.
   - Copy: **"That's it — Adored showed you what you love most, from things you own."**
5. **Hand-off** — to their world.
   - Copy: **"Now, your turn."** + **"Add a few things you own to start a collection."**
   - Primary CTA → the real new-collection / add-photos flow; quiet **"I'll explore on my own."**

## Behavior
- **Trigger:** signed-in user with zero collections, walkthrough not yet dismissed → the walkthrough shows (route to `/welcome`, or a first-run gate on `/collections`). Users with collections never see it unless they re-open it.
- **Skippable** at every beat ("Skip for now" / a close affordance). **Re-openable** later from the user menu ("How Adored works").
- **Dismissal** remembered in `localStorage` (device-local; v1 — no schema/migration). A user-pref flag is a possible later upgrade if cross-device matters.
- Advancing a beat is local state only — the triage/compare taps drive a scripted sequence; the Standing screen shows a pre-determined sample ranking. No API calls.

## Architecture
- A dedicated **`/welcome`** route (client) with a `WalkthroughShell` holding step state + a "Skip" affordance, and one component per beat: `WelcomePurpose`, `WelcomeTriage`, `WelcomeCompare`, `WelcomeStanding`, `WelcomeHandoff`.
- **Sample data:** a small static module (~5 sample items: name + image path) referencing a curated handful of the committed demo images, copied into `public/onboarding/` so they render with no DB/Blob. (Sidesteps the `dpzc` render gap for onboarding specifically.)
- **Reuse the design system** — `TierBadge`, `Button`, `Card`, Playfair display, the palette tokens. No new primitives unless the DS review surfaces one.
- **First-run gate:** on the authed entry (collections page / post-login), if zero collections and not dismissed, send to `/welcome`. Keep the check in one place; do not scatter it.

## Tone & accessibility (non-negotiable)
- Person-side, affirming, **no gamification** (no confetti/scores/streaks/progress-%), **no shaming**, one decision at a time.
- Skippable throughout; **tap-first, no swiping**; touch targets ≥ 44px; **reduced-motion** respected (no essential motion; instant/static fallbacks); WCAG 2.1 AA in light and dark.
- **At most one adjective/adverb per sentence, prefer zero** — a ceiling, not a quota (no coloratura). Implementers and DS drafts must not pad copy up to the limit. A TONE-level principle worth folding into `TONE.md` in a later, deliberate amendment — not changed here.

## Design-system collaboration
After this spec is approved, the five screens are **drafted into the Adored design system on claude.ai/design** (via DesignSync) for the user to refine, then implemented in-app from the refined screens. (Requires the user's go for DesignSync access.)

## Testing
- Component tests per beat: renders the finalized copy; a tap advances (triage/compare); "Skip for now" exits; the hand-off CTA points at the new-collection flow.
- Copy guard: the purpose screen contains "isn't a store" and no marketplace/price/buy language.
- Trigger/dismissal: zero-collections + not-dismissed → shows; dismissed → does not; re-open path works.
- a11y: reduced-motion path renders without essential motion; tap targets ≥ 44px; both themes AA.
- (Standard testing discipline — this is a new feature, so real behavioral coverage; the plain-ponytail test stance was scoped only to the code-health refactor.)

## Out of scope (YAGNI)
Building/pool/members/sharing/finalize in first run; video; account-setup steps; gamified progress; seeded real sample data; server-side dismissal state.
