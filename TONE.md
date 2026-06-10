# Tone Contract

The standard this product's expression is held to — voice, copy, color, motion, naming, and the felt quality of interaction.

This contract is **first-order**: the app conforms to it, not the reverse.

## Scope

TONE governs the *felt quality* of the product across every medium — words, color, motion, layout, naming. It is medium-agnostic and states **constraints, not mechanisms**: what the experience must feel like, never a specific hex, type scale, or motion curve.

The concrete visual and motion system that delivers that feel lives in [`DESIGN.md`](DESIGN.md), which is **accountable to this contract** — every token, rule, and component it defines must pass the litmus test below. (Words have no separate spec document yet; until one exists, copy answers to TONE directly.)

Rule of thumb: a *constraint* ("motion is unhurried; nothing snaps for attention") belongs here; a *mechanism* ("240ms ease-out; reduced-motion → instant crossfade") belongs in `DESIGN.md`. TONE never names a hex or a duration; `DESIGN.md` never re-litigates the feel.

## Authority

The app meets this contract. It does not bend the contract to suit a screen, a feature, or a deadline, and there are no local exceptions. When a design appears to need one, the contract is what gets revisited — deliberately, in writing, in this file — and only then does the app follow. An exception is an amendment here, never a quiet precedent set in code.

## Root

This product helps a person recognize what they love among their things, one at a time. It is a calm, affirming, judgement-free space, and its register is warmth held in restraint. Tone is an act of care; this contract is that care made explicit.

## Commitments

Five commitments. Each states what we do and the inverse it forbids.

1. **Affirmation, not subtraction.** We name what is loved. The work is discovering what matters, never culling what doesn't; letting go is a quiet consequence, never the headline.
   *Forbidden:* removal / cull / count-down framing, "keep or discard," tallying what's gone.
   *e.g.* Ask "Which do you love more?" and title results "What you love most" — not "Keep or discard?" or a running count of what's been culled.

2. **Each object is a story, not a thing.** An item is the visible end of something a person lived — who it came from, where it has been, what it holds. We honor that story, but we ask it **forward** ("where will it go next?") and keep it as a **memento after** a choice is made — never solicit it as the prompt *for* one. A story offered before a decision deepens the grip; a story kept after it sets the object free.
   *Forbidden:* inventory, catalog, SKU or data-row density, "track / manage your stuff," reducing an object to its attributes, cart or acquisition framing, and asking backward-looking sentiment ("what does this mean to you?") at the moment of choosing.
   *e.g.* After something is set down, offer "Where will it go next?" with a photo-and-caption keepsake — not a required "Why does this matter to you?" field before the choice is made.

3. **One thing at a time.** We meet the person in a single, low-load moment and never present the whole pile.
   *Forbidden:* dense grids, dashboards, everything-at-once, choices stacked on choices.
   *e.g.* Center one item with the next out of view — not a wall of forty thumbnails above a "sort all" button.

4. **Unpressured and forgiving.** Unhurried, patient, reversible. The person sets the pace, can stop and return, and is never made to feel watched or counted against.
   *Forbidden:* urgency on routine actions, shame ("too many"), destructive surprises, streak or completion guilt, deadlines.
   *e.g.* Keep "Set this aside for now" and undo always within reach — not a "5 still undecided" badge, a streak counter, or "finish today."

5. **Calm is the baseline, warmth is the texture, play is a rare grace note.** Restraint by default. Warmth lives in small, soft moments; playfulness is a light touch, never a system.
   *Forbidden:* gamification, confetti / streaks / scores-as-reward, loud celebration, stimulation used to drive engagement.
   *e.g.* A soft crossfade between items and one warm accent — not confetti on completion, a bouncing "Nice!", or saturated alert colors.

## The floor

When commitments pull against each other, **gentleness wins.** Commitments 3 and 4 are the floor: any affirmation, warmth, delight, or play that risks pressuring, overwhelming, or performing yields to them. Affirmation is the direction we move; gentleness is the line we do not cross.

## Restraint is not minimalism

Calm is a stance toward stimulation and load, never a mandate to strip the interface bare.
Adored is **aesthetic, not minimalist**: rich, warm, and colour-forward — the photograph
is lush, the palette is a protagonist, the craft is visible — all held in calm. Restraint
governs noise (few choices at once, no gamification, quiet motion, no clutter), not beauty. We
never drain richness for its own sake, and "more minimal" is not, in itself, "better." Where the
Nielsen "aesthetic and minimalist" heuristic is applied to this product, **aesthetic is the goal;
minimalism is not** — reward beauty and clarity, not bareness.

*Forbidden:* sterile stripped-down minimal-UI framing, monochrome-for-restraint, removing warmth,
colour, or ornament "to look cleaner," treating empty space as automatically superior to a
crafted, colour-rich surface.

This does not loosen the floor: commitments 3 (one thing at a time) and 4 (unpressured) still win.
Richness is held *within* calm — it is never licence to add clutter or load.

## The litmus test

For any word, color, motion, or layout, ask: does it speak from the **person's side** — what they feel about their things — or the **machine's side** — what the software does to them? If it reads from the machine's side, rewrite it.
