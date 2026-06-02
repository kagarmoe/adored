# Product

## Register

product

## Users

One person, making decisions about their own things. The primary user is often **grieving** — sorting belongings under real emotional weight. The work is fundamentally about **realizing what they love most**, one item at a time; letting go is the connected consequence of that clarity, not the goal they set out with. They are not a power user optimizing a workflow; they are someone doing something tender and hard.

Sharing exists, but it is an *after-the-fact* step: once a ranked list is complete, it can be shared. PurseInator is not a collaboration tool and never asks the user to coordinate with others mid-decision.

## Product Purpose

PurseInator helps one person discover what they love most in a collection, and arrive at a confident ranking of it. The work happens in phases — triage, then pairwise comparisons ("which do you love more?"), then results — so the user never faces the whole pile at once. Success is the user reaching a finished, ranked list they trust, feeling that the things they cherish have been *recognized* — and feeling settled rather than drained. The completed list can then be shared. Letting go, where it happens, follows naturally from knowing what matters most.

It exists because surfacing what you truly love is emotionally and cognitively heavy, and existing tools (catalogs, inventory apps, shopping sites) treat belongings as stock to be counted, not as things that matter to a person.

## Brand Personality

**Calm, judgement-free, gently encouraging — with a light touch of playfulness.**

The voice is warm and unhurried. It never counts against the user ("you have too many"), never rushes, never celebrates loudly. Playfulness shows up as small, soft moments of warmth, never as gamification (no confetti, streaks, scores-as-rewards, or pressure). It holds space for someone doing something difficult.

## Anti-references

- **Not a catalog.** No dense inventory grids, no SKU-like density, no "browse the collection" framing.
- **Not a storage / inventory platform.** It is not about tracking what you own or counting stock.
- **Not a shopping site.** No cart affordances, no acquisition framing, no "add more."
- Also avoid: gamified habit-tracker energy (confetti, streaks, points), busy enterprise dashboards (KPI tiles, everything-at-once), and cold spreadsheet UIs that make personal objects feel like rows of data.

## Design Principles

1. **One decision at a time.** Never show the whole mountain. Reduce what's on screen to the single choice in front of the user; the phased flow (triage → pairwise → results) is the product's core mercy. Actively avoid cognitive overload.
2. **Affirmation, not subtraction.** Frame the work as discovering what you love, not culling what you don't. Prefer "which do you love more?" over "keep or discard?"; celebrate favorites rather than tallying removals. Letting go is honored when it comes, but it is never the headline.
3. **Judgement-free space.** No framing that shames or pressures — no "too many," no efficiency scolding, no loud completion metrics. Neutral, supportive language throughout.
4. **Gentle by default.** Grief-aware pacing: unhurried transitions, encouraging copy, forgiving interactions (easy undo, no destructive surprises). The user can stop and come back without penalty.
5. **Treat the objects with care.** Photos are prominent and shown respectfully. Items are things that matter to a person, not data rows; the curatorial frame wins over the inventory frame.
6. **Calm over stimulation, with warmth in the moments.** Restraint is the baseline. The touch of playfulness appears as small, soft beats — never as a system of rewards.
7. **Finish, then share.** Sharing is an outcome of completed work, not a social loop woven through the experience.

## Accessibility & Inclusion

- **Target: WCAG 2.1 AA.** Body text ≥4.5:1 contrast, full keyboard operability, visible focus states, semantic structure.
- **Grief-aware as an accessibility concern.** A gentle, encouraging, low-cognitive-load space is a requirement, not a nicety, given the primary user's emotional state. Minimize choices per screen; avoid alarming colors and urgent affordances for routine actions.
- **Reduced motion honored.** Every animation needs a `prefers-reduced-motion: reduce` alternative (crossfade or instant).
- **Tablet-first, tap-first interaction.** Taps are the primary affordance and there is **no swiping**. Dragging *is* permitted where it genuinely helps (e.g. reordering results, moving items between buckets). Touch targets ≥44px.
- **Color-blind-safe distinctions.** Bucket / category distinctions must not rely on hue alone (pair with label, icon, or position).
